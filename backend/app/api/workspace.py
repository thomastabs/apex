"""Workspace APIs used by the Next.js app shell/sidebar."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.api.deps import AuthContext, RequestContext, get_auth_context, get_request_context
from backend.app.schemas.workspace import (
    AiConfigResponse,
    ConfigResponse,
    ContextFilesResponse,
    OkResponse,
    SaveAiConfigRequest,
    SaveConfigRequest,
    StoryIndexStatsResponse,
    UpdateContextFileRequest,
)
from backend.app.services.context_service import ContextService

_logger = logging.getLogger("apex.workspace")

router = APIRouter()

_CONTEXT_FILES = [
    ("project-concept.md", "Project Concept"),
    ("tech-stack.md", "Technology Choices"),
    ("functional-spec.md", "Functional Spec"),
    ("technical-spec.md", "Technical Spec"),
    ("vaccines.md", "Vaccine Records"),
    ("design-bundle.md", "Design Bundle"),
    ("github-context.md", "GitHub Context"),
]
_ALLOWED_CONTEXT_FILES = {filename for filename, _ in _CONTEXT_FILES}


@router.get("/config", response_model=ConfigResponse)
def get_config(auth: AuthContext = Depends(get_auth_context)):
    from src import context_manager, taiga_adapter
    config = context_manager.load_config()
    pm_tool = config.get("pm_tool", "taiga")
    if pm_tool == "jira":
        from src import jira_adapter
        pm_web_url = jira_adapter.get_web_base_url(config.get("jira_base_url", ""))
    else:
        pm_web_url = taiga_adapter.get_web_base_url()
    return {
        "project_id": config.get("project_id"),
        "taiga_web_url": pm_web_url,
        "pm_tool": pm_tool,
        "pm_web_url": pm_web_url,
        "github_repo": config.get("github_repo", ""),
    }


def _configured_providers() -> list[str]:
    import os
    providers = []
    if os.getenv("ANTHROPIC_API_KEY"):
        providers.append("anthropic")
    if os.getenv("OPENAI_API_KEY"):
        providers.append("openai")
    if os.getenv("GOOGLE_API_KEY"):
        providers.append("google")
    return providers


@router.get("/ai-config", response_model=AiConfigResponse)
def get_ai_config(auth: AuthContext = Depends(get_auth_context)):
    from src.ai_engine import AVAILABLE_MODELS, get_model
    return {
        "model": get_model(),
        "available_models": AVAILABLE_MODELS,
        "configured_providers": _configured_providers(),
    }


@router.post("/ai-config", response_model=AiConfigResponse)
def save_ai_config_endpoint(payload: SaveAiConfigRequest, auth: AuthContext = Depends(get_auth_context)):
    from src import ai_engine, context_manager
    from src.ai_engine import AVAILABLE_MODELS, get_model
    valid_ids = {m["id"] for m in AVAILABLE_MODELS}
    model = payload.model or get_model()
    if model not in valid_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid model ID.")
    context_manager.save_ai_config(model)
    ai_engine._llm_cache.clear()
    return {"model": model, "available_models": AVAILABLE_MODELS, "configured_providers": _configured_providers()}


@router.post("/config", response_model=OkResponse)
def save_config(payload: SaveConfigRequest, auth: AuthContext = Depends(get_auth_context)):
    from backend.app.api.jira_proxy import validate_jira_base_url
    from src import context_manager
    if payload.project_id:
        context_manager.save_config(payload.project_id)
    if payload.pm_tool is not None or payload.jira_base_url is not None:
        # Empty string clears the URL (sent when switching back to Taiga);
        # anything else must pass the same SSRF guard as the proxy paths.
        if payload.jira_base_url:
            validate_jira_base_url(payload.jira_base_url, source="jira_base_url")
        context_manager.save_pm_config(
            pm_tool=payload.pm_tool,
            jira_base_url=payload.jira_base_url,
        )
    if payload.github_repo is not None:
        context_manager.save_github_config(payload.github_repo)
    return {"ok": True}


@router.get("/context-files", response_model=ContextFilesResponse)
def get_context_files(ctx: RequestContext = Depends(get_request_context)):
    import datetime
    from src import context_manager as _cm
    context = ContextService()
    context.set_project(ctx.project_id)
    files = []
    for filename, label in _CONTEXT_FILES:
        content = context.read_context_file(filename)
        fpath = _cm.get_file_path(filename)
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
        })
    return {"files": files, "total_chars": sum(file["chars"] for file in files)}


@router.post("/context-files/rebuild-index", response_model=OkResponse)
def rebuild_story_index(ctx: RequestContext = Depends(get_request_context)):
    from src import context_manager
    context_manager.set_active_project(ctx.project_id)
    try:
        context_manager.rebuild_story_index()
    except Exception as exc:
        _logger.exception("rebuild_story_index failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to rebuild story index.") from exc
    return {"ok": True}


@router.delete("/context-files/story-index/epics/{epic_id}", response_model=OkResponse)
def remove_epic_from_story_index(epic_id: int, ctx: RequestContext = Depends(get_request_context)):
    from src import context_manager
    context_manager.set_active_project(ctx.project_id)
    try:
        context_manager.remove_epic_from_story_index(epic_id)
    except Exception as exc:
        _logger.exception("remove_epic_from_story_index failed epic_id=%s: %s", epic_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update story index.",
        ) from exc
    return {"ok": True}


@router.delete("/context-files/story-index/stories/{story_id}", response_model=OkResponse)
def remove_story_from_story_index(story_id: int, ctx: RequestContext = Depends(get_request_context)):
    from src import context_manager
    context_manager.set_active_project(ctx.project_id)
    try:
        context_manager.remove_story_index_entries([story_id])
    except Exception as exc:
        _logger.exception("remove_story_from_story_index failed story_id=%s: %s", story_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update story index.",
        ) from exc
    return {"ok": True}


@router.get("/context-files/story-index-stats", response_model=StoryIndexStatsResponse)
def story_index_stats(ctx: RequestContext = Depends(get_request_context)):
    from src import context_manager
    context_manager.set_active_project(ctx.project_id)
    try:
        index = context_manager.get_story_index()
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
    }


@router.post("/context-files/reset-all", response_model=ContextFilesResponse)
def reset_all_context_files(ctx: RequestContext = Depends(get_request_context)):
    from src import context_manager
    context = ContextService()
    context.set_project(ctx.project_id)
    for filename, _ in _CONTEXT_FILES:
        context.reset_context_file(filename)
    context_manager.set_active_project(ctx.project_id)
    context_manager.clear_story_index()
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
    context.set_project(ctx.project_id)
    context.write_context_file(filename, payload.content)
    return get_context_files(ctx)


@router.post("/context-files/{filename}/reset", response_model=ContextFilesResponse)
def reset_context_file(filename: str, ctx: RequestContext = Depends(get_request_context)):
    if filename not in _ALLOWED_CONTEXT_FILES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown context file.")
    context = ContextService()
    context.set_project(ctx.project_id)
    context.reset_context_file(filename)
    return get_context_files(ctx)
