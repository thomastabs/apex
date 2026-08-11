# Plane.so Integration

Apex supports [Plane](https://plane.so) as a second project-management backend
alongside Taiga, selectable per deployment at sign-in (`pmTool: "taiga" | "plane"`).
This document describes the architecture, the auth/multi-tenancy model unique to
Plane, the adapter surface and its parity with Taiga, and known, deliberate
limitations. It complements — not replaces — the Taiga-focused prose in the root
[`README.md`](../README.md) and the proxy/adapter rules in [`CLAUDE.md`](../CLAUDE.md).

## Why a second PM tool

The integration exists because a partner organization already using Apex is
migrating from Taiga to Plane, and the goal is full parity with the existing
Taiga integration — every Taiga capability should have a Plane equivalent
unless Plane's own API genuinely has no such concept (e.g. task-level
optimistic concurrency, which Plane's work items don't expose at all). Where
a capability is missing below, it's either not yet built or a real API
limitation — the two are called out separately.

## Auth and multi-tenancy model

Plane authenticates with a single Personal Access Token generated in Plane's own
UI (`X-Api-Key` header), not the username/password exchange Taiga supports. Apex's
own `Authorization: Bearer <token>` header is unchanged for callers — the PAT is
carried inside it; `backend/app/api/deps.py` is the only place that knows Plane
wants a differently-shaped upstream header (`_pm_auth_headers`).

Every authenticated route is anchored to a PM instance via two headers, mutually
exclusive per request:

- `X-Taiga-Url` (+ `X-Taiga-Project-Id`/`X-Project-Id`) for Taiga.
- `X-Plane-Url` + `X-Plane-Workspace` (+ `X-Project-Id`, a UUID) for Plane. A
  present `X-Plane-Url` takes precedence — see `deps._anchor_base`.

Plane has no env-var single-instance lock equivalent to `TAIGA_API_URL` (not
needed yet), and, like Taiga, deliberately never falls back to workspace config
for identity checks (config is user-writable and can go stale across sessions).

Storage isolation follows the same rule for both tools: `instance_id =
context_manager.instance_key(validated_base_url)`, derived from the *same*
anchor the bearer token was just checked against — never from a client-asserted
value — so a Plane workspace and a Taiga instance (or two different Plane
workspaces) can never read or write each other's `contextspec/<instance_id>/`
tree. See `deps.get_request_context` and `deps._resolve_anchor_base`.

**Workspace slug is unconditionally user-supplied.** No Plane API endpoint can
discover a workspace slug from just a token — confirmed absent during this
integration's research — so it is captured once at sign-in and carried on
`RequestContext.workspaceSlug`/`PmAuthContext.workspaceSlug`, distinct from the
generic `taigaApiUrl` field both tools otherwise share for their base URL.

**Two separate id-mapping mechanisms exist, deliberately not merged:**

| | Scope | Survives reload? | Purpose |
|---|---|---|---|
| `frontend/lib/api/plane-id-shim.ts` (`mintId`/`resolveId`) | Session-local, in-memory | No | Lets Plane's UUID ids flow through shared `Epic`/`Story` types that assume a numeric `id` (`board-section.tsx`, `phase1-workflow.tsx`, etc.) without widening those types everywhere |
| `src/context_manager.mint_pm_id` / `resolve_pm_id` (via `ContextService`) | Backend-persisted, per-project | Yes | Gives a real Plane epic/story a stable Apex int id in `story-index.json` that survives page reloads and backend restarts |

Both are "get-or-create": minting the same UUID twice returns the same id. The
frontend shim is used purely for board rendering within one browser tab; the
backend mint is the durable source of truth once a story/epic actually enters
Apex's own index (Phase 1 finalize, import bootstrap, Autopilot writes).

## Request proxying and SSRF posture

All Plane REST calls are server-side proxied exactly like Taiga's, through
`backend/app/api/plane_proxy.py` — never browser-direct. `X-Plane-Url` is
validated (`https://`, non-private host) before any outbound dial, mirroring
`taiga_proxy.py`'s guard. Plane has no relay-routing need equivalent to Taiga's
Cloudflare Worker (no known firewall block on Plane Cloud egress from Azure), so
requests pin directly via `pinned_target`/`_pin`.

Autopilot's write path (`backend/app/services/plane_write_client.py`, see
below) is the one exception that dials Plane directly from a background thread
rather than through the generic HTTP proxy route — it reuses the same
`plane_proxy._pin` SSRF guard directly rather than round-tripping through
FastAPI, since there's no browser request in flight to proxy for.

Two identifiers are strictly shape-validated wherever user input reaches them,
not left to the upstream API to reject (a 2026-08-06 review found this was a
real path-traversal vector once):

- Plane project id: `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-...\Z` (a real UUID), enforced
  by `deps._parse_project_id`.
- Plane workspace slug: `^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}\Z`, enforced by
  `deps._validate_plane_workspace_slug`.

## PM adapter layer

`frontend/lib/api/plane-adapter.ts` implements the same
`ProjectManagementAdapter` interface Taiga's adapter does (`pm-types.ts`),
dispatched via `getPmAdapter(pmTool)`. Read/update/delete paths for
epics/stories/tasks/members/projects are all implemented; epics/stories/
tasks/members are live-tested against a real Plane Cloud workspace, Project
CRUD is code-complete but not yet live-tested (see Known limitations below).

Low-level REST calls live in `frontend/lib/api/plane-direct.ts` — pagination,
field normalization, and two Plane-specific traps worth knowing if you touch
this code:

- **Epics vs Modules.** Plane's native Epics object is gated behind a paid
  tier (confirmed `402 Payment Required` on Cloud free tier). Every
  epic-shaped operation (list/create/update/delete) tries Epics first and
  falls back to **Modules** — the documented free-tier substitute, not a
  workaround — via `tryEpicsThenModules`. A project is never a mix of both.
- **Inconsistent field names across write endpoints:** work items take
  `labels` (label UUIDs) but Epics take `label_ids`; work items/Epics take
  `description_html` (no plain `description` field) but Modules take a plain
  `description` string; joining a story to its group POSTs
  `{work_item_ids: [...]}` for Epics but `{issues: [...]}` for Modules.

## Web deep-links

Confirmed against Plane's own frontend source (not guessed, not docs prose):
`{workspaceSlug}/browse/{projectIdentifier}-{sequenceId}` resolves both work
items and epics on `app.plane.so` (Cloud) or the self-hosted instance's own
single web+API domain. `frontend/lib/api/plane-web-url.ts` centralizes the
`api.plane.so` → `app.plane.so` swap and the URL builder; it's the one place
this scheme is written, reused by `plane-adapter.ts`'s `getWebUrl`,
`use-phase3.ts`'s `pmTaskWebUrl`, and `phase1.ts`'s story-push URL builder.

## Autopilot

Autopilot (`backend/app/services/autopilot_service.py`) can write real Plane
epics/modules, work items, and sub-issue tasks — not just synthetic
Apex-only story-index entries. Because Autopilot runs fully backend-driven in
a thread pool with no browser round-trip per item, it cannot reuse
`plane-direct.ts` the way every other Plane write path does; instead
`backend/app/services/plane_write_client.py` is a narrow, write-only Python
client (five functions: create epic-or-module, create work item, join work
item to its group, create a sub-issue task, delete a work item), each field
shape copied 1:1 from the already-tested TypeScript adapter rather than
independently re-derived. Every created Plane object gets a durable Apex id
via `ContextService.mint_pm_id` so it round-trips correctly through
`story-index.json` and any subsequent Autopilot phase or manual edit in Apex.

The `create_epics_in_pm` setting (generalized from Taiga-only
`create_epics_in_taiga`; the backend accepts either wire key) gates all PM
writes; disabling it produces an index-only run regardless of PM tool.

## Import (Option C onboarding)

Bootstrap (Step 1, no AI) fetches the whole board client-side via the tested
adapter (`getBoard`) and posts it to the backend, which mints durable ids and
populates `story-index.json` — deliberately never dials Plane server-side for
board data, avoiding a duplicate read-path client (see `plane_bootstrap` in
`backend/app/services/import_service.py`).

AI Gherkin reconstruction (Step 2, opt-in, per epic) works for Plane too: since
no server-side cache of Step 1's board fetch survives to this later, separate
action, the frontend re-fetches the board client-side immediately before
calling reconstruct and posts every story's description; the backend resolves
each Plane UUID back to its Apex story id via `mint_pm_id` (the same
get-or-create primitive that minted it during bootstrap) and matches it
against the target epic's story-index entries. Taiga's path is unchanged — it
still self-dials for descriptions.

## Members and roles

Plane's numeric role encoding is fixed and undiscoverable via any "list roles"
endpoint, so it's hardcoded: Guest=5, Member=15, Admin=20. Owner and Admin both
report `role: 20` on the wire — only `role_slug` distinguishes them, and Owner
is deliberately excluded from the assignable-role list (nothing in Plane's API
lets this role-change endpoint promote to Owner).

Inviting a user first resolves the given email/display-name against the
workspace's *existing* members and, on a match, adds them to the project
directly — same as before, and the common case once an org's team is already
in the workspace. When there's no match and the input looks like an email,
`inviteUser` now falls back to Plane's Workspace Invitations API
(`POST workspaces/{slug}/invitations/`, confirmed against
`developers.plane.so`) to invite that address into the *workspace*. This is
NOT the same outcome as Taiga's single invite call: Plane's project
membership and workspace membership are two separate resources with no API
that bridges them atomically, so the invitee is not yet a project member —
someone (or Apex, via a second `inviteUser` call once they show up in
workspace members) still has to add them to the project after they accept.
The adapter surfaces this via a `{scope: "project" | "workspace"}` return
value so the UI can show the right message rather than implying one-step
parity that doesn't exist. A non-email input with no workspace-member match
still fails loudly (nothing to invite by).

## Project CRUD

Create/update/delete for Plane projects, matching Taiga's own project
management flow. The one real design difference: Plane's create-project
endpoint requires a user-chosen `identifier` (a short, unique, uppercase
code, e.g. `PROJ`) — Taiga derives its project slug server-side, Plane has no
equivalent auto-derivation, so this is a genuine extra required field, not a
backend passthrough. `project-section.tsx`'s create dialog shows it only for
a Plane session; update/delete don't touch it (Plane's docs don't confirm
`identifier` is safely mutable post-create, and Taiga has no editable
equivalent either, so this stays create-only by design, not an oversight).

Field shapes (`POST/PATCH/DELETE workspaces/{slug}/projects/{id}/`) confirmed
against `developers.plane.so`'s own API reference (2026-08-10) — `name` +
`identifier` required on create, `description` optional; update accepts a
partial `{name?, description?}`; delete returns `204 No Content`. All three
route through the generic `/api/pm/plane/{path}` proxy like every other Plane
write — no backend changes were needed for this feature.

## Pages sync (Taiga Wiki equivalent)

`backend/app/services/plane_wiki_service.py` mirrors `taiga_wiki_service.py`'s
outward shape (`status`/`publish`/`pull`, same result-dict keys) through the
same `/context-files/wiki-status`, `/context-files/wiki/publish`,
`/context-files/wiki/pull` routes — `workspace.py` now dispatches on the
configured `pm_tool` rather than hardcoding Taiga, so no new frontend
endpoints were needed (`frontend/lib/api/client.ts`'s `contextHeaders()`
already attached `X-Plane-Url`/`X-Plane-Workspace` for every Plane request).
The two platforms are genuinely not symmetrical, though, and this is built to
be honest about that rather than fake parity:

- **No slug field.** Plane pages only have a free-text `name` (title) — Apex-
  managed pages are matched by an exact match against `wiki_title_for(label)`
  (the same `"Apex: <label>"` convention Taiga uses, reused directly from
  `taiga_wiki_service` since it's a pure string helper, not Taiga-specific).
  Anything else is a "custom" page, same bucket concept as Taiga's.
- **No update or delete endpoint.** Confirmed against `developers.plane.so`
  2026-08-11: the Page/Wiki reference nav lists only List/Add/Get for both
  workspace- and project-scoped pages, the official `plane-python-sdk`
  exposes only list/retrieve, and `makeplane/plane#7319` is an open feature
  request literally titled "Add API Endpoints for Creating and Editing
  Pages". So `publish()` can create a page once, but republishing an
  already-published file reports `action: "unsupported_update"` rather than
  silently no-op'ing or guessing at an undocumented PATCH — the UI surfaces
  this as an info toast naming the pages that need a manual delete-in-Plane
  first. This is a real Plane API gap, not a build gap.
- **Content is HTML, not Markdown.** Plane pages store `description_html`
  (rich text), not Markdown. Apex-authored pages round-trip losslessly by
  wrapping the Markdown source in an HTML-escaped `<pre>` block on publish
  and reversing that exact wrap on pull. A genuinely custom Plane page (real
  rich-text HTML a person wrote in Plane's own editor) has its tags crudely
  stripped for pull instead — good enough for AI grounding, not a real
  HTML-to-Markdown conversion (no such dependency in this codebase).
- **Project-scoped, not workspace-scoped.** Uses
  `workspaces/{slug}/projects/{project_id}/pages/`, matching Taiga's own
  per-project wiki scope — using Plane's workspace-pages API instead would
  leak one project's managed pages into every other project in the same
  workspace, the exact class of multi-tenant leak this codebase treats as a
  recurring bug class worth checking for deliberately on every new PM-facing
  code path.

## Known, deliberate limitations

These are gaps not yet closed, not abandoned — the working assumption is full
Taiga parity (see "Why a second PM tool" above); anything here is either not
yet built or a genuine Plane API limitation, called out separately.

- **Plane page update/delete** (real API limitation, not a build gap) — see
  "Pages sync" above; Plane's public API has no endpoint for either.
- **Phase 6 maintenance triage: PM-issue import** (not yet built) —
  `maintenance-triage.tsx` still gates its "import from PM" action on
  `pmTool === "taiga"` only; a Plane equivalent (importing Plane work items
  as maintenance items) isn't built.
- **Self-hosted Epics-gate status code** (real API-testing gap, not a build
  gap) — confirmed `402` on Cloud; untested on self-hosted Community Edition.
  Code defensively treats 402/403/404 alike either way, so this doesn't block
  anything — just unconfirmed for that deployment shape.
- **Labels list has no server-side name filter** (real Plane API limitation,
  not something Apex can build around) — the current paginate-and-match-
  client-side approach is correct and live-tested; only a potential
  optimization for unusually large label sets.

## Key files

| File | Role |
|---|---|
| `backend/app/api/plane_proxy.py` | SSRF-guarded reverse proxy for all direct Plane REST calls |
| `backend/app/api/deps.py` | Anchor resolution, credential validation, `X-Plane-*` header handling, UUID/slug validation |
| `backend/app/services/plane_write_client.py` | Autopilot's narrow write-only Plane client (epic/module, work item, join, task, delete) |
| `backend/app/services/import_service.py` | `plane_bootstrap` (Step 1) + `reconstruct_epic`'s Plane branch (Step 2) |
| `frontend/lib/api/plane-direct.ts` | Low-level Plane REST calls — pagination, normalization, write-path field-shape traps |
| `frontend/lib/api/plane-adapter.ts` | `ProjectManagementAdapter` implementation for Plane |
| `frontend/lib/api/plane-id-shim.ts` | Session-local UUID↔int id mapping for shared board types |
| `frontend/lib/api/plane-web-url.ts` | Web deep-link URL construction (Cloud API↔web swap + browse-route scheme) |
| `frontend/components/sidebar/project-section.tsx` | Sign-in UI, PM-tool selector, Project CRUD dialogs (identifier field for Plane's create flow) |
| `backend/app/services/plane_wiki_service.py` | Pages sync (`status`/`publish`/`pull`) — the Plane equivalent of `taiga_wiki_service.py` |
| `frontend/components/sidebar/users-section.tsx` | Invite flow UI — surfaces `{scope: "project"\|"workspace"}` as a distinct toast |
