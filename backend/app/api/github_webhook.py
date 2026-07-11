"""GitHub push webhook -> auto context repack + auto regression re-scan.

Loop-closing counterpart to three manual actions: the "Sync Context" button,
the "Scan for regressions" button (phase6_service.scan_regressions), and (as
of the server-side clone+repomix pack) github-context.md's own freshness.
GitHub calls this endpoint on every push; Apex re-clones and repacks
github-context.md unconditionally (github_fetch.clone_and_pack, same PAT the
manual sync route uses — the webhook now has full server-side PAT access,
same as any other request), and additionally works out which stories' saved
dev-pack files were touched to re-verify just those
(phase6_service.scan_regressions_for_stories) — no CI, no polling.

Unauthenticated by design (GitHub can't send a Bearer token) — gated instead
by HMAC-SHA256 signature verification against a per-instance secret
(get_or_create_instance_github_webhook_secret), same mechanism GitHub itself
recommends for webhook receivers. The signature check happens before the
payload is trusted for anything, including which instance/project it claims
to be for.
"""

import hashlib
import hmac
import json
import logging
import time

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request, status

from backend.app.services import github_fetch
from backend.app.services.context_service import ContextService
from backend.app.services.phase6_service import Phase6Service
from backend.app.services.request_context import RequestContext
from src import ai_engine

router = APIRouter()
_logger = logging.getLogger("apex.github_webhook")

# Per-(instance, project) cooldown so a burst of pushes (a rebase-and-force-push,
# a squash-merge series) can't fire N full clone+repack / AI re-verification
# cycles back to back. Shared by both the repack and the scan below — one gate,
# not two independent cooldowns. Process-local — matches deps.py's token/project
# caches; a restart just resets the cooldown, which is a fine failure mode for a
# rate limit (not a security control) on a backend pinned to a single replica/worker.
_COOLDOWN_SECONDS = 300.0
_last_run: dict[tuple[str, int], float] = {}


def _verify_signature(secret: str, body: bytes, signature: str) -> bool:
    if not signature.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature[len("sha256="):])


def _touched_files(payload: dict) -> set[str]:
    files: set[str] = set()
    for commit in payload.get("commits", None) or []:
        for key in ("added", "modified", "removed"):
            files.update(commit.get(key) or [])
    return files


def _matched_story_ids(context: ContextService, touched: set[str]) -> list[int]:
    """Stories whose saved dev-pack ('Files to Change') overlaps the push's
    touched files — pure string matching, no AI."""
    if not touched:
        return []
    matched: set[int] = set()
    for pack in context.load_all_proposals():
        pack_files = set(ai_engine.parse_pack_files(pack.get("proposal_md", "")))
        if pack_files & touched:
            matched.add(pack["story_id"])
    return sorted(matched)


def _run_repack(instance_id: str, project_id: int) -> None:
    """Runs as a FastAPI BackgroundTask: re-clone + repack github-context.md.

    Own try/except, never raises — the webhook's 200 was already sent by the
    time this runs, and a repack failure must not affect the scan task or the
    response GitHub already got."""
    try:
        ctx = RequestContext(pm_token="", project_id=project_id, instance_id=instance_id)
        context = ContextService()
        context.set_active(ctx)
        pat = context.github_pat()
        repo_full = (context.github_repo() or "").strip()
        if not pat or "/" not in repo_full:
            return
        owner, _, repo = repo_full.partition("/")
        ref = github_fetch.fetch_default_branch(pat, owner, repo)
        md = github_fetch.clone_and_pack(pat, owner, repo, ref)
        context.write_context_file("github-context.md", md)
        context.amend_locked_spec("github-context.md", "Server-side GitHub sync (auto, push webhook)")
        _logger.info("github_webhook_repack instance=%s project=%s chars=%s", instance_id, project_id, len(md))
    except Exception:
        _logger.warning(
            "github_webhook_repack_failed instance=%s project=%s",
            instance_id, project_id, exc_info=True,
        )


def _run_scan(instance_id: str, project_id: int, story_ids: list[int]) -> None:
    """Runs as a FastAPI BackgroundTask, after the webhook response is already
    sent — GitHub's webhook delivery times out at 10s; AI re-verification of
    even a couple of stories routinely takes longer than that."""
    try:
        ctx = RequestContext(pm_token="", project_id=project_id, instance_id=instance_id)
        result = Phase6Service().scan_regressions_for_stories(ctx, story_ids)
        _logger.info(
            "github_webhook_scan instance=%s project=%s stories=%s regressed=%s",
            instance_id, project_id, story_ids, result["regressed_ids"],
        )
    except Exception:
        _logger.warning(
            "github_webhook_scan_failed instance=%s project=%s stories=%s",
            instance_id, project_id, story_ids, exc_info=True,
        )


@router.post("/github/{instance_id}/{project_id}")
async def github_push_webhook(
    instance_id: str,
    project_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    x_hub_signature_256: str = Header(default="", alias="X-Hub-Signature-256"),
    x_github_event: str = Header(default="", alias="X-GitHub-Event"),
):
    body = await request.body()

    context = ContextService()
    context.set_active_instance(instance_id)
    secret = context.github_webhook_secret()
    if not _verify_signature(secret, body, x_hub_signature_256):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature.")

    if x_github_event != "push":
        # "ping" (sent when the webhook is first created) and anything else:
        # cheap 200 so GitHub doesn't flag the delivery as failed and retry.
        return {"ok": True, "ignored": x_github_event or "unknown"}

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload.")

    # github_repo is per-project — the project must be active BEFORE reading it,
    # not after (it used to be read here while only the instance was set, back
    # when github_repo was itself instance-scoped; now that would silently read
    # some other project's repo, or none).
    context.set_project(project_id)

    configured_repo = context.github_repo().strip()
    pushed_repo = ((payload.get("repository") or {}).get("full_name") or "").strip()
    if configured_repo and pushed_repo and configured_repo != pushed_repo:
        # Signature already proved the secret is right; this just guards against
        # the same secret accidentally being reused across a second repo.
        return {"ok": True, "ignored": f"repo mismatch ({pushed_repo} != {configured_repo})"}

    context.record_github_push()
    touched = _touched_files(payload)
    story_ids = _matched_story_ids(context, touched)

    # One shared cooldown gate for both the repack (every push) and the scan
    # (only pushes touching a tracked story) — repacking must not wait on
    # story_ids being non-empty, so this check runs before that branch, not after.
    cache_key = (instance_id, project_id)
    now = time.monotonic()
    last = _last_run.get(cache_key)
    # Presence-based, not a 0.0 default: time.monotonic()'s epoch is undefined
    # (often since-boot on Linux) — on a freshly-booted host with uptime under
    # _COOLDOWN_SECONDS, `now - 0.0 < _COOLDOWN_SECONDS` would be true even for
    # a cache_key that has never run, falsely reporting "cooldown" on the very
    # first push.
    if last is not None and now - last < _COOLDOWN_SECONDS:
        return {"ok": True, "matched_stories": story_ids, "skipped": "cooldown"}
    _last_run[cache_key] = now

    background_tasks.add_task(_run_repack, instance_id, project_id)
    if not story_ids:
        return {"ok": True, "matched_stories": [], "repacking": True}

    background_tasks.add_task(_run_scan, instance_id, project_id, story_ids)
    return {"ok": True, "matched_stories": story_ids, "scanning": True, "repacking": True}
