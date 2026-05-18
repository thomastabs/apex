"""Workspace APIs used by the Next.js app shell/sidebar."""

from fastapi import APIRouter, Depends, HTTPException, status

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
    UsersResponse,
)
from backend.app.services.context_service import ContextService
from backend.app.services.taiga_service import TaigaService
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


@router.post("/epics")
def create_epic(payload: CreateEpicRequest, ctx: RequestContext = Depends(get_request_context)):
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        return taiga.create_epic(payload.subject, payload.description)
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.delete("/epics/{epic_id}")
def delete_epic(epic_id: int, ctx: RequestContext = Depends(get_request_context)):
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        count = taiga.delete_epic_with_stories(epic_id)
        return {"ok": True, "stories_deleted": count}
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.post("/stories")
def create_story(payload: CreateStoryRequest, ctx: RequestContext = Depends(get_request_context)):
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        return taiga.create_story(payload.subject, payload.description, epic_id=payload.epic_id, tags=[], backlog_order=0)
    except TaigaAPIError as exc:
        raise _taiga_error(exc) from exc


@router.delete("/stories/{story_id}")
def delete_story(story_id: int, ctx: RequestContext = Depends(get_request_context)):
    taiga = TaigaService()
    taiga.set_context(ctx.taiga_token, ctx.project_id)
    try:
        taiga.delete_story(story_id)
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
