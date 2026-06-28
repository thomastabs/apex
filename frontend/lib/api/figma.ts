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

/** Assemble bounded markdown for figma-context.md from a file + its comments. */
export function buildFigmaContextMarkdown(file: FigmaFile, comments: FigmaComment[]): string {
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
  return buildFigmaContextMarkdown(file, comments);
}
