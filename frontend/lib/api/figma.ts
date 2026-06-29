/**
 * Figma REST API client — all calls routed through the backend proxy at
 * /api/design/figma/* (the Figma REST API has no permissive CORS, unlike GitHub).
 * The personal access token travels in the X-Figma-Token header; the proxy
 * forwards it server-side. The token is never persisted (see session-store).
 */

import { apiRequest } from "./client";
import type { ExternalIssue } from "./github-browser";

const CHAR_LIMITS = {
  frameList: 4_000,
  comments: 2_000,
} as const;

// ---------------------------------------------------------------------------
// Types (only the fields we use)
// ---------------------------------------------------------------------------

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  transitionNodeID?: string | null;
}

export interface FigmaFile {
  name: string;
  lastModified: string;
  document: FigmaNode;
}

export interface FigmaFrame {
  node_id: string;
  name: string;
  page: string;
}

export interface FigmaFlowEdge {
  from_name: string;
  to_name: string;
}

export interface FigmaComment {
  id?: string;
  message: string;
  user?: { handle?: string };
  resolved_at?: string | null;
  order_id?: string;
}

/** A file row from GET /projects/{id}/files. */
export interface FigmaProjectFile {
  key: string;
  name: string;
  thumbnail_url?: string;
  last_modified?: string;
}

function figmaHeaders(token: string): Record<string, string> {
  return { "X-Figma-Token": token };
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

/** Extract { fileKey, nodeId } from a Figma file/design URL or a bare file key. */
export function parseFigmaUrl(input: string): { fileKey: string; nodeId: string | null } {
  const value = input.trim();
  // Bare key (no slashes / not a URL).
  if (!value.includes("/")) return { fileKey: value, nodeId: null };
  const m = value.match(/figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)/);
  const fileKey = m ? m[1] : "";
  let nodeId: string | null = null;
  try {
    const url = new URL(value);
    const raw = url.searchParams.get("node-id");
    nodeId = raw ? raw.replace(/-/g, ":") : null;
  } catch {
    /* not a full URL — leave nodeId null */
  }
  return { fileKey, nodeId };
}

/** Build a deep link back to a specific node in the Figma file. */
export function figmaNodeUrl(fileKey: string, nodeId: string): string {
  return `https://www.figma.com/design/${fileKey}?node-id=${nodeId.replace(/:/g, "-")}`;
}

/**
 * Extract a project id from a Figma project URL, or null if it isn't one.
 * Handles `figma.com/files/project/{id}/…` and the `…/team/…/project/{id}/…`
 * and `…/files/{org}/project/{id}/…` variants. Project ids are numeric.
 */
export function parseFigmaProjectUrl(input: string): { projectId: string } | null {
  const m = input.trim().match(/figma\.com\/files\/(?:[^/]+\/)*project\/(\d+)/);
  return m ? { projectId: m[1] } : null;
}

// ---------------------------------------------------------------------------
// API calls (via proxy)
// ---------------------------------------------------------------------------

/** Verify a file is reachable; returns its name + last-modified. Throws on a bad token/key. */
export async function figmaVerifyFile(token: string, fileKey: string): Promise<{ name: string; lastModified: string }> {
  const file = await apiRequest<FigmaFile>(`/api/design/figma/files/${fileKey}?depth=1`, {
    headers: figmaHeaders(token),
  });
  return { name: file.name, lastModified: file.lastModified };
}

/** Fetch the file document tree, bounded by depth (default 2 = pages + top-level frames). */
export function figmaGetFile(token: string, fileKey: string, depth = 2): Promise<FigmaFile> {
  return apiRequest<FigmaFile>(`/api/design/figma/files/${fileKey}?depth=${depth}`, {
    headers: figmaHeaders(token),
  });
}

/**
 * List the files in a Figma project (for the project picker). Requires a PAT with
 * the `projects:read` scope — a token that only carries `file_content:read` gets a
 * 403 here (surfaced to the user as a re-mint prompt). Routes through the proxy.
 */
export async function figmaGetProjectFiles(token: string, projectId: string): Promise<FigmaProjectFile[]> {
  const data = await apiRequest<{ files?: FigmaProjectFile[] }>(`/api/design/figma/projects/${projectId}/files`, {
    headers: figmaHeaders(token),
  });
  return data.files ?? [];
}

/** Top-level comments on the file (for design-review context). */
export async function figmaGetComments(token: string, fileKey: string): Promise<FigmaComment[]> {
  const data = await apiRequest<{ comments?: FigmaComment[] }>(`/api/design/figma/files/${fileKey}/comments`, {
    headers: figmaHeaders(token),
  });
  return data.comments ?? [];
}

/** Unresolved Figma comments → maintenance ExternalIssue rows (ext_ref `figma#<id>`). */
export function figmaCommentsToIssues(comments: FigmaComment[]): ExternalIssue[] {
  return comments
    .filter((c) => !c.resolved_at && c.message.trim())
    .map((c) => {
      const handle = c.user?.handle?.trim();
      const msg = c.message.trim().replace(/\s+/g, " ");
      return {
        ext_ref: `figma#${c.id ?? c.order_id ?? msg.slice(0, 12)}`,
        subject: msg.length > 80 ? `${msg.slice(0, 79)}…` : msg,
        description: handle ? `${msg}\n\n— ${handle} (Figma comment)` : msg,
      };
    });
}

/** Fetch + convert unresolved Figma comments to maintenance issues. */
export async function figmaSyncIssues(token: string, fileKey: string): Promise<ExternalIssue[]> {
  return figmaCommentsToIssues(await figmaGetComments(token, fileKey));
}

// ---------------------------------------------------------------------------
// Design-system tokens (#1) — named color/text/effect styles + component inventory
// ---------------------------------------------------------------------------

export interface FigmaColorToken {
  name: string;
  hex: string;
}

export interface FigmaDesignTokens {
  colors: FigmaColorToken[];
  text_styles: string[];
  effects: string[];
  components: string[];
}

const TOKEN_CAPS = { colors: 30, text: 24, effects: 16, components: 60, hexNodes: 50 } as const;

interface FigmaStyleMeta {
  node_id?: string;
  name?: string;
  style_type?: string;
}
interface FigmaComponentMeta {
  name?: string;
}

/** Published local styles (color/text/effect) — names + node ids. Empty when no library. */
export async function figmaGetPublishedStyles(token: string, fileKey: string): Promise<FigmaStyleMeta[]> {
  const data = await apiRequest<{ meta?: { styles?: FigmaStyleMeta[] } }>(`/api/design/figma/files/${fileKey}/styles`, {
    headers: figmaHeaders(token),
  });
  return data.meta?.styles ?? [];
}

/** Published components — the component inventory (names). */
export async function figmaGetPublishedComponents(token: string, fileKey: string): Promise<FigmaComponentMeta[]> {
  const data = await apiRequest<{ meta?: { components?: FigmaComponentMeta[] } }>(
    `/api/design/figma/files/${fileKey}/components`,
    { headers: figmaHeaders(token) },
  );
  return data.meta?.components ?? [];
}

/** Resolve the given node ids → their documents (used to read color-style hex values). */
export async function figmaGetNodes(token: string, fileKey: string, ids: string[]): Promise<Record<string, FigmaNode>> {
  if (!ids.length) return {};
  const q = encodeURIComponent(ids.join(","));
  const data = await apiRequest<{ nodes?: Record<string, { document?: FigmaNode }> }>(
    `/api/design/figma/files/${fileKey}/nodes?ids=${q}&depth=0`,
    { headers: figmaHeaders(token) },
  );
  const out: Record<string, FigmaNode> = {};
  for (const [id, payload] of Object.entries(data.nodes ?? {})) {
    if (payload?.document) out[id] = payload.document;
  }
  return out;
}

function rgbaToHex(color: { r?: number; g?: number; b?: number }): string {
  const ch = (v?: number) => Math.max(0, Math.min(255, Math.round((v ?? 0) * 255)));
  const h = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${h(ch(color.r))}${h(ch(color.g))}${h(ch(color.b))}`;
}

interface SolidFill {
  type?: string;
  visible?: boolean;
  color?: { r?: number; g?: number; b?: number };
}
function solidHex(node: { fills?: SolidFill[] } | undefined): string {
  for (const fill of node?.fills ?? []) {
    if (fill.type === "SOLID" && fill.visible !== false) return rgbaToHex(fill.color ?? {});
  }
  return "";
}

/**
 * Extract the file's design system — named color/text/effect tokens + components —
 * merging the published-library endpoints with the local `styles`/`components` maps
 * on the file response. Color tokens are enriched to hex via a single `/nodes` call.
 * All calls are advisory: a failure yields empty arrays, never throws.
 */
export async function extractDesignTokens(token: string, fileKey: string, file?: FigmaFile): Promise<FigmaDesignTokens> {
  const colors = new Map<string, string>(); // name -> node_id
  const textStyles: string[] = [];
  const effects: string[] = [];
  const seenText = new Set<string>();
  const seenEffect = new Set<string>();

  const addStyle = (name: string, styleType: string, nodeId = "") => {
    const n = (name ?? "").trim();
    if (!n) return;
    const st = (styleType ?? "").toUpperCase();
    if (st === "FILL") {
      if (!colors.has(n)) colors.set(n, nodeId);
    } else if (st === "TEXT" && !seenText.has(n)) {
      seenText.add(n);
      textStyles.push(n);
    } else if (st === "EFFECT" && !seenEffect.has(n)) {
      seenEffect.add(n);
      effects.push(n);
    }
  };

  const published = await figmaGetPublishedStyles(token, fileKey).catch(() => [] as FigmaStyleMeta[]);
  for (const s of published) addStyle(s.name ?? "", s.style_type ?? "", s.node_id ?? "");
  // Local styles map on the file response: { styleId: { name, styleType } }.
  const localStyles = (file as unknown as { styles?: Record<string, { name?: string; styleType?: string }> })?.styles ?? {};
  for (const [sid, meta] of Object.entries(localStyles)) addStyle(meta.name ?? "", meta.styleType ?? "", sid);

  // Hex enrichment for color tokens that carry a node id.
  const colorHex = new Map<string, string>();
  const colorNodeIds = [...colors.values()].filter(Boolean).slice(0, TOKEN_CAPS.hexNodes);
  if (colorNodeIds.length) {
    const nodes = await figmaGetNodes(token, fileKey, colorNodeIds).catch(() => ({} as Record<string, FigmaNode>));
    const nidToName = new Map([...colors.entries()].filter(([, nid]) => nid).map(([name, nid]) => [nid, name]));
    for (const [nid, doc] of Object.entries(nodes)) {
      const hex = solidHex(doc as { fills?: SolidFill[] });
      const name = nidToName.get(nid);
      if (hex && name) colorHex.set(name, hex);
    }
  }
  const colorTokens: FigmaColorToken[] = [...colors.keys()]
    .slice(0, TOKEN_CAPS.colors)
    .map((name) => ({ name, hex: colorHex.get(name) ?? "" }));

  // Components: published endpoint + local file.components map. Names only.
  const compNames: string[] = [];
  const seenComp = new Set<string>();
  const publishedComps = await figmaGetPublishedComponents(token, fileKey).catch(() => [] as FigmaComponentMeta[]);
  for (const c of publishedComps) {
    const n = (c.name ?? "").trim();
    if (n && !seenComp.has(n)) { seenComp.add(n); compNames.push(n); }
  }
  const localComps = (file as unknown as { components?: Record<string, { name?: string }> })?.components ?? {};
  for (const meta of Object.values(localComps)) {
    const n = (meta.name ?? "").trim();
    if (n && !seenComp.has(n)) { seenComp.add(n); compNames.push(n); }
  }

  return {
    colors: colorTokens,
    text_styles: textStyles.slice(0, TOKEN_CAPS.text),
    effects: effects.slice(0, TOKEN_CAPS.effects),
    components: compNames.slice(0, TOKEN_CAPS.components),
  };
}

/** Render the '## Design system' markdown block from extracted tokens ("" when empty). */
export function buildDesignTokensMarkdown(tokens: FigmaDesignTokens): string {
  const { colors, text_styles, effects, components } = tokens;
  if (!colors.length && !text_styles.length && !effects.length && !components.length) return "";
  const parts = ["## Design system"];
  if (colors.length) {
    const lines = colors.map((c) => `- ${c.name}${c.hex ? ` — ${c.hex}` : ""}`);
    parts.push(`### Color tokens\n\n${lines.join("\n")}`);
  }
  if (text_styles.length) parts.push(`### Text styles\n\n${text_styles.map((n) => `- ${n}`).join("\n")}`);
  if (effects.length) parts.push(`### Effect styles\n\n${effects.map((n) => `- ${n}`).join("\n")}`);
  if (components.length) parts.push(`### Components\n\n${truncate(components.join(", "), 2_000)}`);
  return parts.join("\n\n");
}

/** Render thumbnails for the given node ids → { node_id: url }. URLs are short-lived. */
export async function figmaThumbnails(token: string, fileKey: string, ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const q = encodeURIComponent(ids.join(","));
  const data = await apiRequest<{ images?: Record<string, string | null> }>(
    `/api/design/figma/images/${fileKey}?ids=${q}&format=png&scale=0.5`,
    { headers: figmaHeaders(token) },
  );
  const out: Record<string, string> = {};
  for (const [id, url] of Object.entries(data.images ?? {})) {
    if (url) out[id] = url;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Derivation (pure — from an already-fetched file document)
// ---------------------------------------------------------------------------

/** Top-level FRAME nodes per page (canvas) + prototype flow edges between them. */
export function deriveFramesAndFlows(file: FigmaFile): { frames: FigmaFrame[]; flows: FigmaFlowEdge[] } {
  const frames: FigmaFrame[] = [];
  const idToName = new Map<string, string>();
  const pages = file.document?.children ?? [];
  for (const page of pages) {
    if (page.type !== "CANVAS") continue;
    for (const node of page.children ?? []) {
      if (node.type !== "FRAME") continue;
      frames.push({ node_id: node.id, name: node.name, page: page.name });
      idToName.set(node.id, node.name);
    }
  }
  const flows: FigmaFlowEdge[] = [];
  for (const page of pages) {
    for (const node of page.children ?? []) {
      const target = node.transitionNodeID;
      if (target && idToName.has(node.id) && idToName.has(target)) {
        flows.push({ from_name: idToName.get(node.id)!, to_name: idToName.get(target)! });
      }
    }
  }
  return { frames, flows };
}

// ---------------------------------------------------------------------------
// Frame fingerprint (#2 per-frame drift) — pure, mirrors figma_fetch.frame_fingerprint
// ---------------------------------------------------------------------------

interface FigmaFrameNode {
  name?: string;
  absoluteBoundingBox?: { width?: number; height?: number } | null;
  children?: Array<{ type?: string; name?: string }>;
}

/** djb2 → 16-hex-char digest (dependency-free; values need only be stable, not cryptographic). */
function _shortHash(input: string): string {
  // Two independent 32-bit rolling hashes concatenated → 16 hex chars.
  let h1 = 0x811c9dc5;
  let h2 = 0x1505;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = ((Math.imul(h2, 33) + c) ^ (h2 >>> 5)) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/**
 * Stable structural fingerprint of a FRAME node. Hashes the frame name, its rounded
 * width×height, and the ordered `type:name` of its DIRECT children — catches a
 * rename, resize, or an added/removed/reordered element on THIS frame while ignoring
 * edits to other frames. Needs the frame's direct children (file fetched at depth ≥ 3);
 * a childless node still fingerprints on name + size. The digest differs from the
 * backend's sha1 form, so a frame is fingerprinted on ONE side (link + scan both use
 * THIS function) — the two are only ever compared against their own kind.
 */
export function figmaFrameFingerprint(node: FigmaFrameNode): string {
  const bbox = node.absoluteBoundingBox ?? {};
  const w = Math.round(bbox.width ?? 0);
  const h = Math.round(bbox.height ?? 0);
  const parts = [node.name ?? "", `${w}x${h}`];
  for (const child of node.children ?? []) parts.push(`${child.type ?? ""}:${child.name ?? ""}`);
  return _shortHash(parts.join("|"));
}

/**
 * Fingerprint every top-level FRAME in a file → { node_id: hash }. The file must be
 * fetched at depth ≥ 3 so each frame carries its direct children (a shallower fetch
 * still produces name+size fingerprints). Used at link time (capture baseline) and
 * scan time (compare) so per-frame drift only flags frames that actually changed.
 */
export function deriveFrameFingerprints(file: FigmaFile): Record<string, string> {
  const out: Record<string, string> = {};
  for (const page of file.document?.children ?? []) {
    if (page.type !== "CANVAS") continue;
    for (const node of page.children ?? []) {
      if (node.type !== "FRAME") continue;
      out[node.id] = figmaFrameFingerprint(node as unknown as FigmaFrameNode);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Story ↔ frame matching (pure — dependency-free token overlap)
// ---------------------------------------------------------------------------

const _STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "and", "or", "for", "in", "on", "with", "as",
  "is", "are", "be", "screen", "page", "view", "ui", "user", "able",
]);

function _tokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").split(/\s+/)
      .filter((w) => w.length > 1 && !_STOPWORDS.has(w)),
  );
}

/**
 * Best name-match frame for a story subject by Jaccard token overlap.
 * Returns the frame + score (0..1), or null when nothing clears `minScore`.
 */
export function suggestFrameForStory<T extends { node_id: string; name: string }>(
  subject: string,
  frames: T[],
  minScore = 0.34,
): { frame: T; score: number } | null {
  const a = _tokens(subject);
  if (a.size === 0) return null;
  let best: { frame: T; score: number } | null = null;
  for (const frame of frames) {
    const b = _tokens(frame.name);
    if (b.size === 0) continue;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    const score = inter / (a.size + b.size - inter);
    if (score > 0 && (!best || score > best.score)) best = { frame, score };
  }
  return best && best.score >= minScore ? best : null;
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(0, limit) + `\n\n... [truncated at ${limit} chars]`;
}

/** Assemble bounded markdown for figma-context.md from a file + its comments (+ optional tokens). */
export function buildFigmaContextMarkdown(file: FigmaFile, comments: FigmaComment[], tokens?: FigmaDesignTokens): string {
  const { frames, flows } = deriveFramesAndFlows(file);
  const sections: string[] = [];

  sections.push(
    `# Figma Design Context\n\n` +
    `**File:** ${file.name}  \n` +
    `**Last modified:** ${file.lastModified?.slice(0, 10) ?? "unknown"}  \n` +
    `**Synced:** ${new Date().toISOString().slice(0, 10)}`,
  );

  // Frames grouped by page.
  const byPage = new Map<string, string[]>();
  for (const f of frames) {
    if (!byPage.has(f.page)) byPage.set(f.page, []);
    byPage.get(f.page)!.push(f.name);
  }
  const frameLines: string[] = [];
  for (const [page, names] of byPage) {
    frameLines.push(`### ${page}`);
    for (const n of names) frameLines.push(`- ${n}`);
  }
  if (frameLines.length) {
    sections.push(`## Screens (frames)\n\n${truncate(frameLines.join("\n"), CHAR_LIMITS.frameList)}`);
  }

  if (flows.length) {
    const flowLines = flows.map((e) => `- ${e.from_name} → ${e.to_name}`).join("\n");
    sections.push(`## Prototype flows\n\n${flowLines}`);
  }

  if (tokens) {
    const tokensMd = buildDesignTokensMarkdown(tokens);
    if (tokensMd) sections.push(tokensMd);
  }

  if (comments.length) {
    const lines = comments
      .slice(0, 30)
      .map((c) => `- ${c.user?.handle ? `**${c.user.handle}:** ` : ""}${c.message}`)
      .join("\n");
    sections.push(`## Comments\n\n${truncate(lines, CHAR_LIMITS.comments)}`);
  }

  return sections.join("\n\n");
}

/** Connect (verify) + assemble the context markdown in one call (sidebar Sync). */
export async function fetchFigmaContextMd(token: string, fileKey: string): Promise<string> {
  const file = await figmaGetFile(token, fileKey, 2);
  const comments = await figmaGetComments(token, fileKey).catch(() => [] as FigmaComment[]);
  const tokens = await extractDesignTokens(token, fileKey, file).catch(() => undefined);
  return buildFigmaContextMarkdown(file, comments, tokens);
}
