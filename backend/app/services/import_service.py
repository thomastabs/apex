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

import httpx

_logger = logging.getLogger("apex.import_service")

_GENERAL_EPIC_ID = 0
_GENERAL_EPIC_TITLE = "General"
_PAGE_SIZE = 500
_TIMEOUT = 20.0


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _taiga_get(url: str, token: str, params: dict | None = None) -> list | dict:
    """Sync GET to a Taiga API endpoint, routed through the Cloudflare relay when needed."""
    from backend.app.api.taiga_proxy import _egress, _pin_unless_relayed

    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    url, headers = _egress(url, headers)
    url, headers, ext = _pin_unless_relayed(url, headers)
    resp = httpx.get(
        url, headers=headers, params=params, timeout=_TIMEOUT,
        **({"extensions": ext} if ext else {}),
    )
    resp.raise_for_status()
    return resp.json()


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


def _extract_epic_id(story: dict) -> int | None:
    """Extract numeric epic id from a Taiga user story dict (handles both int and nested object)."""
    epic = story.get("epic")
    if epic is None:
        return None
    if isinstance(epic, int):
        return epic
    if isinstance(epic, dict):
        return epic.get("id")
    return None


# ---------------------------------------------------------------------------
# Public service methods
# ---------------------------------------------------------------------------

def bootstrap(taiga_base: str, token: str, project_id: int) -> dict:
    """Step 1: populate story-index from Taiga without AI.

    Returns an import report dict with keys:
      imported, skipped, epics, status_mapping
    """
    from src import context_manager

    # 1. Fetch board statuses → build id→phase_status map + human-readable mapping
    statuses_raw = _taiga_get(f"{taiga_base}/userstories/statuses", token, {"project": project_id})
    if not isinstance(statuses_raw, list):
        statuses_raw = statuses_raw.get("objects", []) if isinstance(statuses_raw, dict) else []
    status_id_map: dict[int, str] = {}
    status_mapping: list[dict] = []
    for s in statuses_raw:
        apex = _map_taiga_status(s)
        status_id_map[s["id"]] = apex
        status_mapping.append({"taiga_name": s.get("name", ""), "apex_status": apex})

    # 2. Fetch all epics → id→title map
    epics_raw = _taiga_get(f"{taiga_base}/epics", token, {"project": project_id, "page_size": _PAGE_SIZE})
    if isinstance(epics_raw, dict):
        epics_raw = epics_raw.get("objects", [])
    if not isinstance(epics_raw, list):
        epics_raw = []
    epic_title_map: dict[int, str] = {e["id"]: e.get("subject", f"Epic {e['id']}") for e in epics_raw}

    # 3. Fetch all stories
    stories_raw = _taiga_get(f"{taiga_base}/userstories", token, {"project": project_id, "page_size": _PAGE_SIZE})
    if isinstance(stories_raw, dict):
        stories_raw = stories_raw.get("objects", [])
    if not isinstance(stories_raw, list):
        stories_raw = []

    # 4. Get existing story-index to detect already-imported entries
    existing = context_manager.get_story_index()

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

        context_manager.upsert_story_index(
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


def reconstruct_epic(epic_id: int, taiga_base: str, token: str, project_id: int) -> dict:
    """Step 2: generate Gherkin for all stories in one epic via one AI call.

    epic_id=0 means the synthetic General epic (orphan stories with no epic in Taiga).
    Returns a report dict with keys: epic_id, epic_title, results (list per story).
    """
    from src import ai_engine, context_manager

    # Get story-index entries for this epic
    index = context_manager.get_story_index()
    epic_stories = [
        e for e in index.values()
        if e.get("epic_id") == epic_id
    ]
    if not epic_stories:
        return {"epic_id": epic_id, "epic_title": _GENERAL_EPIC_TITLE if epic_id == 0 else f"Epic {epic_id}", "results": []}

    epic_title = epic_stories[0].get("epic_title") or (
        _GENERAL_EPIC_TITLE if epic_id == _GENERAL_EPIC_ID else f"Epic {epic_id}"
    )

    # Fetch story descriptions from Taiga
    if epic_id == _GENERAL_EPIC_ID:
        # Orphan stories: fetch all project stories, filter client-side
        all_raw = _taiga_get(f"{taiga_base}/userstories", token, {"project": project_id, "page_size": _PAGE_SIZE})
        if isinstance(all_raw, dict):
            all_raw = all_raw.get("objects", [])
        raw_map = {s["id"]: s for s in (all_raw if isinstance(all_raw, list) else []) if _extract_epic_id(s) is None}
    else:
        epic_raw = _taiga_get(f"{taiga_base}/userstories", token, {"project": project_id, "epic": epic_id, "page_size": _PAGE_SIZE})
        if isinstance(epic_raw, dict):
            epic_raw = epic_raw.get("objects", [])
        raw_map = {s["id"]: s for s in (epic_raw if isinstance(epic_raw, list) else [])}

    # Build input list for AI
    ai_input = []
    for entry in epic_stories:
        sid = entry["story_id"]
        raw = raw_map.get(sid, {})
        ai_input.append({
            "id": sid,
            "title": entry.get("title") or raw.get("subject", f"Story {sid}"),
            "description": raw.get("description") or "",
        })

    # One AI call for the whole epic
    gherkin_map = ai_engine.reconstruct_gherkin_batch(epic_title, ai_input)

    # Write Gherkin + update story-index
    results = []
    for entry in epic_stories:
        sid = entry["story_id"]
        gherkin = gherkin_map.get(sid, "")
        if gherkin.strip():
            context_manager.append_gherkin(
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
