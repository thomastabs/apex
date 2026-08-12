"""Plane Pages sync for Apex context files — the Plane equivalent of
taiga_wiki_service.py.

Mirrors Taiga Wiki's outward shape (status/publish/pull, same result-dict
keys) but the two platforms are NOT symmetrical, and this module is honest
about the real gap rather than faking parity:

- Plane pages have no `slug`/`href` field the way Taiga wiki pages do —
  only a free-text `name` (title). Apex-managed pages are identified by an
  EXACT match against `wiki_title_for(label)` (imported from
  taiga_wiki_service — a pure filename/label -> deterministic string helper,
  not Taiga-specific despite living there). Anything else is a "custom" page,
  same bucket concept as Taiga's.
- Plane's public API (confirmed against developers.plane.so 2026-08-11: the
  Page/Wiki reference nav lists only List/Add/Get for both workspace- and
  project-scoped pages, the official Python SDK exposes only list/retrieve,
  and makeplane/plane#7319 is an open feature request literally titled "Add
  API Endpoints for Creating and Editing Pages") has NO update or delete
  endpoint for pages — that part is a permanent Plane API limitation, not
  fixable here. What IS addressable: `publish()` no longer just refuses a
  republish. It creates a new page titled `"<title> (vN)"` (N = one past the
  highest existing version for that label) and reports
  `action: "created_new_version"` — the file's Apex-tracked page moves
  forward to the new one, the previous version is left in Plane, orphaned but
  not silently lost (`status()`/`pull()` always resolve to whichever version
  is newest). Genuinely NOT the same as a real update — old versions
  accumulate in Plane and are only removable by hand — but real content still
  reaches Plane on every publish instead of the caller being blocked outright.
- Plane's page content field is `description_html` (rich-text HTML), not
  markdown. Apex-authored pages are round-tripped losslessly by wrapping the
  markdown source in an HTML-escaped `<pre>` block on publish and reversing
  that exact wrap on pull; a genuinely custom Plane page (real rich-text HTML
  a human wrote in Plane's editor) has its raw HTML surfaced as-is when
  pulled in as grounding — same "custom pages are opt-in, less curated"
  posture Taiga's custom pages already have.
- Project-scoped (`workspaces/{slug}/projects/{project_id}/pages/`), not
  workspace-scoped — Apex context files are per-project, and using the
  workspace-pages API would leak one project's managed pages' visibility
  into every other project in the same Plane workspace.
"""

from __future__ import annotations

import html
import re
from typing import Iterable

import httpx
from fastapi import HTTPException, status as http_status

from backend.app.services.taiga_wiki_service import wiki_filename_for_slug, wiki_slug_for, wiki_title_for

_TIMEOUT = 20.0
_PAGE_SIZE = 100
_MAX_PAGES = 20
_PRE_OPEN = "<pre>"
_PRE_CLOSE = "</pre>"


def _request(
    method: str,
    url: str,
    api_key: str,
    *,
    json: dict | None = None,
    ignore_status: frozenset[int] = frozenset(),
):
    from backend.app.api.plane_proxy import _pin, _upstream_detail

    headers = {"X-Api-Key": api_key, "Accept": "application/json"}
    if json is not None:
        headers["Content-Type"] = "application/json"
    url, headers, ext = _pin(url, headers)
    resp = httpx.request(
        method, url, headers=headers, json=json, timeout=_TIMEOUT,
        **({"extensions": ext} if ext else {}),
    )
    if resp.status_code in ignore_status:
        return None
    if resp.status_code in (401, 403):
        raise PermissionError(f"Plane returned {resp.status_code} — check credentials or project access.")
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=http_status.HTTP_502_BAD_GATEWAY,
            detail=f"Plane returned {resp.status_code} for {method} {url}: {_upstream_detail(resp)}",
        )
    if resp.status_code == 204 or not resp.content:
        return {}
    return resp.json()


def _pages_url(plane_base: str, workspace_slug: str, project_id: str) -> str:
    return f"{plane_base.rstrip('/')}/workspaces/{workspace_slug}/projects/{project_id}/pages"


def _page_url(plane_base: str, workspace_slug: str, project_id: str, page_id: str) -> str:
    return f"{_pages_url(plane_base, workspace_slug, project_id)}/{page_id}"


def _list_pages(plane_base: str, api_key: str, workspace_slug: str, project_id: str) -> list[dict]:
    results: list[dict] = []
    cursor: str | None = None
    for _ in range(_MAX_PAGES):
        url = f"{_pages_url(plane_base, workspace_slug, project_id)}/?per_page={_PAGE_SIZE}"
        if cursor:
            url += f"&cursor={cursor}"
        data = _request("GET", url, api_key)
        if not isinstance(data, dict):
            break
        page_results = data.get("results")
        if not isinstance(page_results, list):
            break
        results.extend(item for item in page_results if isinstance(item, dict))
        if not data.get("next_page_results") or not data.get("next_cursor"):
            break
        cursor = data.get("next_cursor")
    return results


def _wrap_markdown(content: str) -> str:
    return f"{_PRE_OPEN}{html.escape(content)}{_PRE_CLOSE}"


def _unwrap_markdown(html_content: str) -> str | None:
    """Reverse _wrap_markdown exactly, or None if this page wasn't Apex-authored
    (real Plane rich-text HTML, or edited by a human since Apex last touched it)."""
    stripped = html_content.strip()
    if stripped.startswith(_PRE_OPEN) and stripped.endswith(_PRE_CLOSE):
        return html.unescape(stripped[len(_PRE_OPEN):-len(_PRE_CLOSE)])
    return None


def _page_content_raw(page: dict) -> str:
    for key in ("description_html", "description", "description_stripped"):
        value = page.get(key)
        if isinstance(value, str):
            return value
    return ""


def _page_id(page: dict) -> str | None:
    value = page.get("id")
    return str(value) if isinstance(value, (str, int)) else None


_VERSION_SUFFIX_RE = re.compile(r"^(?P<base>.+) \(v(?P<n>\d+)\)$")


def _version_of(title: str, base: str) -> int | None:
    """1 for an exact base-title match (the original, un-suffixed publish),
    N for "<base> (vN)", or None if *title* doesn't belong to this base at
    all. Powers the versioned-republish scheme (see module docstring) — every
    page belonging to one Apex-managed label is found this way, not just an
    exact-title match, so status()/pull() always resolve to the newest one
    and old versions never leak into the "custom page" bucket."""
    if title == base:
        return 1
    m = _VERSION_SUFFIX_RE.match(title)
    if m and m.group("base") == base:
        return int(m.group("n"))
    return None


def _managed_versions(pages: list[dict], label: str) -> list[tuple[int, dict]]:
    """Every page (any version) belonging to *label*, newest first."""
    base = wiki_title_for(label)
    found: list[tuple[int, dict]] = []
    for page in pages:
        name = str(page.get("name", "")).strip()
        v = _version_of(name, base)
        if v is not None:
            found.append((v, page))
    found.sort(key=lambda pair: pair[0], reverse=True)
    return found


def _page_modified(page: dict) -> str | None:
    for key in ("updated_at", "created_at"):
        value = page.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _strip_html_tags(raw: str) -> str:
    """Crude tag strip for surfacing a genuinely custom Plane page's rich-text
    content as plain-ish grounding text — not a real HTML->Markdown converter
    (no such dependency in this codebase), good enough for AI grounding since
    the model reads prose fine either way; only used as a fallback when a page
    wasn't Apex-authored (see _unwrap_markdown)."""
    return html.unescape(re.sub(r"<[^>]+>", " ", raw)).strip()


def _managed_content(page: dict) -> str:
    """Best-effort readable content for a page, Apex-authored or not."""
    raw = _page_content_raw(page)
    unwrapped = _unwrap_markdown(raw)
    return unwrapped if unwrapped is not None else _strip_html_tags(raw)


def _fetch_full(plane_base: str, api_key: str, workspace_slug: str, project_id: str, page_id: str) -> dict:
    fetched = _request("GET", _page_url(plane_base, workspace_slug, project_id, page_id), api_key)
    return fetched if isinstance(fetched, dict) else {}


def status(
    plane_base: str, api_key: str, workspace_slug: str, project_id: str,
    context_files: Iterable[tuple[str, str]],
) -> list[dict]:
    pages = _list_pages(plane_base, api_key, workspace_slug, project_id)
    context_files = list(context_files)
    matched_ids: set[str] = set()

    out: list[dict] = []
    for filename, label in context_files:
        title = wiki_title_for(label)
        versions = _managed_versions(pages, label)
        for _v, p in versions:
            pid = _page_id(p)
            if pid:
                matched_ids.add(pid)
        latest = versions[0][1] if versions else None
        page_id = _page_id(latest) if latest else None
        # List responses never include content (confirmed against Plane's own
        # API reference) — a real per-page fetch is required for char counts.
        # Bounded: context_files is a small, fixed set (~10-15 files).
        content = _managed_content(_fetch_full(plane_base, api_key, workspace_slug, project_id, page_id)) if page_id else ""
        out.append({
            "filename": filename,
            "label": label,
            "slug": wiki_slug_for(filename),
            "title": title,
            "exists": latest is not None,
            "wiki_id": page_id,
            "chars": len(content),
            "last_modified": _page_modified(latest) if latest else None,
            "source": "apex",
            "is_custom": False,
            # Orphaned earlier versions left behind by the no-update-endpoint
            # workaround (see module docstring) — surfaced so the UI can hint
            # at manual cleanup, never auto-deleted.
            "stale_versions": max(len(versions) - 1, 0),
        })
    # Custom (non-Apex) pages — surfaced but NOT individually fetched for
    # content (unbounded set, unlike the managed list above); chars stays 0
    # until an explicit pull() asks for one by name.
    for page in pages:
        page_id = _page_id(page)
        if page_id is None or page_id in matched_ids:
            continue
        name = str(page.get("name", "")).strip() or page_id
        slug = wiki_slug_for(name)
        out.append({
            "filename": wiki_filename_for_slug(slug),
            "label": name,
            "slug": slug,
            "title": name,
            "exists": True,
            "wiki_id": page_id,
            "chars": 0,
            "last_modified": _page_modified(page),
            "source": "plane",
            "is_custom": True,
        })
    return out


def publish(
    plane_base: str, api_key: str, workspace_slug: str, project_id: str,
    context_files: Iterable[tuple[str, str, str]],
) -> list[dict]:
    """context_files: iterable of (filename, label, content)."""
    pages = _list_pages(plane_base, api_key, workspace_slug, project_id)
    results: list[dict] = []
    for filename, label, content in context_files:
        base_title = wiki_title_for(label)
        if not content.strip():
            results.append({"filename": filename, "slug": wiki_slug_for(filename), "action": "skipped", "ok": True, "detail": "empty context file"})
            continue
        existing_versions = _managed_versions(pages, label)
        if existing_versions:
            # No update endpoint exists (see module docstring) — publish as a
            # new, higher-numbered version instead of refusing outright. The
            # prior version is left in Plane, orphaned but not lost.
            next_n = existing_versions[0][0] + 1
            title = f"{base_title} (v{next_n})"
            action_on_success = "created_new_version"
            detail_on_success = (
                f"Plane has no page-update endpoint, so this published as version {next_n} "
                f"instead of overwriting. {len(existing_versions)} earlier version(s) still exist "
                f"in Plane — delete them there manually if you don't need them."
            )
        else:
            title = base_title
            action_on_success = "created"
            detail_on_success = ""
        created = _request(
            "POST", f"{_pages_url(plane_base, workspace_slug, project_id)}/", api_key,
            json={"name": title, "description_html": _wrap_markdown(content)},
        )
        page_id = _page_id(created) if isinstance(created, dict) else None
        results.append({
            "filename": filename,
            "slug": wiki_slug_for(filename),
            "action": action_on_success if page_id else "skipped",
            "ok": page_id is not None,
            "detail": detail_on_success if page_id else "Plane did not return a page id for the created page",
        })
    return results


def pull(
    plane_base: str, api_key: str, workspace_slug: str, project_id: str,
    context_files: Iterable[tuple[str, str, str]],
) -> tuple[list[dict], dict[str, str]]:
    """context_files: iterable of (filename, label, wiki_id) — wiki_id is the
    Plane page id already resolved by a prior status() call (unlike Taiga's
    slug, a Plane page has no client-computable identifier before it exists)."""
    results: list[dict] = []
    contents: dict[str, str] = {}
    for filename, _label, wiki_id in context_files:
        if not wiki_id:
            results.append({"filename": filename, "slug": wiki_slug_for(filename), "action": "missing", "ok": False, "detail": "wiki page not found"})
            continue
        full = _fetch_full(plane_base, api_key, workspace_slug, project_id, str(wiki_id))
        contents[filename] = _managed_content(full)
        results.append({"filename": filename, "slug": wiki_slug_for(filename), "action": "pulled", "ok": True, "detail": ""})
    return results, contents
