"""Workspace APIs used by the Next.js app shell/sidebar."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

_logger = logging.getLogger("apex.workspace")

from backend.app.api.deps import AuthContext, RequestContext, get_auth_context, get_request_context
from backend.app.schemas.workspace import (
    ContextFilesResponse,
    CreateEpicRequest,
    CreateProjectRequest,
    CreateStoryRequest,
    EpicWithStoriesSchema,
    InviteMemberRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
    ProjectSchema,
    UpdateContextFileRequest,
    UpdateEpicRequest,
    UpdateMemberRoleRequest,
    UpdateStoryRequest,
    UsersResponse,
)
from backend.app.services.context_service import ContextService
from backend.app.services.taiga_service import TaigaService
from src import taiga_adapter
from src.taiga_adapter import TaigaAPIError

router = APIRouter()

_CONTEXT_FILES = [
    ("memory-bank.md", "Memory Bank"),
    ("functional-spec.md", "Functional Spec"),
    ("technical-spec.md", "Technical Spec"),
    ("vaccines.md", "Vaccine Records"),
    ("design-bundle.md", "Design Bundle"),
]
_ALLOWED_CONTEXT_FILES = {filename for filename, _ in _CONTEXT_FILES}


def _taiga_error(exc: TaigaAPIError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.user_message)


def _me_payload(me: dict) -> dict:
    return {
        "id": me.get("id"),
        "username": me.get("username", ""),
        "full_name": me.get("full_name", ""),
        "email": me.get("email", ""),
    }


@router.get("/config")
def get_config(auth: AuthContext = Depends(get_auth_context)):
    from src import context_manager, taiga_adapter
    config = context_manager.load_config()
    return {
        "project_id": config.get("project_id"),
        "taiga_web_url": taiga_adapter._web_base_url(),
    }


@router.get("/ai-config")
def get_ai_config(auth: AuthContext = Depends(get_auth_context)):
    from src.ai_engine import AVAILABLE_MODELS, get_coder_model, get_fast_model
    return {
        "fast_model": get_fast_model(),
        "coder_model": get_coder_model(),
        "available_models": AVAILABLE_MODELS,
    }


@router.post("/ai-config")
def save_ai_config_endpoint(payload: dict, auth: AuthContext = Depends(get_auth_context)):
    from src import ai_engine, context_manager
    from src.ai_engine import AVAILABLE_MODELS, get_coder_model, get_fast_model
    valid_ids = {m["id"] for m in AVAILABLE_MODELS}
    fast = payload.get("fast_model") or get_fast_model()
    coder = payload.get("coder_model") or get_coder_model()
    if fast not in valid_ids or coder not in valid_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid model ID.")
    context_manager.save_ai_config(fast, coder)
    ai_engine._llm_cache.clear()
    return {"fast_model": fast, "coder_model": coder}


@router.post("/config")
def save_config(payload: dict, auth: AuthContext = Depends(get_auth_context)):
    from src import context_manager
    project_id = payload.get("project_id")
    if project_id:
        context_manager.save_config(int(project_id))
    return {"ok": True}


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    taiga = TaigaService()
    try:
        token = taiga.login(payload.username, payload.password)
        me = taiga.get_me()
        return {"auth_token": token, "me": _me_payload(me)}
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.get("/me", response_model=MeResponse)
def get_me(auth: AuthContext = Depends(get_auth_context)):
    taiga = TaigaService()
    taiga.set_token(auth.taiga_token)
    try:
        me = taiga.get_me()
        return _me_payload(me)
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.get("/projects", response_model=list[ProjectSchema])
def get_projects(auth: AuthContext = Depends(get_auth_context)):
    taiga = TaigaService()
    taiga.set_token(auth.taiga_token)
    try:
        return taiga.get_projects()
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.post("/projects", response_model=ProjectSchema)
def create_project(payload: CreateProjectRequest, auth: AuthContext = Depends(get_auth_context)):
    taiga = TaigaService()
    taiga.set_token(auth.taiga_token)
    try:
        return taiga.create_project(payload.name, payload.description)
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.delete("/projects/{project_id}")
def delete_project(project_id: int, auth: AuthContext = Depends(get_auth_context)):
    taiga = TaigaService()
    taiga.set_token(auth.taiga_token)
    try:
        taiga.delete_project(project_id)
        return {"ok": True}
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.get("/context-files", response_model=ContextFilesResponse)
def get_context_files(ctx: RequestContext = Depends(get_request_context)):
    context = ContextService()
    context.set_project(ctx.project_id)
    files = []
    for filename, label in _CONTEXT_FILES:
        content = context.read_context_file(filename)
        files.append({
            "filename": filename,
            "label": label,
            "content": content,
            "chars": len(content),
        })
    return {"files": files, "total_chars": sum(file["chars"] for file in files)}


@router.put("/context-files/{filename}", response_model=ContextFilesResponse)
def update_context_file(
    filename: str,
    payload: UpdateContextFileRequest,
    ctx: RequestContext = Depends(get_request_context),
):
    if filename not in _ALLOWED_CONTEXT_FILES:
        raise HTTPException(status_code=404, detail="Unknown context file.")
    context = ContextService()
    context.set_project(ctx.project_id)
    context.write_context_file(filename, payload.content)
    return get_context_files(ctx)


@router.post("/context-files/{filename}/reset", response_model=ContextFilesResponse)
def reset_context_file(filename: str, ctx: RequestContext = Depends(get_request_context)):
    if filename not in _ALLOWED_CONTEXT_FILES:
        raise HTTPException(status_code=404, detail="Unknown context file.")
    context = ContextService()
    context.set_project(ctx.project_id)
    context.reset_context_file(filename)
    return get_context_files(ctx)


@router.get("/board", response_model=list[EpicWithStoriesSchema])
def get_board(ctx: RequestContext = Depends(get_request_context)):
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        epics = taiga.get_epics()
        result = []
        for epic in epics:
            result.append({**epic, "stories": taiga.get_stories_for_epic(epic["id"])})
        return result
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.get("/story-statuses")
def list_story_statuses(ctx: RequestContext = Depends(get_request_context)):
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        return taiga.get_story_statuses()
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.post("/epics")
def create_epic(payload: CreateEpicRequest, ctx: RequestContext = Depends(get_request_context)):
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        return taiga.create_epic(payload.subject, payload.description, tags=payload.tags)
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.put("/epics/{epic_id}")
def update_epic(epic_id: int, payload: UpdateEpicRequest, ctx: RequestContext = Depends(get_request_context)):
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        return taiga.update_epic_fields(
            epic_id,
            payload.version,
            subject=payload.subject,
            description=payload.description,
            tags=payload.tags,
        )
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.delete("/epics/{epic_id}")
def delete_epic(epic_id: int, ctx: RequestContext = Depends(get_request_context)):
    from src import context_manager
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        count = taiga.delete_epic_with_stories(epic_id)
        context_manager.set_active_project(ctx.project_id)
        context_manager.remove_epic_from_story_index(epic_id)
        return {"ok": True, "stories_deleted": count}
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.post("/stories")
def create_story(payload: CreateStoryRequest, ctx: RequestContext = Depends(get_request_context)):
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        story = taiga.create_story(
            payload.subject,
            payload.description,
            epic_id=payload.epic_id,
            tags=payload.tags,
            backlog_order=0,
        )
        if payload.status_id:
            try:
                story = taiga_adapter.update_story_status(story["id"], payload.status_id, story["version"])
            except TaigaAPIError as _status_exc:
                _logger.warning("story status update failed story_id=%s: %s", story["id"], _status_exc)
        return story
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.put("/stories/{story_id}")
def update_story(story_id: int, payload: UpdateStoryRequest, ctx: RequestContext = Depends(get_request_context)):
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        return taiga.update_story_subject(
            story_id,
            payload.version,
            subject=payload.subject,
            description=payload.description,
            tags=payload.tags,
        )
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.delete("/stories/{story_id}")
def delete_story(story_id: int, ctx: RequestContext = Depends(get_request_context)):
    from src import context_manager
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        taiga.delete_story(story_id)
        context_manager.set_active_project(ctx.project_id)
        context_manager.remove_story_index_entries([story_id])
        return {"ok": True}
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.get("/users", response_model=UsersResponse)
def get_users(ctx: RequestContext = Depends(get_request_context)):
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        return {"memberships": taiga.get_memberships(), "roles": taiga.get_roles()}
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.post("/users/invite")
def invite_user(payload: InviteMemberRequest, ctx: RequestContext = Depends(get_request_context)):
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        return taiga.invite_member(payload.username_or_email, payload.role_id)
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.delete("/users/members/{membership_id}")
def remove_member(membership_id: int, ctx: RequestContext = Depends(get_request_context)):
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        taiga.remove_member(membership_id)
        return {"ok": True}
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.put("/users/members/{membership_id}/role")
def update_member_role(
    membership_id: int,
    payload: UpdateMemberRoleRequest,
    ctx: RequestContext = Depends(get_request_context),
):
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        return taiga.update_membership_role(membership_id, payload.role_id)
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.post("/context-files/rebuild-index")
def rebuild_story_index(ctx: RequestContext = Depends(get_request_context)):
    from src import context_manager
    context_manager.set_active_project(ctx.project_id)
    context_manager.rebuild_story_index()
    return {"ok": True}


@router.get("/context-files/story-index-stats")
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
        "phase4_tested": sum(1 for s in stories if s.get("has_bdd")),
        "phase5_deployed": sum(1 for s in stories if s.get("phase_status") == "deployed"),
    }


@router.post("/context-files/reset-all", response_model=ContextFilesResponse)
def reset_all_context_files(ctx: RequestContext = Depends(get_request_context)):
    context = ContextService()
    context.set_project(ctx.project_id)
    for filename, _ in _CONTEXT_FILES:
        context.reset_context_file(filename)
    return get_context_files(ctx)
