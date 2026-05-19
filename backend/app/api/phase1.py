"""Phase 1 requirements API routes."""

from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.api.deps import AuthContext, RequestContext, get_auth_context, get_request_context
from backend.app.api.rate_limit import ai_rate_limit
from backend.app.schemas.phase1 import (
    CompileGherkinRequest,
    CompileGherkinResponse,
    EpicSchema,
    GenerateNlStoriesRequest,
    GenerateNlStoriesResponse,
    PushStoriesRequest,
    PushStoriesResponse,
    SuggestEpicsRequest,
    SuggestEpicsResponse,
)
from backend.app.services.phase1_service import Phase1Service, Phase1ValidationError
from src.ai_engine import AIError
from src.taiga_adapter import TaigaAPIError

router = APIRouter()


def get_phase1_service() -> Phase1Service:
    return Phase1Service()


def _handle_error(exc: Exception) -> NoReturn:
    if isinstance(exc, Phase1ValidationError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if isinstance(exc, TaigaAPIError):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.user_message) from exc
    if isinstance(exc, AIError):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    raise exc


@router.get("/epics", response_model=list[EpicSchema])
def list_epics(
    ctx: RequestContext = Depends(get_request_context),
    service: Phase1Service = Depends(get_phase1_service),
):
    try:
        return service.list_epics(ctx)
    except Exception as exc:
        _handle_error(exc)


@router.post("/suggest-epics", response_model=SuggestEpicsResponse)
def suggest_epics(
    payload: SuggestEpicsRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase1Service = Depends(get_phase1_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        return {"epics": service.suggest_epics(ctx, hint=payload.hint)}
    except Exception as exc:
        _handle_error(exc)


@router.post("/generate-nl-stories", response_model=GenerateNlStoriesResponse)
def generate_nl_stories(
    payload: GenerateNlStoriesRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase1Service = Depends(get_phase1_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        nl_draft, story_count = service.generate_nl_stories(
            ctx,
            epic_subject=payload.epic_subject,
            epic_description=payload.epic_description,
            hint=payload.hint,
        )
        return {"nl_draft": nl_draft, "story_count": story_count}
    except Exception as exc:
        _handle_error(exc)


@router.post("/compile-gherkin", response_model=CompileGherkinResponse)
def compile_gherkin(
    payload: CompileGherkinRequest,
    _auth: AuthContext = Depends(get_auth_context),  # auth-only: no project needed (pure AI)
    service: Phase1Service = Depends(get_phase1_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        return {"stories": service.compile_gherkin(nl_draft=payload.nl_draft)}
    except Exception as exc:
        _handle_error(exc)


@router.post("/push-stories", response_model=PushStoriesResponse)
def push_stories(
    payload: PushStoriesRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase1Service = Depends(get_phase1_service),
):
    try:
        return service.push_stories(
            ctx,
            epic_subject=payload.epic_subject,
            epic_description=payload.epic_description,
            epic_id=payload.epic_id,
            stories=[story.model_dump() for story in payload.stories],
        )
    except Exception as exc:
        _handle_error(exc)
