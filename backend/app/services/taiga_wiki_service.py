"""Taiga Wiki sync for Apex context files.

Each context file is mirrored to a deterministic Taiga wiki slug so the PM
project can carry the same source-of-truth docs Apex injects into AI calls.
"""

from __future__ import annotations

import re
from typing import Iterable

import httpx
from fastapi import HTTPException, status as http_status

_TIMEOUT = 20.0
_PAGE_SIZE = 100
_MAX_PAGES = 20


def wiki_slug_for(filename: str) -> str:
    stem = filename.rsplit(".", 1)[0]
    slug = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
    return f"apex-{slug}"


def wiki_filename_for_slug(slug: str) -> str:
    safe = re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-") or "page"
    return f"wiki-{safe}.md"


def wiki_title_for(label: str) -> str:
    return f"Apex: {label}"


def _request(
    method: str,
    url: str,
    token: str,
    *,
    params: dict | None = None,
    json: dict | None = None,
    data: dict | None = None,
    files: dict | None = None,
):
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
        data=data,
        files=files,
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
            status_code=http_status.HTTP_502_BAD_GATEWAY,
            detail=f"Taiga returned {resp.status_code} for {method} {target}: {detail or resp.reason_phrase}",
        ) from exc
    if resp.status_code == 204 or not resp.content:
        return {}
    return resp.json()


def _wiki_pages_url(taiga_base: str) -> str:
    return f"{taiga_base.rstrip('/')}/wiki"


def _wiki_page_url(taiga_base: str, wiki_id: int | str) -> str:
    return f"{_wiki_pages_url(taiga_base)}/{wiki_id}"


def _wiki_attachments_url(taiga_base: str) -> str:
    return f"{_wiki_pages_url(taiga_base)}/attachments"


def _wiki_attachment_url(taiga_base: str, attachment_id: int | str) -> str:
    return f"{_wiki_attachments_url(taiga_base)}/{attachment_id}"


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


def _page_label(page: dict, fallback: str) -> str:
    for key in ("subject", "title", "slug"):
        value = page.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return fallback


def _context_slug(filename: str) -> str:
    if filename.startswith("wiki-") and filename.endswith(".md"):
        slug = filename.removeprefix("wiki-").removesuffix(".md")
        return re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-")
    return wiki_slug_for(filename)


def _context_item(item: tuple) -> tuple[str, str, str]:
    filename = str(item[0])
    label = str(item[1]) if len(item) > 1 else filename
    slug = str(item[2]) if len(item) > 2 else _context_slug(filename)
    return filename, label, slug


def _publish_item(item: tuple) -> tuple[str, str, str, str]:
    filename = str(item[0])
    label = str(item[1]) if len(item) > 1 else filename
    if len(item) > 3:
        return filename, label, str(item[2]), str(item[3])
    return filename, label, _context_slug(filename), str(item[2]) if len(item) > 2 else ""


def _list_attachments(taiga_base: str, token: str, project_id: int, wiki_id: int | str) -> list[dict]:
    data = _request(
        "GET",
        _wiki_attachments_url(taiga_base),
        token,
        params={"project": project_id, "object_id": wiki_id},
    )
    if isinstance(data, dict):
        data = data.get("objects", [])
    return [item for item in data if isinstance(item, dict)] if isinstance(data, list) else []


def _attach_markdown_file(taiga_base: str, token: str, project_id: int, wiki_id: int | str, filename: str, content: str) -> None:
    for attachment in _list_attachments(taiga_base, token, project_id, wiki_id):
        if attachment.get("name") == filename and attachment.get("id") is not None:
            _request("DELETE", _wiki_attachment_url(taiga_base, attachment["id"]), token)
    _request(
        "POST",
        _wiki_attachments_url(taiga_base),
        token,
        data={
            "project": str(project_id),
            "object_id": str(wiki_id),
            "description": "Apex markdown context file",
            "is_deprecated": "false",
        },
        files={"attached_file": (filename, content.encode("utf-8"), "text/markdown")},
    )


def _is_duplicate_slug_error(exc: HTTPException) -> bool:
    detail = str(exc.detail).lower()
    return exc.status_code == http_status.HTTP_502_BAD_GATEWAY and "slug already exists" in detail


def _update_existing_page(
    taiga_base: str,
    token: str,
    project_id: int,
    page: dict,
    *,
    filename: str,
    slug: str,
    content: str,
) -> dict:
    wiki_id = _page_id(page)
    if wiki_id is None:
        return {"filename": filename, "slug": slug, "action": "skipped", "ok": False, "detail": "missing wiki id"}
    body = {"content": content}
    if "version" in page:
        body["version"] = page["version"]
    _request("PATCH", _wiki_page_url(taiga_base, wiki_id), token, json=body)
    _attach_markdown_file(taiga_base, token, project_id, wiki_id, filename, content)
    return {"filename": filename, "slug": slug, "action": "updated", "ok": True, "detail": ""}


def status(taiga_base: str, token: str, project_id: int, context_files: Iterable[tuple[str, str]]) -> list[dict]:
    pages = _list_pages(taiga_base, token, project_id)
    by_slug = {str(page.get("slug", "")): page for page in pages}
    managed_slugs = {wiki_slug_for(filename) for filename, _label in context_files}
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
            "source": "apex",
            "is_custom": False,
        })
    for page in pages:
        slug = str(page.get("slug", "")).strip()
        if not slug or slug in managed_slugs:
            continue
        content = _page_content(page)
        label = _page_label(page, slug)
        out.append({
            "filename": wiki_filename_for_slug(slug),
            "label": label,
            "slug": slug,
            "title": label,
            "exists": True,
            "wiki_id": _page_id(page),
            "chars": len(content),
            "last_modified": _page_modified(page),
            "source": "taiga",
            "is_custom": True,
        })
    return out


def publish(
    taiga_base: str,
    token: str,
    project_id: int,
    context_files: Iterable[tuple],
) -> list[dict]:
    pages = _list_pages(taiga_base, token, project_id)
    by_slug = {str(page.get("slug", "")): page for page in pages}
    results: list[dict] = []
    for item in context_files:
        filename, _label, slug, content = _publish_item(item)
        existing = by_slug.get(slug)
        if not content.strip():
            results.append({"filename": filename, "slug": slug, "action": "skipped", "ok": True, "detail": "empty context file"})
            continue
        if existing:
            results.append(_update_existing_page(taiga_base, token, project_id, existing, filename=filename, slug=slug, content=content))
        else:
            body = {
                "project": project_id,
                "slug": slug,
                "content": content,
                "watchers": [],
            }
            try:
                created = _request("POST", _wiki_pages_url(taiga_base), token, json=body)
            except HTTPException as exc:
                if not _is_duplicate_slug_error(exc):
                    raise
                refreshed = {str(page.get("slug", "")): page for page in _list_pages(taiga_base, token, project_id)}
                existing_after_conflict = refreshed.get(slug)
                if not existing_after_conflict:
                    raise
                results.append(_update_existing_page(
                    taiga_base,
                    token,
                    project_id,
                    existing_after_conflict,
                    filename=filename,
                    slug=slug,
                    content=content,
                ))
                continue
            wiki_id = _page_id(created) if isinstance(created, dict) else None
            if wiki_id is not None:
                _attach_markdown_file(taiga_base, token, project_id, wiki_id, filename, content)
            results.append({"filename": filename, "slug": slug, "action": "created", "ok": True, "detail": ""})
    return results


def pull(
    taiga_base: str,
    token: str,
    project_id: int,
    context_files: Iterable[tuple],
) -> tuple[list[dict], dict[str, str]]:
    pages = _list_pages(taiga_base, token, project_id)
    by_slug = {str(page.get("slug", "")): page for page in pages}
    results: list[dict] = []
    contents: dict[str, str] = {}
    for item in context_files:
        filename, _label, slug = _context_item(item)
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
