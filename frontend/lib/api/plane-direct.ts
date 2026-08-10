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
 * for `id` via mintId()/resolveId() (now in ./plane-id-shim — extracted 2026-
 * 08-06, phase 4a, so client.ts can also use resolveId() without a circular
 * import), uses Plane's own numeric `sequence_id` directly for `ref` (no
 * minting needed there), and carries the real UUID in the new `pm_epic_id`/
 * `pm_story_id` fields for any call that needs to dial Plane again. The
 * mapping is an in-memory module singleton — it does not survive a page
 * reload, so getEpic/getStory/etc. below throw a clear error if asked to
 * resolve an id from a session that never called getBoard/listProjects
 * first. Fine for the adapter/CRUD layer; story-index.json's OWN id mapping
 * (phase 4b, backend-persisted, survives reloads) is a separate concern.
 */
import { ApiError, ApiNetworkError, getApiBaseUrl } from "./client";
import { mintId, resolveId } from "./plane-id-shim";
import type { Epic, EpicWithStories, Me, Membership, Project, Story } from "./types";

export { mintId, resolveId };

const DEFAULT_PLANE_API = "https://api.plane.so";

export function isPlane401(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
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

type PlaneListResponse<T> = { results?: T[]; next_cursor?: string | null; next_page_results?: boolean };

/** Follow pages until exhausted (capped — a misbehaving upstream or an
 *  unbounded project must not spin forever against a shared 60/min budget).
 *
 * Bug this fixes, found live: Plane ALWAYS returns a non-null `next_cursor`
 * string (e.g. "100:1:0") even on the last page — confirmed against a real
 * single-page 1-project response. The actual "is there another page" signal
 * is the separate `next_page_results` boolean. The original version checked
 * `!resp.next_cursor`, which is essentially never true, so every list call
 * paginated all the way to MAX_PAGES regardless of how many results existed
 * — a 3-item Modules list made 20 real requests instead of 1. This was the
 * real cause of the rate-limit exhaustion hit repeatedly while live-testing
 * this file, not the manual curl exploration it was first blamed on. */
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
    if (!resp.next_page_results || !resp.next_cursor) break;
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

/** Plane's `labels` field is shape-inconsistent across responses — live-confirmed
 *  against a real workspace: a GET on a single work item returns full label
 *  OBJECTS (`{id, name, ...}`), but the object a POST/PATCH call returns embeds
 *  only the UUID STRINGS. Handle both so tags survive either code path. */
function labelNamesFrom(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => (l && typeof l === "object" && "name" in l ? String((l as Record<string, unknown>).name) : ""))
    .filter(Boolean);
}

/** Plain text -> minimal HTML, for the description_html field work items and
 *  epics require on write (confirmed: they have no plain `description` field
 *  at all, unlike Projects/Modules which take one directly — see
 *  planeDescription()'s docstring for the read-side half of this asymmetry). */
function toDescriptionHtml(text: string): string {
  if (!text) return "";
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\n/g, "<br>")}</p>`;
}

function planeDescription(raw: Record<string, unknown>): string {
  // description_stripped exists on work items but NOT on Projects/Modules
  // (confirmed live against a real workspace — those instead carry a plain
  // `description` string directly, which the original version of this
  // function ignored entirely, always falling through to an unnecessary
  // HTML-strip of description_html for both). Check both plain fields before
  // resorting to the HTML fallback.
  const stripped = raw.description_stripped;
  if (typeof stripped === "string" && stripped) return stripped;
  const plain = raw.description;
  if (typeof plain === "string" && plain) return plain;
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
    // GET responses embed full label objects (name included) — no separate
    // resolve-by-id call needed after all, unlike what was assumed before a
    // real response body was available (see labelNamesFrom's docstring).
    tags: labelNamesFrom(raw.labels),
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

// The Epics-unavailable status code, live-confirmed against a real free-tier
// Plane Cloud workspace: 402 Payment Required, body {"error": "Payment
// required", "error_code": 1999} — NOT 403/404 as originally assumed before
// a real account was available to check (see plane_integration_plan memory's
// phase-2 remaining-unknowns; this closes that gap for Cloud). 403/404 are
// kept as defensive extras since self-hosted Community Edition's exact
// response shape for this same gate is still unconfirmed.
const _EPICS_GATED_STATUSES = new Set([402, 403, 404]);

/** Shared fallback shape for every Epics-gated operation (read AND write):
 *  try the Epics call, and on a gated response (paid-tier gate — see
 *  plane_integration_plan §8, not an error condition) fall back to the
 *  Modules equivalent. The gate is tier-wide, not per-object, so this is
 *  safe to reuse for update/delete/create alike — a project is never a mix
 *  of both sources (see plane_integration_plan's phase-3 notes for why). */
async function tryEpicsThenModules<T>(epicsCall: () => Promise<T>, modulesCall: () => Promise<T>): Promise<T> {
  try {
    return await epicsCall();
  } catch (err) {
    if (err instanceof ApiError && _EPICS_GATED_STATUSES.has(err.status)) {
      return await modulesCall();
    }
    throw err;
  }
}

/** Probes the native Epics endpoint; on a gated response falls back to
 *  Modules, the documented free-tier substitute. Returns which path was used
 *  so callers (e.g. a future UI note) can tell the user Modules were
 *  substituted. */
async function fetchEpicsOrModules(
  apiKey: string, workspaceSlug: string, projectUuid: string, apiBaseUrl?: string,
): Promise<{ source: "epics" | "modules"; groups: Record<string, unknown>[] }> {
  const base = `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}`;
  return tryEpicsThenModules<{ source: "epics" | "modules"; groups: Record<string, unknown>[] }>(
    async () => ({ source: "epics", groups: await planeFetchAllPages<Record<string, unknown>>(`${base}/epics/`, apiKey, apiBaseUrl) }),
    async () => ({ source: "modules", groups: await planeFetchAllPages<Record<string, unknown>>(`${base}/modules/`, apiKey, apiBaseUrl) }),
  );
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
  return tryEpicsThenModules(
    async () => normalizePlaneEpic(await planeFetch<Record<string, unknown>>(`${base}/epics/${uuid}/`, apiKey, apiBaseUrl)),
    async () => normalizePlaneModuleAsEpic(await planeFetch<Record<string, unknown>>(`${base}/modules/${uuid}/`, apiKey, apiBaseUrl)),
  );
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

// ---------------------------------------------------------------------------
// Write paths (Phase 3) — labels, epic/story/task CRUD.
//
// Field names below are sourced from Plane's developer-docs create/update
// endpoint specs AND live-confirmed against a real workspace (create ->
// verify shape -> delete, cleaned up, not committed) before being written
// here — the discipline established in phases 1-2 (see plane_integration_plan
// memory: mocks alone caught 0 of the 4 real bugs found so far). Two traps
// worth flagging inline since they're easy to get wrong by symmetry:
//   - Work items take `labels` (array of label UUIDs) on write; Epics take
//     `label_ids` instead — different key name for the same concept.
//   - Work items/Epics take `description_html` on write (no plain
//     `description` field exists on either); Modules take a plain
//     `description` string instead — the mirror image of planeDescription()'s
//     read-side asymmetry.
// ---------------------------------------------------------------------------

/** Get-or-create a Label per tag, resolving to Plane's work-item Label ids
 *  (`.../labels/`, NOT `.../project-labels/` — see plane_integration_plan §3's
 *  two-kinds-of-Label trap). No documented server-side name filter, so this
 *  pages the full label list once per call and matches client-side, caching
 *  across every tag in *tags* rather than re-listing per tag. */
async function planeResolveLabelIds(
  apiKey: string, workspaceSlug: string, projectUuid: string, tags: string[], apiBaseUrl?: string,
): Promise<string[]> {
  if (!tags.length) return [];
  const base = `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}`;
  const existing = await planeFetchAllPages<Record<string, unknown>>(`${base}/labels/`, apiKey, apiBaseUrl);
  const byName = new Map(existing.map((l) => [String(l.name ?? "").toLowerCase(), String(l.id)]));
  const ids: string[] = [];
  for (const tag of tags) {
    const key = tag.trim().toLowerCase();
    if (!key) continue;
    let id = byName.get(key);
    if (!id) {
      const created = await planeFetch<Record<string, unknown>>(`${base}/labels/`, apiKey, apiBaseUrl, {
        method: "POST",
        body: { name: tag.trim() },
      });
      id = String(created.id);
      byName.set(key, id);
    }
    ids.push(id);
  }
  return ids;
}

export async function planeCreateEpic(
  apiKey: string, workspaceSlug: string, projectUuid: string,
  subject: string, description: string, tags: string[], apiBaseUrl?: string,
): Promise<Epic> {
  const base = `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}`;
  return tryEpicsThenModules(
    async () => {
      const labelIds = await planeResolveLabelIds(apiKey, workspaceSlug, projectUuid, tags, apiBaseUrl);
      const created = await planeFetch<Record<string, unknown>>(`${base}/epics/`, apiKey, apiBaseUrl, {
        method: "POST",
        body: { name: subject, description_html: toDescriptionHtml(description), label_ids: labelIds },
      });
      return normalizePlaneEpic(created);
    },
    async () => {
      // Modules have no tags[] concept in Apex's model (Epic.tags[] only maps
      // to work-item Labels, which Modules don't carry) — tags are silently
      // dropped on this fallback path, a documented simplification.
      const created = await planeFetch<Record<string, unknown>>(`${base}/modules/`, apiKey, apiBaseUrl, {
        method: "POST",
        body: { name: subject, description },
      });
      return normalizePlaneModuleAsEpic(created);
    },
  );
}

export async function planeUpdateEpic(
  apiKey: string, workspaceSlug: string, projectUuid: string, mintedEpicId: string,
  fields: { subject?: string; description?: string; tags?: string[] }, apiBaseUrl?: string,
): Promise<Epic> {
  const uuid = resolveId(mintedEpicId);
  const base = `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}`;
  return tryEpicsThenModules(
    async () => {
      const body: Record<string, unknown> = {};
      if (fields.subject !== undefined) body.name = fields.subject;
      if (fields.description !== undefined) body.description_html = toDescriptionHtml(fields.description);
      if (fields.tags !== undefined) body.label_ids = await planeResolveLabelIds(apiKey, workspaceSlug, projectUuid, fields.tags, apiBaseUrl);
      await planeFetch<unknown>(`${base}/epics/${uuid}/`, apiKey, apiBaseUrl, { method: "PATCH", body });
      const raw = await planeFetch<Record<string, unknown>>(`${base}/epics/${uuid}/`, apiKey, apiBaseUrl);
      return normalizePlaneEpic(raw);
    },
    async () => {
      const body: Record<string, unknown> = {};
      if (fields.subject !== undefined) body.name = fields.subject;
      if (fields.description !== undefined) body.description = fields.description;
      await planeFetch<unknown>(`${base}/modules/${uuid}/`, apiKey, apiBaseUrl, { method: "PATCH", body });
      const raw = await planeFetch<Record<string, unknown>>(`${base}/modules/${uuid}/`, apiKey, apiBaseUrl);
      return normalizePlaneModuleAsEpic(raw);
    },
  );
}

/** Deletes every member work item first, then the group itself — mirrors
 *  taigaDeleteEpic's cascade semantics (Taiga parity), since Plane's
 *  epic/module membership is a join, not ownership: deleting the group alone
 *  would just orphan its work items, not remove them. */
async function deleteGroupCascade(
  apiKey: string, apiBaseUrl: string | undefined, base: string, groupKind: "epics" | "modules", groupUuid: string,
): Promise<{ ok: boolean; stories_deleted: number; story_failures: Array<{ story_id: string; error: string }> }> {
  const listPath = groupKind === "epics" ? `${base}/epics/${groupUuid}/issues/` : `${base}/modules/${groupUuid}/module-issues/`;
  const items = await planeFetchAllPages<Record<string, unknown>>(listPath, apiKey, apiBaseUrl);
  const failures: Array<{ story_id: string; error: string }> = [];
  let deleted = 0;
  for (const item of items) {
    const id = String(item.id ?? "");
    if (!id) continue;
    try {
      await planeFetch<unknown>(`${base}/work-items/${id}/`, apiKey, apiBaseUrl, { method: "DELETE" });
      deleted += 1;
    } catch (err) {
      failures.push({ story_id: id, error: err instanceof Error ? err.message : "Delete failed" });
    }
  }
  await planeFetch<unknown>(`${base}/${groupKind}/${groupUuid}/`, apiKey, apiBaseUrl, { method: "DELETE" });
  return { ok: true, stories_deleted: deleted, story_failures: failures };
}

export async function planeDeleteEpic(
  apiKey: string, workspaceSlug: string, projectUuid: string, mintedEpicId: string, apiBaseUrl?: string,
): Promise<{ ok: boolean; stories_deleted: number; story_failures: Array<{ story_id: string; error: string }> }> {
  const uuid = resolveId(mintedEpicId);
  const base = `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}`;
  return tryEpicsThenModules(
    () => deleteGroupCascade(apiKey, apiBaseUrl, base, "epics", uuid),
    () => deleteGroupCascade(apiKey, apiBaseUrl, base, "modules", uuid),
  );
}

export async function planeCreateStory(
  apiKey: string, workspaceSlug: string, projectUuid: string, mintedEpicId: string,
  subject: string, description: string, tags: string[], statusId: string | undefined, apiBaseUrl?: string,
): Promise<Story> {
  const epicUuid = resolveId(mintedEpicId);
  const base = `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}`;
  const labelIds = await planeResolveLabelIds(apiKey, workspaceSlug, projectUuid, tags, apiBaseUrl);
  const body: Record<string, unknown> = { name: subject, description_html: toDescriptionHtml(description), labels: labelIds };
  if (statusId) body.state = statusId;
  const created = await planeFetch<Record<string, unknown>>(`${base}/work-items/`, apiKey, apiBaseUrl, { method: "POST", body });
  const workItemUuid = String(created.id);
  // Epic/module membership is a join, not a field on the work item — the
  // create call above only makes the bare work item; this attaches it to its
  // group. On failure, roll back the orphaned work item (mirrors
  // taigaCreateStory's rollback-on-link-failure).
  try {
    await tryEpicsThenModules(
      () => planeFetch<unknown>(`${base}/epics/${epicUuid}/issues/`, apiKey, apiBaseUrl, { method: "POST", body: { work_item_ids: [workItemUuid] } }),
      () => planeFetch<unknown>(`${base}/modules/${epicUuid}/module-issues/`, apiKey, apiBaseUrl, { method: "POST", body: { issues: [workItemUuid] } }),
    );
  } catch (err) {
    await planeFetch<unknown>(`${base}/work-items/${workItemUuid}/`, apiKey, apiBaseUrl, { method: "DELETE" }).catch(() => undefined);
    throw err;
  }
  const raw = await planeFetch<Record<string, unknown>>(`${base}/work-items/${workItemUuid}/`, apiKey, apiBaseUrl);
  // epic_subject isn't cheaply known here (mirrors getStory's own limitation
  // — callers needing it should read it off the getBoard result instead).
  return normalizePlaneWorkItem(raw, { id: mintId(epicUuid), subject: "" });
}

export async function planeUpdateStory(
  apiKey: string, workspaceSlug: string, projectUuid: string, mintedStoryId: string,
  fields: { subject?: string; description?: string; tags?: string[]; status?: string }, apiBaseUrl?: string,
): Promise<Story> {
  const uuid = resolveId(mintedStoryId);
  const base = `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}`;
  const body: Record<string, unknown> = {};
  if (fields.subject !== undefined) body.name = fields.subject;
  if (fields.description !== undefined) body.description_html = toDescriptionHtml(fields.description);
  if (fields.tags !== undefined) body.labels = await planeResolveLabelIds(apiKey, workspaceSlug, projectUuid, fields.tags, apiBaseUrl);
  if (fields.status !== undefined) body.state = fields.status;
  await planeFetch<unknown>(`${base}/work-items/${uuid}/`, apiKey, apiBaseUrl, { method: "PATCH", body });
  const raw = await planeFetch<Record<string, unknown>>(`${base}/work-items/${uuid}/`, apiKey, apiBaseUrl);
  const parentUuid = typeof raw.parent === "string" ? raw.parent : "";
  return normalizePlaneWorkItem(raw, { id: parentUuid ? mintId(parentUuid) : null, subject: "" });
}

export async function planeDeleteStory(
  apiKey: string, workspaceSlug: string, projectUuid: string, mintedStoryId: string, apiBaseUrl?: string,
): Promise<void> {
  const uuid = resolveId(mintedStoryId);
  await planeFetch<unknown>(
    `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}/work-items/${uuid}/`, apiKey, apiBaseUrl, { method: "DELETE" },
  );
}

export type PlaneTask = {
  id: string;
  ref: string | number;
  subject: string;
  description: string;
  version: string | number;
  user_story: string | number;
  user_story_ref: string | number;
  user_story_subject: string;
};

function normalizePlaneTask(raw: Record<string, unknown>): PlaneTask {
  const uuid = String(raw.id);
  const minted = mintId(uuid);
  const parentUuid = typeof raw.parent === "string" ? raw.parent : "";
  const parentMinted = parentUuid ? mintId(parentUuid) : minted;
  return {
    id: String(minted),
    ref: (raw.sequence_id as number) ?? minted,
    subject: (raw.name as string) || "",
    description: planeDescription(raw),
    version: "", // no optimistic-concurrency field on Plane — documented gap, same as Epic/Story
    user_story: parentMinted,
    user_story_ref: parentMinted,
    user_story_subject: "", // not cheaply known here; same limitation as getStory's epic_subject
  };
}

/** Plane has no separate "task" resource — a Task is just a work item whose
 *  `parent` points at a Story's work item (sub-issue), matching how PmTask
 *  already models Taiga's Task-under-Story relationship. Filters the
 *  project's full work-item list down to those with a parent set. */
export async function planeGetProjectTasks(
  apiKey: string, workspaceSlug: string, projectUuid: string, apiBaseUrl?: string,
): Promise<PlaneTask[]> {
  const base = `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}`;
  const raw = await planeFetchAllPages<Record<string, unknown>>(`${base}/work-items/`, apiKey, apiBaseUrl);
  return raw.filter((t) => typeof t.parent === "string" && t.parent).map(normalizePlaneTask);
}

export async function planeGetTask(
  apiKey: string, workspaceSlug: string, projectUuid: string, mintedTaskId: string, apiBaseUrl?: string,
): Promise<PlaneTask> {
  const uuid = resolveId(mintedTaskId);
  const raw = await planeFetch<Record<string, unknown>>(
    `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}/work-items/${uuid}/`, apiKey, apiBaseUrl,
  );
  return normalizePlaneTask(raw);
}

export async function planeCreateTask(
  apiKey: string, workspaceSlug: string, projectUuid: string, mintedStoryId: string,
  subject: string, description: string, apiBaseUrl?: string, points?: number,
): Promise<{ id: string; ref: string | number; subject: string }> {
  const parentUuid = resolveId(mintedStoryId);
  const base = `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}`;
  const body: Record<string, unknown> = { name: subject, description_html: toDescriptionHtml(description), parent: parentUuid };
  if (points !== undefined) body.point = points;
  const created = await planeFetch<Record<string, unknown>>(`${base}/work-items/`, apiKey, apiBaseUrl, { method: "POST", body });
  const minted = mintId(String(created.id));
  return { id: String(minted), ref: (created.sequence_id as number) ?? minted, subject: (created.name as string) || subject };
}

export async function planeUpdateTask(
  apiKey: string, workspaceSlug: string, projectUuid: string, mintedTaskId: string,
  updates: { subject?: string; description?: string }, apiBaseUrl?: string,
): Promise<void> {
  const uuid = resolveId(mintedTaskId);
  const body: Record<string, unknown> = {};
  if (updates.subject !== undefined) body.name = updates.subject;
  if (updates.description !== undefined) body.description_html = toDescriptionHtml(updates.description);
  await planeFetch<unknown>(
    `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}/work-items/${uuid}/`, apiKey, apiBaseUrl, { method: "PATCH", body },
  );
}

export async function planeDeleteTask(
  apiKey: string, workspaceSlug: string, projectUuid: string, mintedTaskId: string, apiBaseUrl?: string,
): Promise<void> {
  const uuid = resolveId(mintedTaskId);
  await planeFetch<unknown>(
    `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}/work-items/${uuid}/`, apiKey, apiBaseUrl, { method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// Members/roles (phase 4d). Membership.id is already typed `string` in the
// shared type (no id-shim needed — unlike Story/Epic/Task, Apex never treats
// a membership id as a number anywhere).
// ---------------------------------------------------------------------------

// Plane has no "list assignable roles" endpoint — the numeric encoding is
// fixed and documented (Guest=5, Member=15, Admin=20; Owner has no separate
// settable value found anywhere, live-confirmed: Owner and Admin both show
// role:20, only role_slug distinguishes them — see plane_integration_plan
// memory §2/§4d), so this is hardcoded rather than fetched. Owner excluded
// deliberately — not something this role-change endpoint can assign to.
const _PLANE_ASSIGNABLE_ROLES = [{ id: 5, name: "Guest" }, { id: 15, name: "Member" }, { id: 20, name: "Admin" }];

function planeRoleName(raw: Record<string, unknown>): string {
  const slug = raw.role_slug;
  if (typeof slug === "string" && slug) return slug.charAt(0).toUpperCase() + slug.slice(1);
  const byId = _PLANE_ASSIGNABLE_ROLES.find((r) => r.id === Number(raw.role));
  return byId?.name ?? "";
}

export async function planeGetUsers(
  apiKey: string, workspaceSlug: string, projectUuid: string, apiBaseUrl?: string,
): Promise<{ memberships: Membership[]; roles: Array<{ id: number; name: string }> }> {
  const raw = await planeFetchAllPages<Record<string, unknown>>(
    `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}/project-members/`, apiKey, apiBaseUrl,
  );
  const memberships: Membership[] = raw.map((m) => ({
    id: String(m.id),
    user: null,
    username: (m.display_name as string) || "",
    full_name: [m.first_name, m.last_name].filter(Boolean).join(" ") || (m.display_name as string) || "",
    email: (m.email as string) || "",
    role: (m.role as number) ?? null,
    role_name: planeRoleName(m),
    is_owner: m.role_slug === "owner",
  }));
  return { memberships, roles: _PLANE_ASSIGNABLE_ROLES };
}

/** Plane has no direct "invite by email" at the project level — adding
 *  someone to a project needs their existing WORKSPACE member id (joining a
 *  workspace at all is a separate Workspace Invitations flow Apex doesn't
 *  build — see plane_integration_plan memory). This resolves the given
 *  email/display-name against the workspace's existing members instead,
 *  covering the common real case (the org's team is already in the
 *  workspace) without full invite-a-stranger parity with Taiga. */
export async function planeInviteUser(
  apiKey: string, workspaceSlug: string, projectUuid: string,
  usernameOrEmail: string, roleId: number, apiBaseUrl?: string,
): Promise<void> {
  const base = `workspaces/${encodeURIComponent(workspaceSlug)}`;
  const workspaceMembers = await planeFetchAllPages<Record<string, unknown>>(`${base}/members/`, apiKey, apiBaseUrl);
  const key = usernameOrEmail.trim().toLowerCase();
  const match = workspaceMembers.find((m) =>
    String(m.email ?? "").toLowerCase() === key || String(m.display_name ?? "").toLowerCase() === key,
  );
  if (!match) {
    throw new ApiError(
      404,
      `${usernameOrEmail} must already be a member of this Plane workspace — Apex can't invite new people to a Plane workspace yet.`,
    );
  }
  await planeFetch<unknown>(`${base}/projects/${projectUuid}/project-members/`, apiKey, apiBaseUrl, {
    method: "POST",
    body: { member: match.id, role: roleId },
  });
}

export async function planeRemoveMember(
  apiKey: string, workspaceSlug: string, projectUuid: string, membershipId: string, apiBaseUrl?: string,
): Promise<void> {
  await planeFetch<unknown>(
    `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}/project-members/${membershipId}/`,
    apiKey, apiBaseUrl, { method: "DELETE" },
  );
}

export async function planeUpdateMemberRole(
  apiKey: string, workspaceSlug: string, projectUuid: string, membershipId: string, roleId: number, apiBaseUrl?: string,
): Promise<void> {
  await planeFetch<unknown>(
    `workspaces/${encodeURIComponent(workspaceSlug)}/projects/${projectUuid}/project-members/${membershipId}/`,
    apiKey, apiBaseUrl, { method: "PATCH", body: { role: roleId } },
  );
}
