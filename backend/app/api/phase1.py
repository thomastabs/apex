"""Phase 1 requirements API routes."""

from typing import NoReturn

from fastapi import APIRouter, Depends, Header, HTTPException, status

from backend.app.api.deps import AuthContext, RequestContext, get_auth_context, get_request_context
from backend.app.api.rate_limit import ai_rate_limit
from backend.app.schemas.phase1 import (
    AnalyzeGapsRequest,
    AnalyzeGapsResponse,
    CompileGherkinRequest,
    CompileGherkinResponse,
    CrossCheckRequest,
    CrossCheckResponse,
    FinalizeStoriesRequest,
    FinalizeStoriesResponse,
    GenerateConstraintsResponse,
    GenerateNlStoriesRequest,
    GenerateNlStoriesResponse,
    GenerateStoriesFromFigmaRequest,
    GetConstraintsResponse,
    SaveConstraintsRequest,
    SuggestEpicsRequest,
    SuggestEpicsResponse,
)
from backend.app.services.phase1_service import Phase1Service, Phase1ValidationError
from src.ai_engine import AIError, AIRateLimitError, AITimeoutError

router = APIRouter()


def get_phase1_service() -> Phase1Service:
    return Phase1Service()


def _handle_error(exc: Exception) -> NoReturn:
    if isinstance(exc, Phase1ValidationError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    if isinstance(exc, AIRateLimitError):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    if isinstance(exc, AITimeoutError):
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    if isinstance(exc, AIError):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if isinstance(exc, EnvironmentError):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    raise exc


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


@router.post("/analyze-gaps", response_model=AnalyzeGapsResponse)
def analyze_gaps(
    payload: AnalyzeGapsRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase1Service = Depends(get_phase1_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        return service.analyze_gaps(
            ctx,
            existing_epics=[e.model_dump() for e in payload.existing_epics],
            hint=payload.hint,
        )
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
            instructions=payload.instructions,
        )
        return {"nl_draft": nl_draft, "story_count": story_count}
    except Exception as exc:
        _handle_error(exc)


@router.post("/generate-stories-from-figma", response_model=GenerateNlStoriesResponse)
def generate_stories_from_figma(
    payload: GenerateStoriesFromFigmaRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase1Service = Depends(get_phase1_service),
    x_figma_token: str = Header(default="", alias="X-Figma-Token"),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        nl_draft, story_count = service.generate_stories_from_figma(
            ctx,
            frames=[f.model_dump() for f in payload.frames],
            flows=[e.model_dump() for e in payload.flows],
            instructions=payload.instructions,
            figma_token=x_figma_token.strip(),
            file_key=payload.file_key.strip(),
        )
        return {"nl_draft": nl_draft, "story_count": story_count}
    except Exception as exc:
        _handle_error(exc)


@router.post("/cross-check-stories", response_model=CrossCheckResponse)
def cross_check_stories(
    payload: CrossCheckRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase1Service = Depends(get_phase1_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        return service.cross_check_stories(
            ctx,
            epic_subject=payload.epic_subject,
            epic_description=payload.epic_description,
            hint=payload.hint,
            alt_model=payload.alt_model,
        )
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


@router.post("/finalize-stories", response_model=FinalizeStoriesResponse)
def finalize_stories(
    payload: FinalizeStoriesRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase1Service = Depends(get_phase1_service),
):
    try:
        return service.finalize_stories(
            ctx,
            epic_id=payload.epic_id,
            epic_subject=payload.epic_subject,
            stories=[story.model_dump() for story in payload.stories],
        )
    except Exception as exc:
        _handle_error(exc)


@router.post("/generate-constraints", response_model=GenerateConstraintsResponse)
def generate_constraints(
    ctx: RequestContext = Depends(get_request_context),
    service: Phase1Service = Depends(get_phase1_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        constraints, constraints_md = service.generate_constraints(ctx)
        return {"constraints": constraints, "constraints_md": constraints_md}
    except Exception as exc:
        _handle_error(exc)


@router.post("/save-constraints")
def save_constraints(
    payload: SaveConstraintsRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase1Service = Depends(get_phase1_service),
):
    try:
        service.save_constraints(ctx, constraints_md=payload.constraints_md)
        return {"ok": True}
    except Exception as exc:
        _handle_error(exc)


@router.get("/constraints", response_model=GetConstraintsResponse)
def get_constraints(
    ctx: RequestContext = Depends(get_request_context),
    service: Phase1Service = Depends(get_phase1_service),
):
    try:
        return {"constraints_md": service.get_constraints(ctx)}
    except Exception as exc:
        _handle_error(exc)
