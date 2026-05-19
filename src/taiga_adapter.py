"""
taiga_adapter.py
All Taiga REST API GET/POST/PATCH logic.

Authentication: Bearer token stored in a module-level dict. Callers (Reflex event
handlers) call set_token(token) before making API requests to keep it current.
Auto-refresh: when a request returns 401 and TAIGA_USERNAME + TAIGA_PASSWORD are
present in .env, the adapter re-authenticates automatically and updates the token.
All public methods raise TaigaAPIError on non-2xx responses.
"""

import contextvars
import json
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
TAIGA_PROJECT_ID = int(os.getenv("TAIGA_PROJECT_ID") or "0")
TAIGA_USERNAME   = os.getenv("TAIGA_USERNAME", "")
TAIGA_PASSWORD   = os.getenv("TAIGA_PASSWORD", "")

# Per-request token — ContextVar is safe across concurrent asyncio tasks and
# FastAPI threadpool workers (anyio copies the context into each thread).
_token_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "taiga_token", default=os.getenv("TAIGA_AUTH_TOKEN", "")
)

# Session-scoped caches — valid for the lifetime of the Python process.
_project_cache: dict      = {}
_status_cache:  list[dict] = []

_logger = logging.getLogger("apex.taiga")


class TaigaAPIError(Exception):
    """Raised when a Taiga API call returns a non-2xx status."""

    def __init__(self, method: str, url: str, status: int, body: str) -> None:
        try:
            parsed = json.loads(body)
            self.user_message = parsed.get("_error_message") or body[:300]
        except Exception:
            self.user_message = body[:300]
        super().__init__(f"[{method} {url}] HTTP {status}: {self.user_message}")
        self.status = status


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def _get_token() -> str:
    return _token_var.get()


def _set_token(value: str) -> None:
    _token_var.set(value)


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_get_token()}",
        "Content-Type": "application/json",
        "x-disable-pagination": "True",
    }


def _refresh_token() -> None:
    """Re-authenticate with username/password and update the token."""
    if not TAIGA_USERNAME or not TAIGA_PASSWORD:
        return  # no credentials available — let the caller surface the original 401
    url = f"{TAIGA_API_URL}/api/v1/auth"
    payload = {"username": TAIGA_USERNAME, "password": TAIGA_PASSWORD, "type": "normal"}
    delay = 1.0
    for attempt in range(3):
        try:
            resp = requests.post(url, json=payload, timeout=15)
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
            return  # can't refresh — let caller surface original 401
        if resp.status_code not in _RETRYABLE_STATUS:
            break
        if attempt < 2:
            time.sleep(delay)
            delay *= 2
    if not resp.ok:
        raise TaigaAPIError("POST", url, resp.status_code, resp.text)
    _set_token(resp.json()["auth_token"])


def is_configured() -> bool:
    """Return True if auth is available for the current session."""
    return bool(_get_token() or (TAIGA_USERNAME and TAIGA_PASSWORD))


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


def get_current_token() -> str:
    """Return the current auth token for this session."""
    return _get_token()


def restore_token(token: str) -> None:
    """Set the auth token for this session."""
    _set_token(token)


def clear_token() -> None:
    """Clear the session token and all API caches, forcing re-authentication."""
    _set_token("")
    _clear_auth_caches()


def set_api_url(url: str) -> None:
    """Override the Taiga API URL for this session and persist to .env."""
    global TAIGA_API_URL
    TAIGA_API_URL = url.rstrip("/")
    os.environ["TAIGA_API_URL"] = TAIGA_API_URL
    env_path = Path(".env")
    env_path.touch()
    set_key(str(env_path), "TAIGA_API_URL", TAIGA_API_URL)
    _logger.info("taiga.set_api_url url=%r", TAIGA_API_URL)


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

    if resp.status_code == 401:
        if TAIGA_USERNAME and TAIGA_PASSWORD:
            _refresh_token()
            resp = _safe_call()
        else:
            raise TaigaAPIError(
                method.upper(), url, 401,
                "Session expired — use the ⇄ button in the sidebar to sign in again.",
            )

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
    global _project_cache_failed
    if _project_cache_failed:
        raise TaigaAPIError("GET", f"projects/{TAIGA_PROJECT_ID}", 401,
                            "Session expired — use the ⇄ button to sign in again.")
    if not _project_cache:
        try:
            _project_cache.update(_get(f"projects/{TAIGA_PROJECT_ID}"))
        except TaigaAPIError:
            _project_cache_failed = True
            raise
    return _project_cache


def _web_base_url() -> str:
    """Derive the Taiga web base URL from TAIGA_API_URL.

    Handles two common patterns:
      https://api.taiga.io        → https://tree.taiga.io  (Taiga Cloud)
      https://taiga.example.com   → https://taiga.example.com (self-hosted)
    """
    url = TAIGA_API_URL.rstrip("/")
    # Taiga Cloud: api.taiga.io → tree.taiga.io
    url = re.sub(r"(https?://)api\.(taiga\.io)", r"\1tree.\2", url)
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
    """Return all Epics for the project, ordered by ref, normalized.

    Taiga's list endpoint omits description; fetch individual detail when missing.
    """
    raw_list = _get("epics", params={"project": TAIGA_PROJECT_ID, "order_by": "ref"}) or []
    result = []
    for e in raw_list:
        if not e.get("description"):
            try:
                detail = _get(f"epics/{e['id']}")
                if detail:
                    e = detail
            except Exception:
                pass
        result.append(normalize_epic(e))
    return result


def get_epic(epic_id: int) -> dict:
    """Fetch a single Epic by ID, normalized."""
    return normalize_epic(_get(f"epics/{epic_id}"))


def create_epic(subject: str, description: str, *, tags: list[str] | None = None) -> dict:
    """Create a new Epic in the project and return a normalized dict (includes 'id')."""
    payload: dict = {
        "project": TAIGA_PROJECT_ID,
        "subject": subject,
        "description": description,
    }
    if tags:
        payload["tags"] = tags
    raw = _post("epics", payload)
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

    tags          — list of plain strings applied as Taiga labels (e.g. ["apex", "XS"]).
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
# Issues (for fix-apex)
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
_me_cache_failed: bool = False
_project_cache_failed: bool = False


def _get_me() -> dict:
    global _me_cache_failed
    if _me_cache_failed:
        raise TaigaAPIError("GET", "users/me", 401,
                            "Session expired — use the ⇄ button to sign in again.")
    if not _me_cache:
        try:
            _me_cache.update(_get("users/me"))
        except TaigaAPIError:
            _me_cache_failed = True
            raise
    return _me_cache


def get_me() -> dict:
    """Return the authenticated user's profile (cached per session)."""
    return _get_me()


def _clear_auth_caches() -> None:
    global _status_cache, _me_cache_failed, _project_cache_failed
    _me_cache.clear()
    _project_cache.clear()
    _status_cache = []
    _me_cache_failed = False
    _project_cache_failed = False


def set_token(token: str) -> None:
    """Override the auth token for this session."""
    _set_token(token)
    _clear_auth_caches()
    _logger.info("taiga.set_token (manual override)")


def login(username: str, password: str) -> None:
    """Authenticate as a different user; updates the in-memory token."""
    url = f"{TAIGA_API_URL}/api/v1/auth"
    payload = {"username": username, "password": password, "type": "normal"}
    delay = 1.0
    for attempt in range(3):
        try:
            resp = requests.post(url, json=payload, timeout=15)
        except requests.exceptions.Timeout as exc:
            raise TaigaAPIError("POST", url, 0, "Request timed out — Taiga may be unreachable.") from exc
        except requests.exceptions.ConnectionError as exc:
            raise TaigaAPIError("POST", url, 0, "Cannot reach Taiga — check network connectivity.") from exc
        if resp.status_code not in _RETRYABLE_STATUS:
            break
        if attempt < 2:
            time.sleep(delay)
            delay *= 2
    if not resp.ok:
        raise TaigaAPIError("POST", url, resp.status_code, resp.text)
    _set_token(resp.json()["auth_token"])
    _clear_auth_caches()
    _logger.info("taiga.login username=%r", username)


def get_memberships() -> list[dict]:
    """Return all memberships for the current project."""
    members = _get("memberships", params={"project": TAIGA_PROJECT_ID}) or []
    for m in members:
        if "is_owner" not in m:
            m["is_owner"] = m.get("role_name", "").lower() == "owner"
    return members


def get_roles() -> list[dict]:
    """Return all roles defined for the current project."""
    return _get("roles", params={"project": TAIGA_PROJECT_ID}) or []


def invite_member(username_or_email: str, role_id: int) -> dict:
    """Invite a user to the current project with the given role."""
    return _post("memberships", {
        "project": TAIGA_PROJECT_ID,
        "role":    role_id,
        "username": username_or_email,
    })


def update_membership_role(membership_id: int, role_id: int) -> dict:
    """Change an existing member's role."""
    return _patch(f"memberships/{membership_id}", {"role": role_id})


def delete_membership(membership_id: int) -> None:
    """Remove a member from the project."""
    _delete(f"memberships/{membership_id}")
    _logger.info("taiga.delete_membership id=%s", membership_id)


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


def delete_project(project_id: int) -> None:
    """Permanently delete a Taiga project."""
    _delete(f"projects/{project_id}")
    _logger.info("taiga.delete_project id=%s", project_id)


def set_active_project(project_id: int) -> None:
    """Switch the active project for this session and persist the choice to .env."""
    global TAIGA_PROJECT_ID, _status_cache, _project_cache_failed
    TAIGA_PROJECT_ID = project_id
    _project_cache.clear()
    _project_cache_failed = False
    _status_cache = []
    os.environ["TAIGA_PROJECT_ID"] = str(project_id)

    # Switch context_manager paths to this project's subdirectory.
    # Lazy import avoids a circular dependency at module level.
    from src import context_manager as _ctx_mgr  # noqa: PLC0415
    _ctx_mgr.set_active_project(project_id)

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
        "version":     raw.get("version"),
        "tags":        _parse_tags(raw.get("tags")),
    }


def update_epic(
    epic_id: int,
    version: int,
    *,
    subject: str | None = None,
    description: str | None = None,
    tags: list[str] | None = None,
) -> dict:
    """Update an Epic's fields (version required for optimistic locking)."""
    payload: dict[str, Any] = {"version": version}
    if subject is not None:
        payload["subject"] = subject
    if description is not None:
        payload["description"] = description
    if tags is not None:
        payload["tags"] = tags
    raw = _patch(f"epics/{epic_id}", payload)
    _logger.info("taiga.update_epic id=%s", epic_id)
    return normalize_epic(raw)


def _parse_tags(raw_tags: list | None) -> list[str]:
    """Normalise Taiga tag shapes into a plain list of strings.

    Taiga returns tags as [[name, colour], ...] from the API, but callers that
    build tags locally may pass plain strings.  Both forms are handled.
    """
    if not raw_tags:
        return []
    result: list[str] = []
    for tag in raw_tags:
        if isinstance(tag, (list, tuple)):
            if tag:
                result.append(str(tag[0]))
        elif isinstance(tag, str):
            result.append(tag)
    return [t for t in result if t]


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
        "tags":         _parse_tags(raw.get("tags")),
        "epic_subject": epic_subject,
    }


def update_story(
    story_id: int,
    version: int,
    *,
    subject: str | None = None,
    description: str | None = None,
    tags: list[str] | None = None,
    status_id: int | None = None,
) -> dict:
    """Update a User Story's fields (version required for optimistic locking)."""
    payload: dict[str, Any] = {"version": version}
    if subject is not None:
        payload["subject"] = subject
    if description is not None:
        payload["description"] = description
    if tags is not None:
        payload["tags"] = tags
    if status_id is not None:
        payload["status"] = status_id
    raw = _patch(f"userstories/{story_id}", payload)
    _logger.info("taiga.update_story id=%s", story_id)
    return normalize_story(raw)
