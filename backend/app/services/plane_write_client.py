"""Write-only Plane.so client for Autopilot (phase 5b, see plane_integration_plan memory).

Autopilot runs its epic/story generation in a background thread pool with no
browser round-trip to lean on, unlike every other Plane write path in this app
(Phase 1-4c's writes go through the tested, live-verified frontend adapter,
`frontend/lib/api/plane-direct.ts`, via the generic `/api/pm/plane/{path}`
proxy). This is NOT a second copy of that adapter: Autopilot never lists or
normalizes Plane state, only creates/joins/deletes, so this stays five small
functions rather than duplicating plane-direct.ts's read/pagination/label-
resolution logic (that duplication was explicitly rejected for phase 4c's
bulk import, for the same reason it would matter here: real risk of the two
copies drifting).

Every field shape and the Epics-vs-Modules paid-tier fallback below is copied
1:1 from plane-direct.ts's already-tested planeCreateEpic/planeCreateStory/
planeCreateTask/planeDeleteEpic (live-verified against a real workspace,
create -> confirm shape -> delete, phases 2-4d) — see that file's own header
comment for the two traps this mirrors: work items take `labels` (array of
label UUIDs) but Epics take `label_ids`; Epics/work-items take
`description_html` (no plain `description` field) but Modules take a plain
`description` string.

Dials Plane directly (SSRF-pinned via plane_proxy's `_pin`), the same pattern
`_taiga_post`/`_taiga_delete` in `autopilot_service.py` already use for Taiga
via `taiga_proxy`'s `_egress`/`_pin_unless_relayed` — this does not go through
the browser-facing `/api/pm/plane/{path}` HTTP proxy route at all, it's a
direct server-side httpx call, exactly like the Taiga helpers.
"""

from __future__ import annotations

from urllib.parse import quote

import httpx

_TIMEOUT = 20.0
# The Epics-unavailable paid-tier gate, live-confirmed on Plane Cloud as 402
# (body {"error": "Payment required", "error_code": 1999}); 403/404 kept as
# defensive extras for self-hosted Community Edition's unconfirmed shape —
# see plane-direct.ts's own _EPICS_GATED_STATUSES for the same set.
_EPICS_GATED_STATUSES = {402, 403, 404}


def _headers(token: str) -> dict:
    return {"X-Api-Key": token, "Accept": "application/json", "Content-Type": "application/json"}


def _pinned(url: str, headers: dict) -> tuple[str, dict, dict]:
    from backend.app.api.plane_proxy import _pin

    return _pin(url, headers)


def _request(method: str, url: str, token: str, body: dict | None = None) -> httpx.Response:
    url, headers, ext = _pinned(url, _headers(token))
    return httpx.request(
        method, url, headers=headers, json=body, timeout=_TIMEOUT,
        **({"extensions": ext} if ext else {}),
    )


def _project_base(plane_base: str, workspace_slug: str, project_id: str) -> str:
    return f"{plane_base}/workspaces/{quote(workspace_slug, safe='')}/projects/{project_id}"


def _to_description_html(text: str) -> str:
    """Plain text -> minimal HTML — Epics/work-items have no plain description
    field on write (mirrors plane-direct.ts's toDescriptionHtml)."""
    if not text:
        return ""
    escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f"<p>{escaped.replace(chr(10), '<br>')}</p>"


def create_epic_or_module(
    plane_base: str, workspace_slug: str, project_id: str, token: str,
    subject: str, description: str,
) -> tuple[str, str]:
    """Create an Epic, or on the paid-tier gate a Module (the documented
    free-tier substitute — not a workaround). Returns (uuid, source) where
    source is "epics" or "modules"; callers MUST use the same source again
    when joining stories to this group (a project is never a mix of both,
    mirroring plane-direct.ts's tryEpicsThenModules)."""
    base = _project_base(plane_base, workspace_slug, project_id)
    resp = _request("POST", f"{base}/epics/", token, {
        "name": subject, "description_html": _to_description_html(description), "label_ids": [],
    })
    if resp.status_code not in _EPICS_GATED_STATUSES:
        resp.raise_for_status()
        return str(resp.json()["id"]), "epics"
    resp = _request("POST", f"{base}/modules/", token, {"name": subject, "description": description})
    resp.raise_for_status()
    return str(resp.json()["id"]), "modules"


def create_work_item(
    plane_base: str, workspace_slug: str, project_id: str, token: str,
    subject: str, description: str,
) -> str:
    """Create a bare work item (Story) — not yet attached to any epic/module.
    Epic/module membership is a join, not a field on the work item; call
    join_work_item next (mirrors planeCreateStory's create-then-join shape)."""
    base = _project_base(plane_base, workspace_slug, project_id)
    resp = _request("POST", f"{base}/work-items/", token, {
        "name": subject, "description_html": _to_description_html(description),
    })
    resp.raise_for_status()
    return str(resp.json()["id"])


def join_work_item(
    plane_base: str, workspace_slug: str, project_id: str, token: str,
    group_source: str, group_id: str, work_item_id: str,
) -> None:
    """Attach a work item to its epic/module. group_source MUST be whichever
    ("epics"/"modules") create_epic_or_module returned for this group — two
    different body key names for the same concept (Epics take
    work_item_ids, Modules take issues), the same trap plane-direct.ts flags."""
    base = _project_base(plane_base, workspace_slug, project_id)
    if group_source == "epics":
        resp = _request("POST", f"{base}/epics/{group_id}/issues/", token, {"work_item_ids": [work_item_id]})
    else:
        resp = _request("POST", f"{base}/modules/{group_id}/module-issues/", token, {"issues": [work_item_id]})
    resp.raise_for_status()


def create_task(
    plane_base: str, workspace_slug: str, project_id: str, token: str,
    parent_work_item_id: str, subject: str, description: str,
) -> str:
    """Create a Task as a sub-issue (parent = the story's work item id) —
    Plane has no separate Task resource, mirrors planeCreateTask."""
    base = _project_base(plane_base, workspace_slug, project_id)
    resp = _request("POST", f"{base}/work-items/", token, {
        "name": subject, "description_html": _to_description_html(description), "parent": parent_work_item_id,
    })
    resp.raise_for_status()
    return str(resp.json()["id"])


def delete_work_item(plane_base: str, workspace_slug: str, project_id: str, token: str, work_item_id: str) -> None:
    """Delete a work item (Story or Task — both are work items in Plane).
    404 = already gone, treated as success (mirrors _taiga_delete's tolerance)."""
    base = _project_base(plane_base, workspace_slug, project_id)
    resp = _request("DELETE", f"{base}/work-items/{work_item_id}/", token)
    if resp.status_code not in (200, 204, 404):
        resp.raise_for_status()
