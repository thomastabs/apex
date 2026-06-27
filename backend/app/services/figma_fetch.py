"""Server-side Figma fetch helper for Autopilot.

The browser normally drives Figma through the reverse proxy (figma_proxy.py),
but Autopilot runs in a background thread with no browser, so it fetches Figma
directly here. SSRF-pinned to api.figma.com, sync httpx (the pipeline is sync).

This is a Python port of the derivation + markdown helpers in
frontend/lib/api/figma.ts (deriveFramesAndFlows / buildFigmaContextMarkdown),
kept deliberately small and dependency-free.
"""

from __future__ import annotations

import datetime as _dt
import logging

import httpx

from backend.app.api.ssrf import egress_host_allowed, is_blocked_host, pinned_target

_logger = logging.getLogger("apex.figma_fetch")

_FIGMA_HOST = "api.figma.com"
_FIGMA_API_BASE = "https://api.figma.com/v1"
_TIMEOUT = 20.0
_FRAME_LIST_CAP = 4_000
_COMMENTS_CAP = 2_000


class FigmaFetchError(RuntimeError):
    """Raised when the Figma file cannot be fetched (network/auth/SSRF)."""


def _get(path: str, token: str, query: str = "") -> dict:
    if is_blocked_host(_FIGMA_HOST) or not egress_host_allowed(_FIGMA_HOST):
        raise FigmaFetchError("Figma host is blocked or not in the egress allowlist.")
    url = f"{_FIGMA_API_BASE}/{path}"
    if query:
        url = f"{url}?{query}"
    headers = {"X-Figma-Token": token, "Accept": "application/json"}
    try:
        url, headers, ext = pinned_target(url, headers)
    except ValueError as exc:
        raise FigmaFetchError("Figma host resolves to a private/blocked address.") from exc
    try:
        resp = httpx.get(
            url, headers=headers, timeout=_TIMEOUT,
            **({"extensions": ext} if ext else {}),
        )
    except httpx.RequestError as exc:
        raise FigmaFetchError(f"Failed to reach Figma: {exc}") from exc
    if resp.status_code in (401, 403):
        raise FigmaFetchError("Figma rejected the token (401/403).")
    if resp.status_code >= 400:
        raise FigmaFetchError(f"Figma returned {resp.status_code}.")
    return resp.json()


def get_file(token: str, file_key: str, depth: int = 2) -> dict:
    return _get(f"files/{file_key}", token, query=f"depth={depth}")


def get_comments(token: str, file_key: str) -> list[dict]:
    try:
        return _get(f"files/{file_key}/comments", token).get("comments", []) or []
    except FigmaFetchError:
        return []  # comments are advisory — never fail the pipeline on them


def derive_frames_flows(file: dict) -> tuple[list[dict], list[dict]]:
    """Top-level FRAME nodes per CANVAS + prototype flow edges between them."""
    frames: list[dict] = []
    id_to_name: dict[str, str] = {}
    pages = (file.get("document") or {}).get("children") or []
    for page in pages:
        if page.get("type") != "CANVAS":
            continue
        for node in page.get("children") or []:
            if node.get("type") != "FRAME":
                continue
            frames.append({"node_id": node["id"], "name": node.get("name", ""), "page": page.get("name", "")})
            id_to_name[node["id"]] = node.get("name", "")
    flows: list[dict] = []
    for page in pages:
        for node in page.get("children") or []:
            target = node.get("transitionNodeID")
            if target and node.get("id") in id_to_name and target in id_to_name:
                flows.append({"from_name": id_to_name[node["id"]], "to_name": id_to_name[target]})
    return frames, flows


def _truncate(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit] + f"\n\n... [truncated at {limit} chars]"


def build_context_markdown(file: dict, comments: list[dict]) -> str:
    """Python port of buildFigmaContextMarkdown — bounded markdown for figma-context.md."""
    frames, flows = derive_frames_flows(file)
    today = _dt.datetime.now(_dt.timezone.utc).date().isoformat()
    last_modified = (file.get("lastModified") or "")[:10] or "unknown"
    sections = [
        f"# Figma Design Context\n\n"
        f"**File:** {file.get('name', '')}  \n"
        f"**Last modified:** {last_modified}  \n"
        f"**Synced:** {today}",
    ]

    by_page: dict[str, list[str]] = {}
    for f in frames:
        by_page.setdefault(f["page"], []).append(f["name"])
    frame_lines: list[str] = []
    for page, names in by_page.items():
        frame_lines.append(f"### {page}")
        frame_lines.extend(f"- {n}" for n in names)
    if frame_lines:
        sections.append(f"## Screens (frames)\n\n{_truncate(chr(10).join(frame_lines), _FRAME_LIST_CAP)}")

    if flows:
        flow_lines = "\n".join(f"- {e['from_name']} → {e['to_name']}" for e in flows)
        sections.append(f"## Prototype flows\n\n{flow_lines}")

    if comments:
        comment_lines: list[str] = []
        for c in comments[:30]:
            handle = (c.get("user") or {}).get("handle")
            prefix = f"**{handle}:** " if handle else ""
            comment_lines.append(f"- {prefix}{c.get('message', '')}")
        sections.append(f"## Comments\n\n{_truncate(chr(10).join(comment_lines), _COMMENTS_CAP)}")

    return "\n\n".join(sections)


def fetch_context_and_frames(token: str, file_key: str) -> tuple[str, list[dict], list[dict]]:
    """One-shot for Autopilot: returns (context_markdown, frames, flows)."""
    file = get_file(token, file_key, depth=2)
    comments = get_comments(token, file_key)
    frames, flows = derive_frames_flows(file)
    return build_context_markdown(file, comments), frames, flows
