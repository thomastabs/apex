"""Server-side GitHub clone + pack for github-context.md.

Clones the configured repo (server-side PAT, auth passed via GIT_CONFIG_*
env vars so the token never appears in argv or a URL) into a scoped temp
dir, then packs it with the pinned `repomix` CLI (the real tool:
https://github.com/yamadashy/repomix) rather than a from-scratch walker —
gets its mature .gitignore/ignore-glob handling and --compress signature
extraction for free. We do the clone ourselves (not repomix's own --remote
mode, whose private-repo auth story is undocumented and which silently
falls back to treating an unreachable remote as a local path) so we keep
full control over auth, size limits, and timeouts.

SSRF-pinned to api.github.com (metadata) and github.com (clone); both hosts
are hardcoded, never user-supplied, but still pinned for parity with the
rest of this codebase's egress-allowlist discipline (an operator can still
restrict EGRESS_HOST_ALLOWLIST to exclude GitHub entirely).
"""

from __future__ import annotations

import base64
import logging
import os
import subprocess
import tempfile
from pathlib import Path

import httpx

from backend.app.api.ssrf import egress_host_allowed, is_blocked_host, pinned_target

_logger = logging.getLogger("apex.github_fetch")

_GITHUB_API_HOST = "api.github.com"
_GITHUB_API_BASE = "https://api.github.com"
_GITHUB_CLONE_HOST = "github.com"

_API_TIMEOUT = 20.0
_CLONE_TIMEOUT = 120.0
_PACK_TIMEOUT = 180.0

# Post-clone working-tree size cap (bytes) — a resource guard independent of
# --depth 1 (which bounds history, not the current tree's blob sizes).
_MAX_CLONE_BYTES = 200_000_000

# Repomix's own hard ceiling on packed output (fails fast rather than
# silently truncating). A judgment-call starting point — tune against real
# repos, not a validated number.
_DEFAULT_TOKEN_BUDGET = 45_000

# Same exclude set as the browser-side tree fetch this replaces
# (frontend/lib/api/github-browser.ts), for parity.
_IGNORE_GLOBS = "node_modules/**,.git/**,dist/**,build/**,.next/**"

# An untrusted cloned repo could ship its own repomix.config.* to smuggle
# config-driven behavior into a "local" repomix run (repomix's docs only
# document skipping config auto-load for --remote, not local directories).
# Deleting any of these at the clone root before packing neutralizes that,
# regardless of repomix's undocumented local-mode default.
_REPOMIX_CONFIG_NAMES = (
    "repomix.config.json",
    "repomix.config.js",
    "repomix.config.ts",
    "repomix.config.mjs",
    "repomix.config.cjs",
)

_REPOMIX_BIN = os.environ.get("APEX_REPOMIX_BIN", "repomix")
_GIT_BIN = os.environ.get("APEX_GIT_BIN", "git")


class GithubFetchError(RuntimeError):
    """Raised when the repo cannot be fetched/packed (auth/clone/pack failure).

    `status_code` carries the upstream HTTP status when there was one (0 for
    a clone/pack/transport failure with no HTTP response), so callers can map
    a 401/403/429 through distinctly from a generic 502.
    """

    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


def _get(path: str, pat: str) -> dict:
    if is_blocked_host(_GITHUB_API_HOST) or not egress_host_allowed(_GITHUB_API_HOST):
        raise GithubFetchError("GitHub API host is blocked or not in the egress allowlist.")
    url = f"{_GITHUB_API_BASE}{path}"
    headers = {
        "Authorization": f"token {pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        url, headers, ext = pinned_target(url, headers)
    except ValueError as exc:
        raise GithubFetchError("GitHub host resolves to a private/blocked address.") from exc
    try:
        with httpx.Client(follow_redirects=False, timeout=_API_TIMEOUT) as client:
            resp = client.request("GET", url, headers=headers, **({"extensions": ext} if ext else {}))
    except httpx.RequestError as exc:
        raise GithubFetchError(f"Failed to reach GitHub: {exc}") from exc
    if resp.status_code in (401, 403):
        raise GithubFetchError("GitHub rejected the token (401/403).", status_code=resp.status_code)
    if resp.status_code == 429:
        raise GithubFetchError("GitHub is rate-limiting this token.", status_code=429)
    if resp.status_code >= 400:
        raise GithubFetchError(f"GitHub returned {resp.status_code}.", status_code=resp.status_code)
    return resp.json()


def fetch_default_branch(pat: str, owner: str, repo: str) -> str:
    """Resolve the repo's default branch name.

    A branch name is all `clone_and_pack` needs (git clones by ref, not by a
    separately-resolved commit sha), so this is a single lightweight call.
    """
    data = _get(f"/repos/{owner}/{repo}", pat)
    return data.get("default_branch") or "main"


def _dir_size_bytes(path: Path) -> int:
    total = 0
    for entry in path.rglob("*"):
        if entry.is_file() and not entry.is_symlink():
            total += entry.stat().st_size
    return total


def _strip_repomix_configs(dest: Path) -> None:
    for name in _REPOMIX_CONFIG_NAMES:
        candidate = dest / name
        if candidate.exists():
            candidate.unlink()


def _clone_env(pat: str) -> dict:
    """Auth via git's env-based config (GIT_CONFIG_*), never argv or a URL.

    A URL-embedded PAT (`https://<pat>@github.com/...`) would be visible in
    /proc/<pid>/cmdline to anything with same-UID/root access on the host.
    Passing an `http.extraHeader` value through GIT_CONFIG_COUNT/KEY_n/VALUE_n
    env vars (supported since git 2.31) keeps the token out of argv entirely —
    it only ever lives in this one subprocess's environ.
    """
    basic = base64.b64encode(f"x-access-token:{pat}".encode()).decode()
    return {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_CONFIG_COUNT": "1",
        "GIT_CONFIG_KEY_0": "http.extraHeader",
        "GIT_CONFIG_VALUE_0": f"Authorization: Basic {basic}",
    }


def clone_and_pack(
    pat: str,
    owner: str,
    repo: str,
    ref: str,
    token_budget: int = _DEFAULT_TOKEN_BUDGET,
) -> str:
    """Shallow-clone the repo and pack it into markdown via the `repomix` CLI.

    Raises GithubFetchError on clone failure, an oversized working tree, a
    repomix failure (including going over `token_budget`), or a timeout.
    """
    if is_blocked_host(_GITHUB_CLONE_HOST) or not egress_host_allowed(_GITHUB_CLONE_HOST):
        raise GithubFetchError("GitHub clone host is blocked or not in the egress allowlist.")

    with tempfile.TemporaryDirectory(prefix="apex-github-pack-") as tmp:
        dest = Path(tmp) / "repo"
        clone_url = f"https://{_GITHUB_CLONE_HOST}/{owner}/{repo}.git"
        try:
            result = subprocess.run(
                [
                    _GIT_BIN, "clone",
                    "--depth", "1",
                    "--branch", ref,
                    "--single-branch",
                    clone_url, str(dest),
                ],
                env=_clone_env(pat),
                timeout=_CLONE_TIMEOUT,
                capture_output=True,
                text=True,
            )
        except subprocess.TimeoutExpired as exc:
            raise GithubFetchError("Timed out cloning the repository.") from exc
        if result.returncode != 0:
            stderr = (result.stderr or "").strip()[-2000:]
            code = 401 if "Authentication failed" in stderr or "403" in stderr else 0
            raise GithubFetchError(f"git clone failed: {stderr or 'unknown error'}", status_code=code)

        size = _dir_size_bytes(dest)
        if size > _MAX_CLONE_BYTES:
            raise GithubFetchError(
                f"Repository working tree is {size // 1_000_000}MB, over the "
                f"{_MAX_CLONE_BYTES // 1_000_000}MB cap for context packing."
            )

        _strip_repomix_configs(dest)

        output_path = Path(tmp) / "repomix-output.md"
        try:
            result = subprocess.run(
                [
                    _REPOMIX_BIN, str(dest),
                    "--style", "markdown",
                    "--compress",
                    "--ignore", _IGNORE_GLOBS,
                    "--token-budget", str(token_budget),
                    "-o", str(output_path),
                ],
                cwd=str(dest),
                timeout=_PACK_TIMEOUT,
                capture_output=True,
                text=True,
            )
        except subprocess.TimeoutExpired as exc:
            raise GithubFetchError("Timed out packing the repository.") from exc
        if result.returncode != 0:
            combined = f"{result.stdout or ''}\n{result.stderr or ''}".lower()
            if "token" in combined and "budget" in combined:
                raise GithubFetchError(
                    "Repository is too large to pack within the token budget — "
                    "narrow the ignore patterns or raise the budget."
                )
            trimmed = (result.stderr or result.stdout or "").strip()[-2000:]
            raise GithubFetchError(f"repomix failed: {trimmed or 'unknown error'}")

        if not output_path.exists():
            raise GithubFetchError("repomix did not produce an output file.")
        return output_path.read_text(encoding="utf-8")
