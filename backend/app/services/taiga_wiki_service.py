"""Taiga Wiki sync for Apex context files.

Each context file is mirrored to a deterministic Taiga wiki slug so the PM
project can carry the same source-of-truth docs Apex injects into AI calls.
"""

from __future__ import annotations

import re
from typing import Iterable

import httpx
from fastapi import HTTPException, status

_TIMEOUT = 20.0
_PAGE_SIZE = 100
_MAX_PAGES = 20


def wiki_slug_for(filename: str) -> str:
    stem = filename.rsplit(".", 1)[0]
    slug = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
    return f"apex-{slug}"


def wiki_title_for(label: str) -> str:
    return f"Apex: {label}"


def _request(method: str, url: str, token: str, *, params: dict | None = None, json: dict | None = None):
    from backend.app.api.taiga_proxy import _egress, _pin_unless_relayed

    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if json is not None:
        headers["Content-Type"] = "application/json"
    url, headers = _egress(url, headers)
    url, headers, ext = _pin_unless_relayed(url, headers)
    resp = httpx.request(
        method,
        url,
        headers=headers,
        params=params,
        json=json,
        timeout=_TIMEOUT,
        **({"extensions": ext} if ext else {}),
    )
    if resp.status_code in (401, 403):
        raise PermissionError(f"Taiga returned {resp.status_code} — check credentials or project access.")
    try:
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = resp.text.strip()
        if len(detail) > 500:
            detail = f"{detail[:500]}..."
        target = resp.request.headers.get("X-Relay-Target") or str(resp.request.url)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Taiga returned {resp.status_code} for {method} {target}: {detail or resp.reason_phrase}",
        ) from exc
    if resp.status_code == 204 or not resp.content:
        return {}
    return resp.json()


def _wiki_pages_url(taiga_base: str) -> str:
    return f"{taiga_base.rstrip('/')}/wiki"


def _wiki_page_url(taiga_base: str, wiki_id: int | str) -> str:
    return f"{_wiki_pages_url(taiga_base)}/{wiki_id}"


def _list_pages(taiga_base: str, token: str, project_id: int) -> list[dict]:
    results: list[dict] = []
    for page in range(1, _MAX_PAGES + 1):
        data = _request(
            "GET",
            _wiki_pages_url(taiga_base),
            token,
            params={"project": project_id, "page": page, "page_size": _PAGE_SIZE},
        )
        if isinstance(data, dict):
            data = data.get("objects", [])
        if not isinstance(data, list):
            break
        results.extend([item for item in data if isinstance(item, dict)])
        if len(data) < _PAGE_SIZE:
            break
    return results


def _page_content(page: dict) -> str:
    for key in ("content", "description", "body"):
        value = page.get(key)
        if isinstance(value, str):
            return value
    return ""


def _page_modified(page: dict) -> str | None:
    for key in ("modified_date", "updated_date", "created_date"):
        value = page.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _page_id(page: dict) -> int | str | None:
    value = page.get("id")
    return value if isinstance(value, (int, str)) else None


def status(taiga_base: str, token: str, project_id: int, context_files: Iterable[tuple[str, str]]) -> list[dict]:
    pages = _list_pages(taiga_base, token, project_id)
    by_slug = {str(page.get("slug", "")): page for page in pages}
    out: list[dict] = []
    for filename, label in context_files:
        slug = wiki_slug_for(filename)
        page = by_slug.get(slug)
        content = _page_content(page) if page else ""
        out.append({
            "filename": filename,
            "label": label,
            "slug": slug,
            "title": wiki_title_for(label),
            "exists": page is not None,
            "wiki_id": _page_id(page) if page else None,
            "chars": len(content),
            "last_modified": _page_modified(page) if page else None,
        })
    return out


def publish(
    taiga_base: str,
    token: str,
    project_id: int,
    context_files: Iterable[tuple[str, str, str]],
) -> list[dict]:
    pages = _list_pages(taiga_base, token, project_id)
    by_slug = {str(page.get("slug", "")): page for page in pages}
    results: list[dict] = []
    for filename, label, content in context_files:
        slug = wiki_slug_for(filename)
        existing = by_slug.get(slug)
        if not content.strip():
            results.append({"filename": filename, "slug": slug, "action": "skipped", "ok": True, "detail": "empty context file"})
            continue
        if existing:
            wiki_id = _page_id(existing)
            body = {"content": content}
            if "version" in existing:
                body["version"] = existing["version"]
            if wiki_id is None:
                results.append({"filename": filename, "slug": slug, "action": "skipped", "ok": False, "detail": "missing wiki id"})
                continue
            _request("PATCH", _wiki_page_url(taiga_base, wiki_id), token, json=body)
            results.append({"filename": filename, "slug": slug, "action": "updated", "ok": True, "detail": ""})
        else:
            body = {
                "project": project_id,
                "slug": slug,
                "content": content,
                "watchers": [],
            }
            _request("POST", _wiki_pages_url(taiga_base), token, json=body)
            results.append({"filename": filename, "slug": slug, "action": "created", "ok": True, "detail": ""})
    return results


def pull(
    taiga_base: str,
    token: str,
    project_id: int,
    context_files: Iterable[tuple[str, str]],
) -> tuple[list[dict], dict[str, str]]:
    pages = _list_pages(taiga_base, token, project_id)
    by_slug = {str(page.get("slug", "")): page for page in pages}
    results: list[dict] = []
    contents: dict[str, str] = {}
    for filename, _label in context_files:
        slug = wiki_slug_for(filename)
        page = by_slug.get(slug)
        if not page:
            results.append({"filename": filename, "slug": slug, "action": "missing", "ok": False, "detail": "wiki page not found"})
            continue
        wiki_id = _page_id(page)
        full = page
        if wiki_id is not None and not _page_content(page):
            fetched = _request("GET", _wiki_page_url(taiga_base, wiki_id), token)
            if isinstance(fetched, dict):
                full = fetched
        contents[filename] = _page_content(full)
        results.append({"filename": filename, "slug": slug, "action": "pulled", "ok": True, "detail": ""})
    return results, contents
