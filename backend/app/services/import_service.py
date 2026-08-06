"""Import existing Taiga projects into the Apex story-index (Option C onboarding flow).

Step 1 — bootstrap (no AI): pull epics + all stories, map board statuses to
Apex phase_status, upsert story-index entries (existing entries are skipped).

Step 2 — reconstruct (AI, per-epic, opt-in): fetch story descriptions from
Taiga, run one AI call per epic via ai_engine.reconstruct_gherkin_batch, write
Gherkin to functional-spec.md and advance phase_status to gherkin_locked.

Orphan stories (no epic in Taiga) are grouped under a synthetic "General" epic
with id=0.
"""

import logging
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from backend.app.services.context_service import ContextService

_logger = logging.getLogger("apex.import_service")

_GENERAL_EPIC_ID = 0
_GENERAL_EPIC_TITLE = "General"
_PAGE_SIZE = 100   # Taiga Cloud enforces ~100 max; paginate to handle large projects
_MAX_PAGES = 40    # safety cap: 40 × 100 = 4000 stories
_TIMEOUT = 20.0


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _taiga_get(url: str, token: str, params: dict | None = None) -> list | dict:
    """Single-page GET to a Taiga API endpoint via relay + SSRF guards."""
    from backend.app.api.taiga_proxy import _egress, _pin_unless_relayed

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "x-disable-pagination": "True",
    }
    # Merge params into the URL BEFORE _egress: once the relay is active it
    # replaces `url` with the Worker root and moves the real target into
    # X-Relay-Target, so params passed to httpx afterwards would be appended
    # to the Worker URL instead of the Taiga one and silently dropped.
    if params:
        url = str(httpx.URL(url).copy_merge_params(params))
        params = None
    url, headers = _egress(url, headers)
    url, headers, ext = _pin_unless_relayed(url, headers)
    resp = httpx.get(
        url, headers=headers, params=params, timeout=_TIMEOUT,
        **({"extensions": ext} if ext else {}),
    )
    if resp.status_code in (401, 403):
        raise PermissionError(f"Taiga returned {resp.status_code} — check credentials or project access.")
    resp.raise_for_status()
    return resp.json()


def _taiga_get_all(url: str, token: str, params: dict | None = None) -> list:
    """Paginate through all pages of a Taiga list endpoint."""
    base_params = dict(params or {})
    base_params["page_size"] = _PAGE_SIZE
    results: list = []
    for page in range(1, _MAX_PAGES + 1):
        base_params["page"] = page
        data = _taiga_get(url, token, base_params)
        if isinstance(data, dict):
            data = data.get("objects", [])
        if not isinstance(data, list):
            break
        results.extend(data)
        if len(data) < _PAGE_SIZE:
            break  # last page
    return results


def _map_taiga_status(s: dict) -> str:
    """Heuristic: Taiga user-story status dict → Apex phase_status."""
    if s.get("is_closed"):
        return "deployed"
    combined = f"{s.get('name', '')} {s.get('slug', '')}".lower()
    if any(k in combined for k in ("progress", "doing", "inprogress", "in-progress",
                                    "dev", "implement", "coding", "building")):
        return "implementation"
    if any(k in combined for k in ("test", "qa", "review", "verif", "staging", "ready for test")):
        return "qa"
    return "gherkin_locked"


def _map_plane_status(s: dict) -> str:
    """Heuristic: Plane state dict -> Apex phase_status.

    Plane's `group` field is a literal-confirmed 5-value enum (backlog,
    unstarted, started, completed, cancelled — see plane_integration_plan
    memory), so this is an exact mapping, not the fuzzy name/slug substring
    matching _map_taiga_status needs (Taiga has no such fixed enum).
    completed/cancelled both mean "closed" — mirrors _map_taiga_status's own
    is_closed -> deployed treatment.
    """
    group = s.get("group", "")
    if group in ("completed", "cancelled"):
        return "deployed"
    if group == "started":
        return "implementation"
    return "gherkin_locked"


_PLANE_PAGE_SIZE = 100
_PLANE_MAX_PAGES = 20  # matches plane-direct.ts's own cap


def _plane_get_all(base_url: str, token: str, path: str) -> list[dict]:
    """Paginate a Plane list endpoint via deps._pm_get_json (already SSRF/DNS-pin
    guarded through _pm_pin). Follows next_page_results, NOT next_cursor's
    truthiness — Plane always returns a non-null cursor even on the last page,
    the same bug already found and fixed in plane-direct.ts (phase 2)."""
    from backend.app.api import deps

    out: list[dict] = []
    cursor: str | None = None
    for _ in range(_PLANE_MAX_PAGES):
        sep = "&" if "?" in path else "?"
        page_url = f"{base_url}/{path}{sep}per_page={_PLANE_PAGE_SIZE}"
        if cursor:
            page_url += f"&cursor={cursor}"
        body = deps._pm_get_json(page_url, "plane", token)
        if not body:
            break
        out.extend(body.get("results") or [])
        if not body.get("next_page_results") or not body.get("next_cursor"):
            break
        cursor = body.get("next_cursor")
    return out


def _extract_epic_id(story: dict) -> int | None:
    """Extract numeric epic id from a Taiga user story, mirroring taiga-direct.ts normalizeStory.

    Taiga API returns epic info in three possible fields:
      epic_extra_info: {id, subject, ...}   — most reliable (list endpoint)
      epics:           [{id, subject, ...}]  — alternate array form
      epic:            int | {id, ...} | null — legacy / fallback
    """
    epic_extra_info = story.get("epic_extra_info")
    epics_arr = story.get("epics")
    epic_info = (
        epic_extra_info
        if isinstance(epic_extra_info, dict) and epic_extra_info
        else (epics_arr[0] if isinstance(epics_arr, list) and epics_arr else None)
    )

    epic_field = story.get("epic")
    if isinstance(epic_field, int):
        return epic_field
    if isinstance(epic_field, dict) and epic_field:
        return epic_field.get("id")
    if isinstance(epic_info, dict) and epic_info:
        return epic_info.get("id")
    return None


def _description_text(raw: dict) -> str:
    """Return the best plain PM description field available for reconstruction."""
    for key in ("description", "description_diff", "description_html"):
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _format_reconstruction_story_input(story_id: int, title: str, raw: dict) -> str:
    """Shape PM story data as explicit requirements context for Gherkin rebuilds."""
    description = _description_text(raw)
    sections = [
        "## PM Story",
        "",
        "### Story ID",
        str(story_id),
        "",
        "### Title",
        title,
        "",
        "### Existing PM Description",
        description or "(empty)",
        "",
        "### Reconstruction Instructions",
        "Use the existing PM description as the requirement source. Preserve any Apex Requirement Spec, clarifications, and acceptance criteria sections when present, then produce clean Gherkin for functional-spec.md.",
    ]
    return "\n".join(sections)


# ---------------------------------------------------------------------------
# Public service methods
# ---------------------------------------------------------------------------

def bootstrap(taiga_base: str, token: str, project_id: int, context: "ContextService") -> dict:
    """Step 1: populate story-index from Taiga without AI.

    `context` must already have the target project set active (see caller in
    workspace.py) — status mapping and story-index reads go through it.

    Returns an import report dict with keys:
      imported, skipped, epics, status_mapping
    """
    # 1. Fetch board statuses → build id→phase_status map + human-readable mapping
    statuses_raw = _taiga_get(f"{taiga_base}/userstories/statuses", token, {"project": project_id})
    if not isinstance(statuses_raw, list):
        statuses_raw = statuses_raw.get("objects", []) if isinstance(statuses_raw, dict) else []
    configured_status_mapping = context.status_mapping()
    status_id_map: dict[int, str] = {}
    status_mapping: list[dict] = []
    for s in statuses_raw:
        status_id = s["id"]
        default_apex = _map_taiga_status(s)
        apex = configured_status_mapping.get(str(status_id), default_apex)
        status_id_map[s["id"]] = apex
        status_mapping.append({
            "pm_status_name": s.get("name", ""),
            "apex_status": apex,
            "source": "configured" if str(status_id) in configured_status_mapping else "default",
        })

    # 2. Fetch all epics → id→title map (paginated)
    epics_raw = _taiga_get_all(f"{taiga_base}/epics", token, {"project": project_id})
    epic_title_map: dict[int, str] = {e["id"]: e.get("subject", f"Epic {e['id']}") for e in epics_raw}

    # 3. Fetch all stories (paginated)
    stories_raw = _taiga_get_all(f"{taiga_base}/userstories", token, {"project": project_id})

    # 4. Get existing story-index to detect already-imported entries
    existing = context.story_index()

    # 5. Upsert each new story
    imported = 0
    skipped = 0
    epics_summary: dict[int, dict] = {}

    for story in stories_raw:
        sid = story.get("id")
        if sid is None:
            continue
        if str(sid) in existing:
            skipped += 1
            continue

        epic_id = _extract_epic_id(story)
        if epic_id is None:
            epic_id = _GENERAL_EPIC_ID
            epic_title = _GENERAL_EPIC_TITLE
        else:
            epic_title = epic_title_map.get(epic_id, f"Epic {epic_id}")

        status_id = story.get("status")
        phase_status = status_id_map.get(status_id, "gherkin_locked") if status_id else "gherkin_locked"

        context.upsert_story_index(
            sid,
            title=story.get("subject", f"Story {sid}"),
            epic_id=epic_id,
            epic_title=epic_title,
            phase_status=phase_status,
            has_gherkin=False,
        )

        if epic_id not in epics_summary:
            epics_summary[epic_id] = {"id": epic_id, "title": epic_title, "story_count": 0}
        epics_summary[epic_id]["story_count"] += 1
        imported += 1
        _logger.info("import: story %s → %s (epic %s)", sid, phase_status, epic_id)

    _logger.info("import bootstrap done: imported=%s skipped=%s", imported, skipped)
    return {
        "imported": imported,
        "skipped": skipped,
        "epics": list(epics_summary.values()),
        "status_mapping": status_mapping,
    }


def plane_bootstrap(
    plane_base: str, token: str, workspace_slug: str, project_id: str,
    epics: list[dict], context: "ContextService",
) -> dict:
    """Plane counterpart to bootstrap() — same shape, same story-index writes,
    but the epics/stories come from the CALLER (the frontend's already-fetched,
    already-live-tested planeGetBoard() result), not a fresh dial here. Only
    the state list is fetched server-side (small, cheap, mirrors the
    status-mapping route) to map each story's raw state UUID to a
    phase_status the same way bootstrap()'s status_id_map does for Taiga.
    See plane_integration_plan memory phase 4c for the architecture decision
    behind not building a second Python board-fetching client.

    `context` must already have the target project set active (same
    precondition as bootstrap()). Uses mint_pm_id (phase 4b) instead of
    trusting a caller-supplied int — Plane's real ids are UUIDs, and story
    index entries must be keyed by a durable Apex-minted int.
    """
    states_raw = _plane_get_all(plane_base, token, f"workspaces/{workspace_slug}/projects/{project_id}/states/")
    configured_status_mapping = context.status_mapping()
    status_id_map: dict[str, str] = {}
    status_mapping: list[dict] = []
    for s in states_raw:
        state_id = str(s.get("id", ""))
        if not state_id:
            continue
        default_apex = _map_plane_status(s)
        apex = configured_status_mapping.get(state_id, default_apex)
        status_id_map[state_id] = apex
        status_mapping.append({
            "pm_status_name": s.get("name", ""),
            "apex_status": apex,
            "source": "configured" if state_id in configured_status_mapping else "default",
        })

    existing = context.story_index()
    imported = 0
    skipped = 0
    epics_summary: dict[int, dict] = {}

    for epic in epics:
        pm_epic_id = epic.get("pm_epic_id")
        if not pm_epic_id:
            continue
        epic_id = context.mint_pm_id(pm_epic_id)
        epic_title = epic.get("subject") or f"Epic {epic_id}"

        for story in epic.get("stories") or []:
            pm_story_id = story.get("pm_story_id")
            if not pm_story_id:
                continue
            sid = context.mint_pm_id(pm_story_id)
            if str(sid) in existing:
                skipped += 1
                continue

            status_id = story.get("status")
            phase_status = status_id_map.get(status_id, "gherkin_locked") if status_id else "gherkin_locked"

            context.upsert_story_index(
                sid,
                title=story.get("subject") or f"Story {sid}",
                epic_id=epic_id,
                epic_title=epic_title,
                phase_status=phase_status,
                has_gherkin=False,
            )

            if epic_id not in epics_summary:
                epics_summary[epic_id] = {"id": epic_id, "title": epic_title, "story_count": 0}
            epics_summary[epic_id]["story_count"] += 1
            imported += 1
            _logger.info("plane import: story %s (pm=%s) → %s (epic %s)", sid, pm_story_id, phase_status, epic_id)

    _logger.info("plane import bootstrap done: imported=%s skipped=%s", imported, skipped)
    return {
        "imported": imported,
        "skipped": skipped,
        "epics": list(epics_summary.values()),
        "status_mapping": status_mapping,
    }


def reconstruct_epic(epic_id: int, taiga_base: str, token: str, project_id: int, context: "ContextService") -> dict:
    """Step 2: generate Gherkin for all stories in one epic via one AI call.

    `context` must already have the target project set active (see caller in
    workspace.py).

    epic_id=0 means the synthetic General epic (orphan stories with no epic in Taiga).
    Returns a report dict with keys: epic_id, epic_title, results (list per story).
    """
    from src import ai_engine

    # Get story-index entries for this epic
    index = context.story_index()
    epic_stories = [e for e in index.values() if e.get("epic_id") == epic_id]
    if not epic_stories:
        return {
            "epic_id": epic_id,
            "epic_title": _GENERAL_EPIC_TITLE if epic_id == 0 else f"Epic {epic_id}",
            "results": [],
        }

    epic_title = epic_stories[0].get("epic_title") or (
        _GENERAL_EPIC_TITLE if epic_id == _GENERAL_EPIC_ID else f"Epic {epic_id}"
    )

    # Fetch story descriptions from Taiga
    if epic_id == _GENERAL_EPIC_ID:
        # Orphan stories: fetch all project stories, filter to those with no epic
        all_raw = _taiga_get_all(f"{taiga_base}/userstories", token, {"project": project_id})
        raw_map = {s["id"]: s for s in all_raw if _extract_epic_id(s) is None}
    else:
        epic_raw = _taiga_get_all(
            f"{taiga_base}/userstories", token, {"project": project_id, "epic": epic_id}
        )
        raw_map = {s["id"]: s for s in epic_raw}

    # Build input list for AI
    ai_input = []
    for entry in epic_stories:
        sid = entry["story_id"]
        raw = raw_map.get(sid, {})
        title = entry.get("title") or raw.get("subject", f"Story {sid}")
        ai_input.append({
            "id": sid,
            "title": title,
            "description": _format_reconstruction_story_input(sid, title, raw),
        })

    # One AI call for the whole epic
    gherkin_map = ai_engine.reconstruct_gherkin_batch(epic_title, ai_input)

    # Write Gherkin + update story-index
    results = []
    for entry in epic_stories:
        sid = entry["story_id"]
        gherkin = gherkin_map.get(sid, "")
        if gherkin.strip():
            context.append_gherkin(
                sid,
                entry.get("title", f"Story {sid}"),
                gherkin,
                epic_id=epic_id if epic_id != _GENERAL_EPIC_ID else None,
                epic_title=epic_title if epic_id != _GENERAL_EPIC_ID else "",
            )
            results.append({"story_id": sid, "status": "ok"})
            _logger.info("reconstruct: story %s gherkin written", sid)
        else:
            results.append({"story_id": sid, "status": "skipped", "reason": "AI returned no output"})

    return {"epic_id": epic_id, "epic_title": epic_title, "results": results}
