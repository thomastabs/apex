"""Workspace APIs used by the Next.js app shell/sidebar."""

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, status

from backend.app.api.deps import (
    AuthContext,
    RequestContext,
    anchor_instance_id,
    get_auth_context,
    get_request_context,
    resolve_taiga_base,
)
from backend.app.schemas.workspace import (
    AiConfigResponse,
    AiKeyStatusResponse,
    AmendmentsResponse,
    ConfigResponse,
    ContextFilesResponse,
    FigmaTokenResponse,
    GithubPatResponse,
    GithubSyncStatusResponse,
    GithubWebhookConfigResponse,
    ImportBootstrapResponse,
    ImportReconstructResponse,
    LogDecisionRequest,
    OkResponse,
    PhaseStatusResponse,
    SaveAiConfigRequest,
    SaveAiKeyRequest,
    AcknowledgeFigmaChangeRequest,
    SaveConfigRequest,
    ScanFigmaChangesRequest,
    ScanFigmaChangesResponse,
    SetPhaseStatusRequest,
    SetStoryFigmaLinkRequest,
    SyncFigmaContextRequest,
    SaveTraceLayoutRequest,
    StoryIndexStatsResponse,
    TraceabilityGraphResponse,
    UpdateContextFileRequest,
)
from backend.app.api.rate_limit import ai_rate_limit
from backend.app.services.context_service import ContextService
from backend.app.services import github_fetch

_logger = logging.getLogger("apex.workspace")

router = APIRouter()

_CONTEXT_FILES = [
    ("project-concept.md", "Project Concept"),
    ("tech-stack.md", "Technology Choices"),
    ("functional-spec.md", "Functional Spec"),
    ("technical-spec.md", "Technical Spec"),
    ("constraints.md", "Constraints"),
    ("fix-log.md", "Fix Log"),
    ("decisions.md", "Decision Log"),
    ("design-bundle.md", "Design Bundle"),
    ("github-context.md", "GitHub Context"),
    ("figma-context.md", "Figma Context"),
]
_ALLOWED_CONTEXT_FILES = {filename for filename, _ in _CONTEXT_FILES}


@router.get("/config", response_model=ConfigResponse)
def get_config(
    auth: AuthContext = Depends(get_auth_context),
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
    project_id: int | None = None,
):
    from src import context_manager, taiga_adapter
    config = context_manager.load_config()
    pm_tool = config.get("pm_tool", "taiga")
    if pm_tool == "jira":
        from src import jira_adapter
        pm_web_url = jira_adapter.get_web_base_url(config.get("jira_base_url", ""))
    else:
        pm_web_url = taiga_adapter.get_web_base_url()
    context_manager.set_active_instance(anchor_instance_id(x_taiga_url))
    # github_repo/github_pat are per-project — no project_id means no project is
    # selected yet, so there's nothing to scope the read to; report disconnected
    # rather than falling back to some other project's connection.
    github_repo = ""
    github_pat_configured = False
    if project_id is not None:
        context_manager.set_active_project(project_id)
        github_repo = context_manager.get_project_github_repo(project_id)
        github_pat_configured = context_manager.has_project_github_pat(project_id)
    return {
        "project_id": config.get("project_id"),
        "taiga_web_url": pm_web_url,
        "pm_tool": pm_tool,
        "pm_web_url": pm_web_url,
        "github_repo": github_repo,
        "figma_file_key": context_manager.get_instance_figma_file_key(),
        "github_pat_configured": github_pat_configured,
        "figma_token_configured": context_manager.has_instance_figma_token(),
    }


_AI_KEY_ENV_VARS = (("anthropic", "ANTHROPIC_API_KEY"), ("openai", "OPENAI_API_KEY"), ("google", "GOOGLE_API_KEY"))


def _system_providers() -> list[str]:
    import os

    return [provider for provider, env_var in _AI_KEY_ENV_VARS if os.getenv(env_var)]


def _ai_key_status(auth: AuthContext, x_taiga_url: str) -> dict:
    """(personal_providers, configured_providers) for the current account.

    A saved personal key is ALWAYS the active credential for that provider —
    it overrides the deployment's system key unconditionally (src/ai_key_store.py),
    so a provider is "configured" if it has a personal key OR a system env var.
    """
    system = _system_providers()
    personal: list[str] = []
    if auth.account_id:
        from src import ai_key_store

        personal = ai_key_store.saved_providers(anchor_instance_id(x_taiga_url), auth.account_id)
    configured = sorted(set(system) | set(personal))
    return {
        "configured_providers": configured,
        "system_providers": system,
        "personal_providers": personal,
    }


@router.get("/ai-config", response_model=AiConfigResponse)
def get_ai_config(
    auth: AuthContext = Depends(get_auth_context),
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
):
    from src.ai_engine import AVAILABLE_MODELS, get_model
    return {
        "model": get_model(),
        "available_models": AVAILABLE_MODELS,
        **_ai_key_status(auth, x_taiga_url),
    }


@router.post("/ai-config", response_model=AiConfigResponse)
def save_ai_config_endpoint(
    payload: SaveAiConfigRequest,
    auth: AuthContext = Depends(get_auth_context),
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
):
    from src import ai_engine, context_manager
    from src.ai_engine import AVAILABLE_MODELS, get_model
    valid_ids = {m["id"] for m in AVAILABLE_MODELS}
    model = payload.model or get_model()
    if model not in valid_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid model ID.")
    context_manager.save_ai_config(model)
    ai_engine._llm_cache.clear()
    return {
        "model": model,
        "available_models": AVAILABLE_MODELS,
        **_ai_key_status(auth, x_taiga_url),
    }


@router.post("/ai-keys", response_model=AiKeyStatusResponse)
def save_ai_key(
    payload: SaveAiKeyRequest,
    auth: AuthContext = Depends(get_auth_context),
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
):
    """Save *your* personal AI provider key, tied to your Taiga/Jira account —
    it will be there next time you sign in from anywhere, unlike the AI model
    selection above which is a deployment-wide setting. Does not touch the
    deployment's own *_API_KEY env var — the personal key simply takes
    priority over it unconditionally once saved (src/ai_key_store.py)."""
    from src import ai_engine, ai_key_store

    if payload.provider not in ai_key_store.PROVIDERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown provider.")
    if not auth.account_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not determine your PM account — try signing in again.",
        )
    instance_id = anchor_instance_id(x_taiga_url)
    try:
        ai_key_store.save_key(instance_id, auth.account_id, payload.provider, payload.api_key.strip())
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    ai_engine._llm_cache.clear()  # drop any cached client so the new key takes effect immediately
    return {"ok": True, "personal_providers": ai_key_store.saved_providers(instance_id, auth.account_id)}


@router.delete("/ai-keys/{provider}", response_model=AiKeyStatusResponse)
def delete_ai_key(
    provider: str,
    auth: AuthContext = Depends(get_auth_context),
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
):
    from src import ai_engine, ai_key_store

    if provider not in ai_key_store.PROVIDERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown provider.")
    instance_id = anchor_instance_id(x_taiga_url)
    if auth.account_id:
        ai_key_store.delete_key(instance_id, auth.account_id, provider)
        ai_engine._llm_cache.clear()
    personal = ai_key_store.saved_providers(instance_id, auth.account_id) if auth.account_id else []
    return {"ok": True, "personal_providers": personal}


@router.post("/config", response_model=OkResponse)
def save_config(
    payload: SaveConfigRequest,
    auth: AuthContext = Depends(get_auth_context),
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
):
    from backend.app.api.jira_proxy import validate_jira_base_url
    from backend.app.api.taiga_proxy import _validate_taiga_url
    from src import context_manager
    if payload.project_id:
        context_manager.save_config(payload.project_id)
    if payload.pm_tool is not None or payload.jira_base_url is not None or payload.taiga_url is not None:
        # Empty string clears the URL (sent when switching back to Taiga);
        # anything else must pass the same SSRF guard as the proxy paths.
        if payload.jira_base_url:
            validate_jira_base_url(payload.jira_base_url, source="jira_base_url")
        if payload.taiga_url:
            _validate_taiga_url(payload.taiga_url, source="taiga_url")
        context_manager.save_pm_config(
            pm_tool=payload.pm_tool,
            jira_base_url=payload.jira_base_url,
            taiga_url=payload.taiga_url,
        )
    if (payload.github_repo is not None or payload.github_pat is not None) and payload.project_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="project_id required to save GitHub config (per-project, not per-instance).",
        )
    if payload.github_repo is not None:
        context_manager.set_active_instance(anchor_instance_id(x_taiga_url))
        context_manager.set_active_project(payload.project_id)
        context_manager.save_project_github_repo(payload.github_repo)
    if payload.figma_file_key is not None:
        # Per-instance: the Figma file belongs to the Taiga instance this request is for.
        context_manager.set_active_instance(anchor_instance_id(x_taiga_url))
        context_manager.save_instance_figma_file_key(payload.figma_file_key)
    # github_pat/figma_token are encrypted at rest (AI_KEY_ENCRYPTION_SECRET) —
    # if that secret isn't configured on this deployment, encrypt_value() raises
    # RuntimeError. Must not surface as a raw 500: the client still needs its
    # own connect attempt (setGithub/setFigma in the browser session) to
    # succeed regardless of whether server-side persistence is available.
    if payload.github_pat is not None:
        context_manager.set_active_instance(anchor_instance_id(x_taiga_url))
        context_manager.set_active_project(payload.project_id)
        try:
            context_manager.save_project_github_pat(payload.github_pat)
        except RuntimeError as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    if payload.figma_token is not None:
        context_manager.set_active_instance(anchor_instance_id(x_taiga_url))
        try:
            context_manager.save_instance_figma_token(payload.figma_token)
        except RuntimeError as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/github-pat", response_model=GithubPatResponse)
def get_github_pat(
    auth: AuthContext = Depends(get_auth_context),
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
    project_id: int | None = None,
):
    """Dedicated reveal endpoint — the decrypted PAT, for the client to restore
    its browser-direct GitHub session on load. Deliberately NOT part of the
    general /config response (called once on restore, not on every poll).
    github_pat is per-project; no project_id means nothing to restore yet."""
    from src import context_manager
    if project_id is None:
        return {"pat": ""}
    context_manager.set_active_instance(anchor_instance_id(x_taiga_url))
    context_manager.set_active_project(project_id)
    return {"pat": context_manager.get_project_github_pat(project_id)}


@router.get("/figma-token", response_model=FigmaTokenResponse)
def get_figma_token(
    auth: AuthContext = Depends(get_auth_context),
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
):
    """Dedicated reveal endpoint — see get_github_pat."""
    from src import context_manager
    context_manager.set_active_instance(anchor_instance_id(x_taiga_url))
    return {"token": context_manager.get_instance_figma_token()}


@router.get("/github-webhook", response_model=GithubWebhookConfigResponse)
def get_github_webhook_config(
    auth: AuthContext = Depends(get_auth_context),
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
    project_id: int | None = None,
):
    """Secret + instance id for wiring up POST /api/webhooks/github/{instance_id}/{project_id}
    as this instance's GitHub push webhook (auto regression re-scan on push —
    see backend/app/api/github_webhook.py). The frontend builds the full URL
    with the active project_id, since one instance can have multiple projects.
    The webhook secret itself stays instance-scoped (its URL already embeds
    project_id, so a shared secret isn't the same leakage bug that github_repo/
    github_pat had, and rotating it would break every already-configured GitHub
    webhook) — only the "configured" flag below is project-scoped."""
    from src import context_manager
    instance_id = anchor_instance_id(x_taiga_url)
    context_manager.set_active_instance(instance_id)
    configured = False
    if project_id is not None:
        context_manager.set_active_project(project_id)
        configured = bool(context_manager.get_project_github_repo(project_id).strip())
    return {
        "instance_id": instance_id,
        "secret": context_manager.get_or_create_instance_github_webhook_secret(),
        "configured": configured,
    }


@router.get("/github/sync-status", response_model=GithubSyncStatusResponse)
def github_sync_status(ctx: RequestContext = Depends(get_request_context)):
    """Cheap poll target for auto-resync: just the two timestamps, never the
    (potentially huge) file content — contrast with /context-files."""
    import datetime
    context = ContextService()
    context.set_active(ctx)
    context_synced_at: str | None = None
    fpath = context.file_path("github-context.md")
    try:
        if fpath.exists():
            mtime = fpath.stat().st_mtime
            context_synced_at = datetime.datetime.fromtimestamp(mtime, tz=datetime.timezone.utc).isoformat()
    except Exception as _stat_exc:
        _logger.debug("github sync-status: could not read github-context.md mtime: %s", _stat_exc)
    return {"last_push_at": context.last_github_push(), "context_synced_at": context_synced_at}


@router.get("/context-files", response_model=ContextFilesResponse)
def get_context_files(ctx: RequestContext = Depends(get_request_context)):
    import datetime
    context = ContextService()
    context.set_active(ctx)
    files = []
    for filename, label in _CONTEXT_FILES:
        content = context.read_context_file(filename)
        fpath = context.file_path(filename)
        last_modified: str | None = None
        try:
            if fpath.exists():
                mtime = fpath.stat().st_mtime
                last_modified = datetime.datetime.fromtimestamp(mtime, tz=datetime.timezone.utc).isoformat()
        except Exception as _stat_exc:
            _logger.debug("context-files: could not read mtime for %s: %s", filename, _stat_exc)
        files.append({
            "filename": filename,
            "label": label,
            "content": content,
            "chars": len(content),
            "last_modified": last_modified,
            "version": context.spec_version(filename),
        })
    return {"files": files, "total_chars": sum(file["chars"] for file in files)}


@router.get("/traceability-graph", response_model=TraceabilityGraphResponse)
def traceability_graph(scenarios: bool = False, ctx: RequestContext = Depends(get_request_context)):
    """Project-wide derivation graph (pure, no AI) for the traceability view."""
    from backend.app.services.traceability_service import TraceabilityService

    context = ContextService()
    try:
        return TraceabilityService(context=context).build_graph(ctx, include_scenarios=scenarios)
    except Exception as exc:
        _logger.exception("traceability_graph failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to build the traceability graph.",
        ) from exc


@router.put("/traceability-graph/positions", response_model=OkResponse)
def save_traceability_layout(
    payload: SaveTraceLayoutRequest,
    ctx: RequestContext = Depends(get_request_context),
):
    """Persist manual node positions for the traceability graph."""
    from backend.app.services.traceability_service import TraceabilityService

    try:
        TraceabilityService(context=ContextService()).save_layout(
            ctx, [n.model_dump() for n in payload.nodes],
        )
    except Exception as exc:
        _logger.exception("save_traceability_layout failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save the graph layout.",
        ) from exc
    return {"ok": True}


@router.post("/context-files/rebuild-index", response_model=OkResponse)
def rebuild_story_index(ctx: RequestContext = Depends(get_request_context)):
    context = ContextService()
    context.set_active(ctx)
    try:
        context.rebuild_story_index()
    except Exception as exc:
        _logger.exception("rebuild_story_index failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to rebuild story index.") from exc
    return {"ok": True}


@router.delete("/context-files/story-index/epics/{epic_id}", response_model=OkResponse)
def remove_epic_from_story_index(epic_id: int, ctx: RequestContext = Depends(get_request_context)):
    context = ContextService()
    context.set_active(ctx)
    try:
        context.remove_epic_from_story_index(epic_id)
    except Exception as exc:
        _logger.exception("remove_epic_from_story_index failed epic_id=%s: %s", epic_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update story index.",
        ) from exc
    return {"ok": True}


@router.delete("/context-files/story-index/stories/{story_id}", response_model=OkResponse)
def remove_story_from_story_index(story_id: int, ctx: RequestContext = Depends(get_request_context)):
    context = ContextService()
    context.set_active(ctx)
    try:
        context.remove_story_index_entries([story_id])
    except Exception as exc:
        _logger.exception("remove_story_from_story_index failed story_id=%s: %s", story_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update story index.",
        ) from exc
    return {"ok": True}


@router.get(
    "/context-files/story-index/stories/{story_id}/phase-status",
    response_model=PhaseStatusResponse,
)
def get_story_phase_status(story_id: int, ctx: RequestContext = Depends(get_request_context)):
    context = ContextService()
    context.set_active(ctx)
    entry = context.story_index().get(str(story_id)) or {}
    return {"phase_status": entry.get("phase_status")}


@router.post(
    "/context-files/story-index/stories/{story_id}/phase-status",
    response_model=OkResponse,
)
def set_story_phase_status(
    story_id: int,
    payload: SetPhaseStatusRequest,
    ctx: RequestContext = Depends(get_request_context),
):
    context = ContextService()
    context.set_active(ctx)
    if str(story_id) not in context.story_index():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story is not in the index — publish it from Phase 1 first.",
        )
    try:
        context.upsert_story_index(story_id, phase_status=payload.phase_status)
    except Exception as exc:
        _logger.exception("set_story_phase_status failed story_id=%s: %s", story_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update story phase status.",
        ) from exc
    return {"ok": True}


@router.get("/context-files/story-index-stats", response_model=StoryIndexStatsResponse)
def story_index_stats(ctx: RequestContext = Depends(get_request_context)):
    from src.ai_engine import TRACE_PHASE_LABEL

    context = ContextService()
    context.set_active(ctx)
    try:
        index = context.story_index()
    except Exception as _idx_exc:
        _logger.warning("story_index_stats: failed to load index: %s", _idx_exc)
        index = {}
    stories = list(index.values())
    total = len(stories)
    return {
        "total": total,
        "phase2_designed": sum(1 for s in stories if s.get("has_tech_spec")),
        "phase3_proposed": sum(1 for s in stories if s.get("has_proposal")),
        "phase4_tested":   sum(1 for s in stories if s.get("has_bdd")),
        "phase4_passed":   sum(1 for s in stories if s.get("phase_status") in ("qa_passed", "deployed")),
        "phase5_deployed": sum(1 for s in stories if s.get("phase_status") == "deployed"),
        "spec_drift":      sum(1 for s in stories if s.get("spec_drift")),
        "drifted_story_ids": sorted(
            s["story_id"] for s in stories if s.get("spec_drift") and s.get("story_id") is not None
        ),
        "conformance_regressed": sum(1 for s in stories if s.get("conformance_regressed")),
        "regressed_story_ids": sorted(
            s["story_id"] for s in stories
            if s.get("conformance_regressed") and s.get("story_id") is not None
        ),
        "trace_flagged": sum(1 for s in stories if s.get("trace_flag")),
        "trace_story_ids": sorted(
            s["story_id"] for s in stories if s.get("trace_flag") and s.get("story_id") is not None
        ),
        "trace_flags": [
            {
                "story_id": s["story_id"],
                "phase": s.get("trace_phase", ""),
                "phase_label": TRACE_PHASE_LABEL.get(s.get("trace_phase", ""), ""),
                "reason": s.get("trace_reason", ""),
            }
            for s in sorted(
                (s for s in stories if s.get("trace_flag") and s.get("story_id") is not None),
                key=lambda s: s["story_id"],
            )
        ],
        "design_conflict": sum(1 for s in stories if s.get("design_conflict")),
        "conflicted_story_ids": sorted(
            s["story_id"] for s in stories if s.get("design_conflict") and s.get("story_id") is not None
        ),
        "conflict_flags": [
            {"story_id": s["story_id"], "reason": s.get("conflict_reason", "")}
            for s in sorted(
                (s for s in stories if s.get("design_conflict") and s.get("story_id") is not None),
                key=lambda s: s["story_id"],
            )
        ],
        "figma_links": [
            {
                "story_id": s["story_id"],
                "figma_node_id": s.get("figma_node_id", ""),
                "figma_file_key": s.get("figma_file_key", ""),
            }
            for s in sorted(
                (s for s in stories if s.get("figma_node_id") and s.get("story_id") is not None),
                key=lambda s: s["story_id"],
            )
        ],
        "figma_changed": sum(1 for s in stories if s.get("figma_changed")),
        "figma_changed_story_ids": sorted(
            s["story_id"] for s in stories if s.get("figma_changed") and s.get("story_id") is not None
        ),
    }


@router.post(
    "/context-files/story-index/stories/{story_id}/acknowledge-drift",
    response_model=OkResponse,
)
def acknowledge_spec_drift(story_id: int, ctx: RequestContext = Depends(get_request_context)):
    context = ContextService()
    context.set_active(ctx)
    context.clear_spec_drift(story_id)
    return {"ok": True}


@router.post(
    "/context-files/story-index/stories/{story_id}/acknowledge-trace",
    response_model=OkResponse,
)
def acknowledge_backward_trace(story_id: int, ctx: RequestContext = Depends(get_request_context)):
    context = ContextService()
    context.set_active(ctx)
    context.clear_trace_flag(story_id)
    return {"ok": True}


@router.post(
    "/context-files/story-index/stories/{story_id}/acknowledge-conflict",
    response_model=OkResponse,
)
def acknowledge_design_conflict(story_id: int, ctx: RequestContext = Depends(get_request_context)):
    context = ContextService()
    context.set_active(ctx)
    context.clear_design_conflict(story_id)
    return {"ok": True}


@router.post(
    "/context-files/story-index/stories/{story_id}/figma-link",
    response_model=OkResponse,
)
def set_story_figma_link(
    story_id: int,
    payload: SetStoryFigmaLinkRequest,
    ctx: RequestContext = Depends(get_request_context),
):
    """Link (or unlink with an empty id) a story to a Figma frame node."""
    context = ContextService()
    context.set_active(ctx)
    context.set_story_figma_link(
        story_id, payload.figma_node_id, payload.figma_modified,
        payload.figma_file_key,
    )
    return {"ok": True}


@router.post("/figma/sync-context", response_model=ContextFilesResponse)
def sync_figma_context(
    payload: SyncFigmaContextRequest,
    x_figma_token: str = Header(default="", alias="X-Figma-Token"),
    ctx: RequestContext = Depends(get_request_context),
):
    """Assemble figma-context.md server-side from a single Figma fetch and write it.

    The browser makes ONE call here; the ~5 upstream Figma calls (file + comments +
    published styles/components/nodes for design tokens) happen server-side, reusing
    the Autopilot assembler so interactive Sync and Autopilot produce identical
    context (screens + prototype flows + design system + comments). A Figma 429 is
    mapped through as a 429 with Figma's real reason (plan tier + Retry-After)."""
    token = x_figma_token.strip()
    if not token or "\r" in x_figma_token or "\n" in x_figma_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="X-Figma-Token header required.")
    file_key = payload.figma_file_key.strip()
    if not file_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="figma_file_key required.")
    from backend.app.services import figma_fetch
    try:
        md, _frames, _flows = figma_fetch.fetch_context_and_frames(token, file_key)
    except figma_fetch.FigmaFetchError as exc:
        code = exc.status_code if exc.status_code in (401, 403, 429) else status.HTTP_502_BAD_GATEWAY
        raise HTTPException(status_code=code, detail=str(exc)) from exc
    context = ContextService()
    context.set_active(ctx)
    context.write_context_file("figma-context.md", md)
    return get_context_files(ctx)


@router.post("/github/sync-context", response_model=ContextFilesResponse)
def sync_github_context(
    ctx: RequestContext = Depends(get_request_context),
    _rl: None = Depends(ai_rate_limit),
):
    """Clone the configured repo server-side and pack it into github-context.md.

    Unlike Figma's sync (browser sends a per-request token), the GitHub PAT and
    repo are already persisted server-side, so this route takes no body — it
    reads context.github_pat()/github_repo() directly. Replaces the browser-side
    fetchGithubContextMd (tree + README + one config file, ~14KB cap) with a real
    clone + repomix pack, so Phase 2-6 AI prompts see actual file contents."""
    context = ContextService()
    context.set_active(ctx)
    pat = context.github_pat()
    repo_full = (context.github_repo() or "").strip()
    if not pat:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No GitHub PAT configured.")
    if not repo_full or "/" not in repo_full:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No GitHub repo configured.")
    owner, _, repo = repo_full.partition("/")
    try:
        ref = github_fetch.fetch_default_branch(pat, owner, repo)
        md = github_fetch.clone_and_pack(pat, owner, repo, ref)
    except github_fetch.GithubFetchError as exc:
        code = exc.status_code if exc.status_code in (401, 403, 429) else status.HTTP_502_BAD_GATEWAY
        raise HTTPException(status_code=code, detail=str(exc)) from exc
    context.write_context_file("github-context.md", md)
    # Controlled co-evolution: preserve drift-flagging parity with the generic
    # PUT /context-files/{filename} route (sync_figma_context does not call this,
    # but github-context.md's server-side repack should flag downstream stories
    # for re-derivation the same way a manual edit would).
    context.amend_locked_spec("github-context.md", "Server-side GitHub sync")
    return get_context_files(ctx)


@router.post("/figma/scan-changes", response_model=ScanFigmaChangesResponse)
def scan_figma_changes(
    payload: ScanFigmaChangesRequest,
    ctx: RequestContext = Depends(get_request_context),
):
    """Flag linked stories whose Figma file changed since they were linked.

    The browser passes the file's current lastModified (fetched via the proxy);
    each linked story with an older baseline is flagged figma_changed."""
    context = ContextService()
    context.set_active(ctx)
    if payload.modified_by_file is not None:
        return {
            "changed_story_ids": context.scan_figma_changes_multi(payload.modified_by_file)
        }
    return {"changed_story_ids": context.scan_figma_changes(payload.current_modified)}


@router.post(
    "/context-files/story-index/stories/{story_id}/acknowledge-figma-change",
    response_model=OkResponse,
)
def acknowledge_figma_change(
    story_id: int,
    payload: AcknowledgeFigmaChangeRequest,
    ctx: RequestContext = Depends(get_request_context),
):
    """Clear the design-changed flag and re-baseline the story to the current file version."""
    context = ContextService()
    context.set_active(ctx)
    context.acknowledge_figma_change(
        story_id, payload.current_modified, payload.figma_file_key
    )
    return {"ok": True}


@router.post("/decisions", response_model=OkResponse)
def log_decision(payload: LogDecisionRequest, ctx: RequestContext = Depends(get_request_context)):
    context = ContextService()
    context.set_active(ctx)
    context.append_decision_record(payload.scope, payload.summary, payload.reason)
    return {"ok": True}


@router.get("/context-files/amendments", response_model=AmendmentsResponse)
def get_amendments(ctx: RequestContext = Depends(get_request_context)):
    context = ContextService()
    context.set_active(ctx)
    return {"amendments_md": context.get_amendments()}


@router.post("/context-files/reset-all", response_model=ContextFilesResponse)
def reset_all_context_files(ctx: RequestContext = Depends(get_request_context)):
    context = ContextService()
    context.set_active(ctx)
    for filename, _ in _CONTEXT_FILES:
        context.reset_context_file(filename)
    context.clear_story_index()
    return get_context_files(ctx)


@router.put("/context-files/{filename}", response_model=ContextFilesResponse)
def update_context_file(
    filename: str,
    payload: UpdateContextFileRequest,
    ctx: RequestContext = Depends(get_request_context),
):
    if filename not in _ALLOWED_CONTEXT_FILES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown context file.")
    context = ContextService()
    context.set_active(ctx)
    context.write_context_file(filename, payload.content)
    # Controlled co-evolution: a post-lock edit to a spec artifact is logged as
    # an amendment and flags downstream stories for re-derivation (never silent).
    drift = context.amend_locked_spec(filename, payload.note)
    response = get_context_files(ctx)
    if drift.get("amended"):
        response["drift"] = drift
    return response


@router.post("/context-files/{filename}/reset", response_model=ContextFilesResponse)
def reset_context_file(filename: str, ctx: RequestContext = Depends(get_request_context)):
    if filename not in _ALLOWED_CONTEXT_FILES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown context file.")
    context = ContextService()
    context.set_active(ctx)
    context.reset_context_file(filename)
    return get_context_files(ctx)


# ---------------------------------------------------------------------------
# Taiga import — onboard an ongoing project into Apex
# ---------------------------------------------------------------------------

@router.post("/import-from-pm", response_model=ImportBootstrapResponse)
def import_from_pm_bootstrap(
    ctx: RequestContext = Depends(get_request_context),
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
):
    """Step 1 (no AI): pull epics + stories from Taiga, populate story-index.

    Skips stories already present in the index so re-runs are safe.
    Only supported when pm_tool=taiga.
    """
    from backend.app.services import import_service

    taiga_base = resolve_taiga_base(x_taiga_url)
    context = ContextService()
    context.set_active(ctx)
    context.init_context()

    try:
        result = import_service.bootstrap(taiga_base, ctx.pm_token, ctx.project_id)
    except Exception as exc:
        _logger.error("import bootstrap failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch from Taiga: {exc}",
        ) from exc

    return result


@router.post("/import-from-pm/reconstruct-epic/{epic_id}", response_model=ImportReconstructResponse)
def import_reconstruct_epic(
    epic_id: int,
    ctx: RequestContext = Depends(get_request_context),
    x_taiga_url: str = Header(default="", alias="X-Taiga-Url"),
):
    """Step 2 (AI): generate Gherkin for all stories in one epic, one AI call.

    epic_id=0 is the synthetic General epic (orphan stories with no Taiga epic).
    Writes Gherkin to functional-spec.md and advances stories to gherkin_locked.
    """
    from backend.app.services import import_service

    taiga_base = resolve_taiga_base(x_taiga_url)
    context = ContextService()
    context.set_active(ctx)
    context.init_context()

    try:
        result = import_service.reconstruct_epic(epic_id, taiga_base, ctx.pm_token, ctx.project_id)
    except Exception as exc:
        _logger.error("import reconstruct epic=%s failed: %s", epic_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gherkin reconstruction failed: {exc}",
        ) from exc

    return result
