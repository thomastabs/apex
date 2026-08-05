/**
 * Plane.so API calls routed through the FastAPI backend proxy
 * (backend/app/api/plane_proxy.py), mirroring taiga-direct.ts's shape.
 *
 * Read paths only (Phase 2 of the Plane integration — see plane_integration_plan
 * memory). Write paths (create/update/delete) land in a later phase; anything
 * not yet implemented here throws a clear "not yet supported" error from
 * plane-adapter.ts rather than silently doing nothing, per the pm-adapter-sync
 * skill's stub convention.
 *
 * Id shim: Plane's ids are UUIDs, but the shared `Epic`/`Story` types (used
 * well beyond the adapter layer, in board rendering etc.) type `id`/`ref` as
 * `number` — reused directly from Taiga's real numeric ids today. Rather than
 * widen that shared type (tried; it cascades into 30+ unrelated call sites
 * across board-section.tsx/phase1-workflow.tsx/command-palette.tsx that treat
 * Story.id as a real JS number), this module mints a synthetic per-session int
 * for `id` via mintId()/resolveId() below, uses Plane's own numeric
 * `sequence_id` directly for `ref` (no minting needed there), and carries the
 * real UUID in the new `pm_epic_id`/`pm_story_id` fields for any call that
 * needs to dial Plane again. The mapping is an in-memory module singleton —
 * it does not survive a page reload, so getEpic/getStory/etc. below throw a
 * clear error if asked to resolve an id from a session that never called
 * getBoard/listProjects first. Fine for Phase 2 (read paths, prove the entity
 * mapping); a persistent mapping is a later-phase concern if one ever proves
 * necessary (only the backend story-index shim — a different, still-deferred
 * concern for when Plane stories enter Apex's actual spec workflow — would
 * need one that survives a reload).
 */
import { ApiError, ApiNetworkError, getApiBaseUrl } from "./client";
import type { Epic, EpicWithStories, Me, Project, Story } from "./types";

const DEFAULT_PLANE_API = "https://api.plane.so";

export function isPlane401(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

// ---------------------------------------------------------------------------
// Id shim (see module docstring)
// ---------------------------------------------------------------------------

let _nextMintedId = 1;
const _uuidToMinted = new Map<string, number>();
const _mintedToUuid = new Map<number, string>();

export function mintId(realId: string): number {
  const existing = _uuidToMinted.get(realId);
  if (existing != null) return existing;
  const minted = _nextMintedId++;
  _uuidToMinted.set(realId, minted);
  _mintedToUuid.set(minted, realId);
  return minted;
}

export function resolveId(mintedId: string | number): string {
  const key = typeof mintedId === "number" ? mintedId : parseInt(mintedId, 10);
  const uuid = _mintedToUuid.get(key);
  if (!uuid) {
    throw new ApiError(
      404,
      `Unknown Plane id ${mintedId} — the board must be re-fetched (its id mapping is session-local and does not survive a reload).`,
    );
  }
  return uuid;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

export function getPlaneApiBaseUrl(input?: string) {
  const configured = input || DEFAULT_PLANE_API;
  const trimmed = configured.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/api/v1") ? trimmed.slice(0, -"/api/v1".length) : trimmed;
}

const _MAX_429_RETRY_WAIT_MS = 5_000;

async function planeFetch<T>(
  path: string,
  apiKey: string,
  apiBaseUrl?: string,
  options?: { method?: string; body?: unknown; retried?: boolean },
): Promise<T> {
  const planeUrl = getPlaneApiBaseUrl(apiBaseUrl);
  const url = `${getApiBaseUrl()}/api/pm/plane/${path.replace(/^\/+/, "")}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: options?.method ?? "GET",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
        "X-Plane-Url": planeUrl,
      },
      body: options?.body != null ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    throw err instanceof TypeError ? new ApiNetworkError(err) : err;
  }
  // Plane's 60/min-per-key rate limit (global across every endpoint, see
  // plane_integration_plan memory) — one quick retry on a 429 using the
  // upstream's own reset hint, capped so a request never silently blocks for
  // Plane's full reset window. A second 429 propagates as a real error.
  if (res.status === 429 && !options?.retried) {
    const resetEpoch = Number(res.headers.get("X-RateLimit-Reset") ?? "");
    const waitMs = Number.isFinite(resetEpoch) ? Math.max(0, resetEpoch * 1000 - Date.now()) : 1000;
    await new Promise((r) => setTimeout(r, Math.min(waitMs, _MAX_429_RETRY_WAIT_MS)));
    return planeFetch<T>(path, apiKey, apiBaseUrl, { ...options, retried: true });
  }
  if (res.status === 204) return undefined as T;
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    throw new ApiError(res.status, `Plane error ${res.status}: unexpected non-JSON response`);
  }
  if (!res.ok) {
    const msg = (data.detail as string) || `Plane error ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

type PlaneListResponse<T> = { results?: T[]; next_cursor?: string | null };

/** Follow next_cursor until exhausted (capped — a misbehaving upstream or an
 *  unbounded project must not spin forever against a shared 60/min budget). */
async function planeFetchAllPages<T>(
  path: string,
  apiKey: string,
  apiBaseUrl?: string,
): Promise<T[]> {
  const MAX_PAGES = 20; // 20 * per_page=100 = 2000 items, generous for a single board
  const sep = path.includes("?") ? "&" : "?";
  let cursor: string | null | undefined;
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const pageUrl = cursor ? `${path}${sep}per_page=100&cursor=${encodeURIComponent(cursor)}` : `${path}${sep}per_page=100`;
    const resp = await planeFetch<PlaneListResponse<T>>(pageUrl, apiKey, apiBaseUrl);
    out.push(...(resp.results ?? []));
    if (!resp.next_cursor) break;
    cursor = resp.next_cursor;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function htmlToText(html: unknown): string {
  if (!html || typeof html !== "string") return "";
  const withBreaks = html.replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n");
  return withBreaks.replace(/<[^>]+>/g, "").trim();
}

function planeDescription(raw: Record<string, unknown>): string {
  const stripped = raw.description_stripped;
  if (typeof stripped === "string" && stripped) return stripped;
  return htmlToText(raw.description_html);
}

/** Native Plane Epic → shared Epic shape. */
function normalizePlaneEpic(raw: Record<string, unknown>): Epic {
  const uuid = String(raw.id);
  return {
    id: mintId(uuid),
    ref: (raw.sequence_id as number) ?? mintId(uuid),
    subject: (raw.name as string) || "",
    description: planeDescription(raw),
    version: null, // no optimistic-concurrency field on Plane — documented gap
    tags: [], // Epic.tags[] maps to work-item Labels in Plane, not modeled on the epic itself
    pm_epic_id: uuid,
  };
}

/** Module (Epics-unavailable fallback target — see plane_integration_plan
 *  memory §8/§9: deliberate free-tier substitute, not a workaround) → Epic
 *  shape. No confirmed sequence_id on Module, so ref reuses the minted id. */
function normalizePlaneModuleAsEpic(raw: Record<string, unknown>): Epic {
  const uuid = String(raw.id);
  const minted = mintId(uuid);
  return {
    id: minted,
    ref: minted,
    subject: (raw.name as string) || "",
    description: planeDescription(raw),
    version: null,
    tags: [],
    pm_epic_id: uuid,
  };
}

function normalizePlaneWorkItem(raw: Record<string, unknown>, epic: { id: number | null; subject: string }): Story {
  const uuid = String(raw.id);
  return {
    id: mintId(uuid),
    ref: (raw.sequence_id as number) ?? mintId(uuid),
    subject: (raw.name as string) || "",
    description: planeDescription(raw),
    version: null,
    status: (raw.state as string) ?? null, // Plane state UUID — resolved against listStoryStatuses separately
    tags: [], // labels[] would need a separate resolve-by-id call; deferred to the write-path phase
    epic_id: epic.id,
    epic_subject: epic.subject,
    pm_story_id: uuid,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function planeGetMe(apiKey: string, apiBaseUrl?: string): Promise<Me> {
  // Workspace-agnostic — confirmed no workspace prefix needed (or possible:
  // no list-workspaces endpoint exists at all, see plane_integration_plan §2).
  const raw = await planeFetch<Record<string, unknown>>("users/me/", apiKey, apiBaseUrl);
  return {
    id: null, // Plane's id is a UUID, doesn't fit Me.id: number | null — account-id namespacing happens server-side (deps.py), not here
    username: (raw.display_name as string) || "",
    full_name: [raw.first_name, raw.last_name].filter(Boolean).join(" ") || (raw.display_name as string) || "",
    email: (raw.email as string) || "",
  };
}

export async function planeListProjects(apiKey: string, workspaceSlug: string, apiBaseUrl?: string): Promise<Project[]> {
  const raw = await planeFetchAllPages<Record<string, unknown>>(
    `workspaces/${encodeURIComponent(workspaceSlug)}/projects/`, apiKey, apiBaseUrl,
  );
  return raw.map((p) => ({
    id: mintId(String(p.id)),
    name: (p.name as string) || "",
    slug: (p.identifier as string) ?? null,
    description: planeDescription(p),
  }));
}

type PlaneStoryStatus = { id: string; name: string; color: string; group: string };

export async function planeListStoryStatuses(
  apiKey: string, workspaceSlug: string, projectUuid: string, apiBaseUrl?: string,
): Promise<PlaneStoryStatus[]> {
  const raw = await planeFetchAllPages<Record<string, unknown>>(
    `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}/states/`, apiKey, apiBaseUrl,
  );
  return raw.map((s) => ({
    id: String(s.id),
    name: (s.name as string) || "",
    color: (s.color as string) || "",
    group: (s.group as string) || "backlog",
  }));
}

const _CLOSED_STATE_GROUPS = new Set(["completed", "cancelled"]);
export function isPlaneStateClosed(group: string): boolean {
  return _CLOSED_STATE_GROUPS.has(group);
}

/** Probes the native Epics endpoint; on 403/404 (paid-tier gate — confirmed
 *  in plane_integration_plan §8, not an error condition) falls back to
 *  Modules, the documented free-tier substitute. Returns which path was used
 *  so callers (e.g. a future UI note) can tell the user Modules were
 *  substituted. */
async function fetchEpicsOrModules(
  apiKey: string, workspaceSlug: string, projectUuid: string, apiBaseUrl?: string,
): Promise<{ source: "epics" | "modules"; groups: Record<string, unknown>[] }> {
  try {
    const epics = await planeFetchAllPages<Record<string, unknown>>(
      `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}/epics/`, apiKey, apiBaseUrl,
    );
    return { source: "epics", groups: epics };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      const modules = await planeFetchAllPages<Record<string, unknown>>(
        `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}/modules/`, apiKey, apiBaseUrl,
      );
      return { source: "modules", groups: modules };
    }
    throw err;
  }
}

export async function planeGetBoard(
  apiKey: string, workspaceSlug: string, projectUuid: string, apiBaseUrl?: string,
): Promise<EpicWithStories[]> {
  const { source, groups } = await fetchEpicsOrModules(apiKey, workspaceSlug, projectUuid, apiBaseUrl);
  const base = `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}`;
  const results: EpicWithStories[] = [];
  // Sequential, not Promise.all: each group's work-item join is its own list
  // call (paginated), and all of it shares one 60-req/min budget per key —
  // parallel fan-out here would burn through it far faster on any project
  // with more than a handful of epics/modules.
  for (const rawGroup of groups) {
    const epic = source === "epics" ? normalizePlaneEpic(rawGroup) : normalizePlaneModuleAsEpic(rawGroup);
    const joinPath = source === "epics"
      ? `${base}/epics/${rawGroup.id}/issues/`
      : `${base}/modules/${rawGroup.id}/module-issues/`;
    const rawItems = await planeFetchAllPages<Record<string, unknown>>(joinPath, apiKey, apiBaseUrl);
    const stories = rawItems.map((item) => normalizePlaneWorkItem(item, { id: epic.id, subject: epic.subject }));
    results.push({ ...epic, stories });
  }
  return results;
}

export async function planeGetEpic(
  apiKey: string, workspaceSlug: string, projectUuid: string, mintedEpicId: string, apiBaseUrl?: string,
): Promise<Epic> {
  const uuid = resolveId(mintedEpicId);
  const base = `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}`;
  try {
    const raw = await planeFetch<Record<string, unknown>>(`${base}/epics/${uuid}/`, apiKey, apiBaseUrl);
    return normalizePlaneEpic(raw);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      const raw = await planeFetch<Record<string, unknown>>(`${base}/modules/${uuid}/`, apiKey, apiBaseUrl);
      return normalizePlaneModuleAsEpic(raw);
    }
    throw err;
  }
}

export async function planeGetStory(
  apiKey: string, workspaceSlug: string, projectUuid: string, mintedStoryId: string, apiBaseUrl?: string,
): Promise<Story> {
  const uuid = resolveId(mintedStoryId);
  const raw = await planeFetch<Record<string, unknown>>(
    `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}/work-items/${uuid}/`, apiKey, apiBaseUrl,
  );
  // parent (epic) isn't resolved here — getStory doesn't have the board's
  // epic map in scope; callers that need epic_subject should read it off the
  // getBoard result instead. Mirrors what a single-story fetch can cheaply know.
  const parentUuid = typeof raw.parent === "string" ? raw.parent : "";
  return normalizePlaneWorkItem(raw, { id: parentUuid ? mintId(parentUuid) : null, subject: "" });
}
