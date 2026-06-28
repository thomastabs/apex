"""Server-side Figma fetch helper for Autopilot.

The browser normally drives Figma through the reverse proxy (figma_proxy.py),
but Autopilot runs in a background thread with no browser, so it fetches Figma
directly here. SSRF-pinned to api.figma.com, sync httpx (the pipeline is sync).

This is a Python port of the derivation + markdown helpers in
frontend/lib/api/figma.ts (deriveFramesAndFlows / buildFigmaContextMarkdown),
kept deliberately small and dependency-free.
"""

from __future__ import annotations

import base64
import datetime as _dt
import logging
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

import httpx

from backend.app.api.ssrf import egress_host_allowed, is_blocked_host, pinned_target

_logger = logging.getLogger("apex.figma_fetch")

_FIGMA_HOST = "api.figma.com"
_FIGMA_API_BASE = "https://api.figma.com/v1"
_TIMEOUT = 20.0
_FRAME_LIST_CAP = 4_000
_COMMENTS_CAP = 2_000

# Multimodal grounding (U1): the Figma /images endpoint renders frames to PNGs
# but returns short-lived URLs on a SECOND host (its S3 image CDN), not bytes.
# Downloading those bytes is a new egress hop, so it gets its own SSRF guard —
# we deliberately do NOT widen the api.figma.com pin above.
_MAX_FRAME_IMAGES = 12          # bound token cost (~1600 img-tokens/frame at scale 1.0)
_IMAGE_RENDER_SCALE = 1.0       # long edge ≤1568px — do NOT raise (cost balloons on 4.7+)
_MAX_IMAGE_BYTES = 5_000_000    # skip oversized renders (request-too-large guard)
_IMAGE_FETCH_TIMEOUT = 15.0


class FigmaFetchError(RuntimeError):
    """Raised when the Figma file cannot be fetched (network/auth/SSRF)."""


def _http_get(url: str, headers: dict, timeout: float, ext: dict) -> httpx.Response:
    """GET via a Client — the module-level httpx.get() does NOT accept `extensions`
    (httpx 0.28), and the SSRF pin needs to pass `sni_hostname` through extensions."""
    with httpx.Client(follow_redirects=False, timeout=timeout) as client:
        return client.request("GET", url, headers=headers, **({"extensions": ext} if ext else {}))


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
        resp = _http_get(url, headers, _TIMEOUT, ext)
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


# ---------------------------------------------------------------------------
# Frame image rendering (U1 — multimodal grounding)
# ---------------------------------------------------------------------------

def get_image_urls(token: str, file_key: str, node_ids: list[str], scale: float = _IMAGE_RENDER_SCALE) -> dict[str, str]:
    """Render the given nodes to PNGs via Figma's /images endpoint.

    Returns {node_id: render_url}. The URLs point at Figma's S3 image CDN and are
    short-lived. Pinned to api.figma.com (same guard as every other call here).
    """
    if not node_ids:
        return {}
    ids = ",".join(node_ids)
    data = _get(f"images/{file_key}", token, query=f"ids={ids}&format=png&scale={scale}")
    images = data.get("images") or {}
    return {nid: url for nid, url in images.items() if url}


def _image_host_allowed(host: str) -> bool:
    """The render URL's host must be a Figma-owned CDN (its S3 bucket or figma.com)."""
    host = (host or "").strip().lower().rstrip(".")
    if host.endswith(".figma.com"):
        return True
    return "figma" in host and host.endswith(".amazonaws.com")


def fetch_image_bytes(url: str) -> bytes:
    """Download a rendered-frame PNG from Figma's image CDN — the second egress hop.

    Dedicated SSRF guard: https only, Figma-owned host, non-private IP (pinned),
    and the deployment egress allowlist. Returns the raw bytes.
    """
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if parsed.scheme != "https" or not _image_host_allowed(host):
        raise FigmaFetchError("Figma image URL is not an allowed https Figma host.")
    if is_blocked_host(host) or not egress_host_allowed(host):
        raise FigmaFetchError("Figma image host is blocked or not in the egress allowlist.")
    try:
        pinned_url, headers, ext = pinned_target(url, {})
    except ValueError as exc:
        raise FigmaFetchError("Figma image host resolves to a private/blocked address.") from exc
    try:
        resp = _http_get(pinned_url, headers, _IMAGE_FETCH_TIMEOUT, ext)
    except httpx.RequestError as exc:
        raise FigmaFetchError(f"Failed to fetch Figma image: {exc}") from exc
    if resp.status_code >= 400:
        raise FigmaFetchError(f"Figma image CDN returned {resp.status_code}.")
    return resp.content


def get_frame_images(
    token: str, file_key: str, frames: list[dict], max_frames: int = _MAX_FRAME_IMAGES
) -> list[dict]:
    """Render up to `max_frames` frames and return base64 PNGs for vision grounding.

    Returns [{node_id, name, b64_png, media_type}]. Per-frame failures (render
    miss, oversized, network) are skipped — image grounding is advisory and must
    never block story generation.
    """
    chosen = [f for f in frames if f.get("node_id")][:max_frames]
    if not chosen:
        return []
    node_ids = [f["node_id"] for f in chosen]
    urls = get_image_urls(token, file_key, node_ids)

    def _one(frame: dict) -> dict | None:
        url = urls.get(frame["node_id"])
        if not url:
            return None
        try:
            data = fetch_image_bytes(url)
        except FigmaFetchError as exc:
            _logger.warning("frame image skipped node=%s: %s", frame["node_id"], exc)
            return None
        if not data or len(data) > _MAX_IMAGE_BYTES:
            return None
        return {
            "node_id": frame["node_id"],
            "name": frame.get("name", ""),
            "b64_png": base64.b64encode(data).decode("ascii"),
            "media_type": "image/png",
        }

    with ThreadPoolExecutor(max_workers=min(6, len(chosen))) as pool:
        results = list(pool.map(_one, chosen))
    return [r for r in results if r]


def fetch_frame_images(token: str, file_key: str, frames: list[dict]) -> list[dict]:
    """Advisory wrapper for the pipeline: never raises — returns [] on any failure."""
    if not token or not file_key:
        return []
    try:
        return get_frame_images(token, file_key, frames)
    except FigmaFetchError as exc:
        _logger.warning("frame image grounding skipped: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Project ingest (Stage 3 — file-as-epic in Autopilot)
# ---------------------------------------------------------------------------

_MAX_PROJECT_IMAGES = 16  # project-wide image budget, spread across the project's files


def get_project_files(token: str, project_id: str) -> list[dict]:
    """List the files in a Figma project. Needs a PAT with the `projects:read` scope."""
    return _get(f"projects/{project_id}/files", token).get("files", []) or []


def fetch_project_designs(
    token: str, project_id: str, total_image_cap: int = _MAX_PROJECT_IMAGES
) -> list[dict]:
    """Ingest a whole Figma project: one design bundle per file.

    Returns [{file_key, file_name, context_md, frames, flows, images}]. The image
    budget is spread across the files so a many-file project doesn't blow the token
    cost. Advisory: a file that fails to fetch is skipped, never fatal."""
    files = get_project_files(token, project_id)
    if not files:
        return []
    per_file = max(1, total_image_cap // len(files))
    bundles: list[dict] = []
    for f in files:
        key = f.get("key")
        if not key:
            continue
        try:
            file = get_file(token, key, depth=2)
        except FigmaFetchError as exc:
            _logger.warning("project file skipped key=%s: %s", key, exc)
            continue
        comments = get_comments(token, key)
        frames, flows = derive_frames_flows(file)
        try:
            images = get_frame_images(token, key, frames, max_frames=per_file)
        except FigmaFetchError:
            images = []
        bundles.append({
            "file_key": key,
            "file_name": f.get("name") or file.get("name", "") or key,
            "context_md": build_context_markdown(file, comments),
            "frames": frames,
            "flows": flows,
            "images": images,
        })
    return bundles


def build_project_context_markdown(bundles: list[dict]) -> str:
    """Aggregate per-file context into one figma-context.md, sectioned per file."""
    today = _dt.datetime.now(_dt.timezone.utc).date().isoformat()
    parts = [f"# Figma Project Design Context\n\n**Files:** {len(bundles)}  \n**Synced:** {today}"]
    for b in bundles:
        parts.append(f"## File: {b['file_name']}\n\n{b['context_md']}")
    return "\n\n---\n\n".join(parts)


def stitch_cross_file_flows(bundles: list[dict], max_edges: int = 40) -> list[dict]:
    """Infer cross-file navigation edges (name-heuristic).

    Figma's REST API does not expose true cross-file prototype links, so the only
    usable signal is a frame NAME appearing in ≥2 of the project's files — a likely
    handoff where the product flow crosses a file boundary on a shared screen. For
    each such name, link one representative frame per file (file-namespaced ids) in a
    chain. Returns [{from_id, to_id, kind: "cross_file"}] — clearly *inferred*, not
    real prototype data. Pure + dependency-free."""
    by_name: dict[str, dict[str, str]] = {}
    for b in bundles:
        fk = b["file_key"]
        for fr in b.get("frames", []):
            name = (fr.get("name") or "").strip().lower()
            if not name:
                continue
            # one representative id per (name, file) — first frame wins
            by_name.setdefault(name, {}).setdefault(fk, f"{fk}:{fr['node_id']}")
    edges: list[dict] = []
    for reps in by_name.values():
        if len(reps) < 2:  # name must span ≥2 distinct files
            continue
        ids = list(reps.values())
        for src, tgt in zip(ids, ids[1:]):
            edges.append({"from_id": src, "to_id": tgt, "kind": "cross_file"})
            if len(edges) >= max_edges:
                return edges
    return edges
