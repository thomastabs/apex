"""
taiga_adapter.py
All Taiga REST API GET/POST/PATCH logic.

Authentication: Bearer token from TAIGA_AUTH_TOKEN.
Auto-refresh: when a request returns 401 and TAIGA_USERNAME + TAIGA_PASSWORD are
present in .env, the adapter re-authenticates automatically, updates the
in-memory token, and writes the new token back to .env so it survives restarts.
All public methods raise TaigaAPIError on non-2xx responses.
"""

import logging
import os
import re
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv, set_key

# Status codes that are safe to retry with exponential back-off.
# 501 (Not Implemented) is excluded — retrying won't help.
_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})

load_dotenv()

TAIGA_API_URL    = os.getenv("TAIGA_API_URL", "https://api.taiga.io").rstrip("/")
TAIGA_PROJECT_ID = int(os.getenv("TAIGA_PROJECT_ID", "0"))
TAIGA_USERNAME   = os.getenv("TAIGA_USERNAME", "")
TAIGA_PASSWORD   = os.getenv("TAIGA_PASSWORD", "")

# Mutable so _refresh_token() can update it without a module reload.
_token: dict[str, str] = {"value": os.getenv("TAIGA_AUTH_TOKEN", "")}

# Session-scoped caches — valid for the lifetime of the Python process.
_project_cache: dict      = {}
_status_cache:  list[dict] = []

_logger = logging.getLogger("bolt.taiga")


class TaigaAPIError(Exception):
    """Raised when a Taiga API call returns a non-2xx status."""

    def __init__(self, method: str, url: str, status: int, body: str) -> None:
        super().__init__(f"[{method} {url}] HTTP {status}: {body[:300]}")
        self.status = status


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_token['value']}",
        "Content-Type": "application/json",
        "x-disable-pagination": "True",
    }


def _refresh_token() -> None:
    """Re-authenticate with username/password, update in-memory token and .env."""
    if not TAIGA_USERNAME or not TAIGA_PASSWORD:
        return  # no credentials available — let the caller surface the original 401
    url = f"{TAIGA_API_URL}/api/v1/auth"
    resp = requests.post(
        url,
        json={"username": TAIGA_USERNAME, "password": TAIGA_PASSWORD, "type": "normal"},
        timeout=15,
    )
    if not resp.ok:
        raise TaigaAPIError("POST", url, resp.status_code, resp.text)
    new_token = resp.json()["auth_token"]
    _token["value"] = new_token
    _persist_token(new_token)


def is_configured() -> bool:
    """Return True if auth is available — either a live token or credentials for auto-refresh."""
    return bool(_token["value"] or (TAIGA_USERNAME and TAIGA_PASSWORD))


def validate_project() -> str | None:
    """Check that TAIGA_PROJECT_ID is set and reachable.

    Returns None on success, or a human-readable error string on failure.
    get_project() is cached, so this is cheap after the first call.
    """
    if not is_configured():
        return "set TAIGA_AUTH_TOKEN (or TAIGA_USERNAME + TAIGA_PASSWORD) in .env"
    if TAIGA_PROJECT_ID == 0:
        return "TAIGA_PROJECT_ID is not set in .env"
    try:
        get_project()
        return None
    except TaigaAPIError as exc:
        return str(exc)


def _persist_token(token: str) -> None:
    """Write the refreshed token back to .env so it survives a server restart."""
    env_path = Path(".env")
    if not env_path.exists():
        return
    set_key(str(env_path), "TAIGA_AUTH_TOKEN", token)


# ---------------------------------------------------------------------------
# Core request dispatcher — single 401-retry point
# ---------------------------------------------------------------------------

def _request(method: str, path: str, *, params: dict | None = None, payload: dict | None = None) -> Any:
    url = f"{TAIGA_API_URL}/api/v1/{path.lstrip('/')}"
    fn = getattr(requests, method)

    def _call() -> requests.Response:
        kwargs: dict = {"headers": _headers(), "timeout": 30}
        if params is not None:
            kwargs["params"] = params
        if payload is not None:
            kwargs["json"] = payload
        return fn(url, **kwargs)

    def _safe_call() -> requests.Response:
        try:
            return _call()
        except requests.exceptions.Timeout as exc:
            raise TaigaAPIError(method.upper(), url, 0, f"Request timed out: {exc}") from exc
        except requests.exceptions.ConnectionError as exc:
            raise TaigaAPIError(method.upper(), url, 0, f"Connection error: {exc}") from exc

    resp = _safe_call()

    if resp.status_code == 401 and TAIGA_USERNAME and TAIGA_PASSWORD:
        _refresh_token()
        resp = _safe_call()

    # Retry for 429 (rate-limited) and transient 5xx with exponential back-off.
    delay = 1.0
    for _ in range(2):
        if resp.status_code not in _RETRYABLE_STATUS:
            break
        time.sleep(delay)
        delay *= 2
        resp = _safe_call()

    if not resp.ok:
        raise TaigaAPIError(method.upper(), url, resp.status_code, resp.text)

    if not resp.content or resp.status_code == 204:
        return None
    data = resp.json()
    # Self-hosted Taiga may ignore x-disable-pagination and return a paginated envelope.
    if isinstance(data, dict) and "results" in data and "count" in data:
        results: list = list(data["results"])
        next_url: str | None = data.get("next")
        while next_url:
            try:
                page = requests.get(next_url, headers=_headers(), timeout=30)
            except requests.exceptions.RequestException:
                break
            if not page.ok:
                break  # return what we have; don't crash on a pagination error
            data = page.json()
            results.extend(data.get("results", []))
            next_url = data.get("next")
        return results
    return data


def _get(path: str, params: dict | None = None) -> Any:
    return _request("get", path, params=params)


def _post(path: str, payload: dict) -> Any:
    return _request("post", path, payload=payload)


def _patch(path: str, payload: dict) -> Any:
    return _request("patch", path, payload=payload)


# ---------------------------------------------------------------------------
# Project helpers
# ---------------------------------------------------------------------------

def get_project() -> dict:
    """Fetch and cache the current project's details (slug, name, etc.)."""
    if not _project_cache:
        _project_cache.update(_get(f"projects/{TAIGA_PROJECT_ID}"))
    return _project_cache


def _web_base_url() -> str:
    """Derive the Taiga web base URL from TAIGA_API_URL.

    Handles two common patterns:
      https://api.taiga.io        → https://app.taiga.io  (Taiga Cloud)
      https://taiga.example.com   → https://taiga.example.com (self-hosted)
    """
    url = TAIGA_API_URL.rstrip("/")
    # Taiga Cloud: api.taiga.io → app.taiga.io (not just taiga.io)
    url = re.sub(r"(https?://)api\.(taiga\.io)", r"\1app.\2", url)
    # Self-hosted instances that use an api. subdomain
    url = re.sub(r"(https?://)api\.", r"\1", url)
    # Self-hosted instances that append /api or /api/v1 to the base URL
    url = re.sub(r"/api(?:/v\d+)?$", "", url)
    return url


def get_story_url(story_ref: int | None) -> str | None:
    """Return the Taiga web URL for a story by its ref number, or None if unavailable."""
    if story_ref is None:
        return None
    try:
        slug = get_project().get("slug")
        if not slug:
            return None
        return f"{_web_base_url()}/project/{slug}/us/{story_ref}"
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Epics
# ---------------------------------------------------------------------------

def get_epics() -> list[dict]:
    """Return all Epics for the project, ordered by ref, normalized."""
    raw = _get("epics", params={"project": TAIGA_PROJECT_ID, "order_by": "ref"})
    return [normalize_epic(e) for e in (raw or [])]


def get_epic(epic_id: int) -> dict:
    """Fetch a single Epic by ID, normalized."""
    return normalize_epic(_get(f"epics/{epic_id}"))


def create_epic(subject: str, description: str) -> dict:
    """Create a new Epic in the project and return a normalized dict (includes 'id')."""
    raw = _post("epics", {
        "project": TAIGA_PROJECT_ID,
        "subject": subject,
        "description": description,
    })
    _logger.info("taiga.create_epic subject=%r id=%s", subject, raw.get("id"))
    return normalize_epic(raw)


def link_story_to_epic(epic_id: int, story_id: int) -> dict:
    """Link an existing User Story to an Epic via the related_userstories sub-resource."""
    return _post(f"epics/{epic_id}/related_userstories", {
        "epic": epic_id,
        "user_story": story_id,
    })


# ---------------------------------------------------------------------------
# User Stories
# ---------------------------------------------------------------------------

def get_story(story_id: int) -> dict:
    """Fetch a single User Story by ID, normalized."""
    return normalize_story(_get(f"userstories/{story_id}"))


def get_stories(epic_id: int | None = None) -> list[dict]:
    """Return all User Stories for the project, ordered by ref, normalized.

    Pass epic_id to filter by a specific Epic.
    """
    params: dict = {"project": TAIGA_PROJECT_ID, "order_by": "ref"}
    if epic_id is not None:
        params["epic"] = epic_id
    raw = _get("userstories", params=params)
    return [normalize_story(s) for s in (raw or [])]


def get_stories_for_epic(epic_id: int) -> list[dict]:
    """Return all User Stories linked to an Epic."""
    return get_stories(epic_id=epic_id)


def create_story(
    subject: str,
    description: str,
    epic_id: int | None = None,
    *,
    tags: list[str] | None = None,
    backlog_order: int | None = None,
) -> dict:
    """Create a new User Story in the project, optionally linked to an Epic.

    When epic_id is provided the story is explicitly linked via the
    related_userstories sub-resource (Taiga silently ignores the payload
    `epic` field on story creation).

    tags          — list of plain strings applied as Taiga labels (e.g. ["bolt", "XS"]).
    backlog_order — explicit sort key; pass a sequence of values to preserve compilation order.
    """
    payload: dict[str, Any] = {
        "project": TAIGA_PROJECT_ID,
        "subject": subject,
        "description": description,
    }
    if tags:
        payload["tags"] = tags
    if backlog_order is not None:
        payload["backlog_order"] = backlog_order
    raw = _post("userstories", payload)
    _logger.info("taiga.create_story subject=%r id=%s", subject, raw.get("id"))
    story = normalize_story(raw)
    if epic_id is not None:
        try:
            link_story_to_epic(epic_id, story["id"])
        except TaigaAPIError:
            _logger.warning(
                "taiga.create_story link failed story_id=%s epic_id=%s",
                story["id"], epic_id,
            )
    return story


def update_story_status(story_id: int, status_id: int, version: int) -> dict:
    """Move a User Story to a new status (requires the current version for optimistic locking)."""
    raw = _patch(f"userstories/{story_id}", {"status": status_id, "version": version})
    return normalize_story(raw)


def get_story_statuses() -> list[dict]:
    """Return all User Story statuses defined for the project (cached per session)."""
    global _status_cache
    if not _status_cache:
        _status_cache = _get("userstory-statuses", params={"project": TAIGA_PROJECT_ID})
    return _status_cache


def find_status_id(name_fragment: str) -> int | None:
    """
    Case-insensitive search for a story status whose name contains name_fragment.
    Returns the status ID or None if not found.
    """
    statuses = get_story_statuses()
    for s in statuses:
        if name_fragment.lower() in s.get("name", "").lower():
            return s["id"]
    return None


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

def get_task(task_id: int) -> dict:
    """Fetch a single Task by ID."""
    return _get(f"tasks/{task_id}")


def get_tasks_for_story(story_id: int) -> list[dict]:
    """Return all Tasks linked to a User Story."""
    return _get("tasks", params={"user_story": story_id, "project": TAIGA_PROJECT_ID})


def create_task(subject: str, description: str, story_id: int) -> dict:
    """Create a new Task linked to a User Story."""
    return _post(
        "tasks",
        {
            "project": TAIGA_PROJECT_ID,
            "user_story": story_id,
            "subject": subject,
            "description": description,
        },
    )


# ---------------------------------------------------------------------------
# Issues (for fix-bolt)
# ---------------------------------------------------------------------------

def get_issue(issue_id: int) -> dict:
    """Fetch a single Issue/Bug by ID."""
    return _get(f"issues/{issue_id}")


def get_issue_comments(issue_id: int) -> list[dict]:
    """Return the comment/history timeline for an issue (includes stack traces)."""
    return _get(f"history/issue/{issue_id}")


# ---------------------------------------------------------------------------
# DELETE helpers
# ---------------------------------------------------------------------------

def _delete(path: str) -> None:
    _request("delete", path)


def delete_story(story_id: int) -> None:
    _delete(f"userstories/{story_id}")
    _logger.info("taiga.delete_story id=%s", story_id)


def delete_epic(epic_id: int) -> None:
    _delete(f"epics/{epic_id}")
    _logger.info("taiga.delete_epic id=%s", epic_id)


def delete_epic_with_stories(epic_id: int) -> int:
    """Delete all stories linked to epic_id, then delete the epic itself.

    Returns the number of stories deleted.
    """
    stories = get_stories_for_epic(epic_id)
    for s in stories:
        delete_story(s["id"])
    delete_epic(epic_id)
    _logger.info("taiga.delete_epic_with_stories epic_id=%s stories_deleted=%s", epic_id, len(stories))
    return len(stories)


# ---------------------------------------------------------------------------
# Project management
# ---------------------------------------------------------------------------

_me_cache: dict = {}


def _get_me() -> dict:
    if not _me_cache:
        _me_cache.update(_get("users/me"))
    return _me_cache


def get_projects() -> list[dict]:
    """Return all projects the authenticated user is a member of."""
    me = _get_me()
    user_id = me.get("id")
    params: dict = {"order_by": "name"}
    if user_id:
        params["member"] = user_id
    return _get("projects", params=params)


def create_project(name: str, description: str) -> dict:
    """Create a new Taiga project and return the response dict (includes 'id' and 'slug')."""
    return _post("projects", {"name": name, "description": description})


def set_active_project(project_id: int) -> None:
    """Switch the active project for this session and persist the choice to .env."""
    global TAIGA_PROJECT_ID, _status_cache
    TAIGA_PROJECT_ID = project_id
    _project_cache.clear()
    _status_cache = []
    os.environ["TAIGA_PROJECT_ID"] = str(project_id)
    env_path = Path(".env")
    if env_path.exists():
        set_key(str(env_path), "TAIGA_PROJECT_ID", str(project_id))


# ---------------------------------------------------------------------------
# Normalization helpers — safe dict shapes with guaranteed keys
# ---------------------------------------------------------------------------

def normalize_epic(raw: dict) -> dict:
    """Return a normalized Epic dict with guaranteed safe keys.

    Callers can rely on all returned keys existing without .get() fallbacks.
    """
    return {
        "id":          raw["id"],
        "ref":         raw.get("ref", raw["id"]),
        "subject":     raw.get("subject", ""),
        "description": raw.get("description", "") or "",
    }


def normalize_story(raw: dict) -> dict:
    """Return a normalized Story dict with guaranteed safe keys.

    Handles both epic_extra_info (dict) and epics (list) shapes from Taiga.
    """
    epic_info = raw.get("epic_extra_info") or raw.get("epics")
    if isinstance(epic_info, list):
        epic_info = epic_info[0] if epic_info else {}
    epic_subject = epic_info.get("subject", "") if isinstance(epic_info, dict) else ""
    return {
        "id":           raw["id"],
        "ref":          raw.get("ref", raw["id"]),
        "subject":      raw.get("subject", ""),
        "description":  raw.get("description", "") or "",
        "version":      raw.get("version"),
        "status":       raw.get("status"),
        "epic_subject": epic_subject,
    }
