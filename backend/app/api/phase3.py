"""Phase 3 implementation-assist API routes."""

from typing import NoReturn

from fastapi import APIRouter, Depends, Header, HTTPException, status

from backend.app.api.deps import RequestContext, get_request_context
from backend.app.api.rate_limit import ai_rate_limit
from backend.app.schemas.phase1 import CrossCheckResponse
from backend.app.schemas.phase3 import (
    CrossCheckTasksRequest,
    PacksResponse,
    EligibleStoriesResponse,
    GenerateProposalRequest,
    GenerateProposalResponse,
    GenerateTasksRequest,
    GenerateTasksResponse,
    LockStoryRequest,
    ProposalsResponse,
    SaveProposalRequest,
    StoryContextResponse,
)
from backend.app.schemas.workspace import OkResponse
from backend.app.services.phase3_service import Phase3Service, Phase3ValidationError
from src.ai_engine import AIError, AIRateLimitError, AITimeoutError

router = APIRouter()


def get_phase3_service() -> Phase3Service:
    return Phase3Service()


def _handle_error(exc: Exception) -> NoReturn:
    if isinstance(exc, Phase3ValidationError):
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


@router.get("/eligible-stories", response_model=EligibleStoriesResponse)
def eligible_stories(
    ctx: RequestContext = Depends(get_request_context),
    service: Phase3Service = Depends(get_phase3_service),
):
    try:
        return {"stories": service.get_eligible_stories(ctx)}
    except Exception as exc:
        _handle_error(exc)


@router.get("/story-context/{story_id}", response_model=StoryContextResponse)
def story_context(
    story_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase3Service = Depends(get_phase3_service),
):
    try:
        return service.get_story_context(ctx, story_id)
    except Exception as exc:
        _handle_error(exc)


@router.post("/generate-tasks", response_model=GenerateTasksResponse)
def generate_tasks(
    payload: GenerateTasksRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase3Service = Depends(get_phase3_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        extra_kwargs = {"extra_context_files": payload.extra_context_files} if payload.extra_context_files else {}
        tasks = service.generate_tasks(
            ctx, payload.story_id, payload.instructions,
            **extra_kwargs,
        )
        return {"story_id": payload.story_id, "tasks": tasks}
    except Exception as exc:
        _handle_error(exc)


@router.post("/generate-proposal", response_model=GenerateProposalResponse)
def generate_proposal(
    payload: GenerateProposalRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase3Service = Depends(get_phase3_service),
    x_figma_token: str = Header(default="", alias="X-Figma-Token"),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        extra_kwargs = {"extra_context_files": payload.extra_context_files} if payload.extra_context_files else {}
        md = service.generate_proposal(
            ctx,
            payload.story_id,
            payload.task_id,
            payload.task_subject,
            payload.task_description,
            hint=payload.hint,
            recent_commits_context=payload.recent_commits_context,
            all_tasks=[t.model_dump() for t in payload.all_tasks],
            figma_token=x_figma_token.strip(),
            **extra_kwargs,
        )
        return {"proposal_md": md}
    except Exception as exc:
        _handle_error(exc)


@router.post("/save-proposal", response_model=OkResponse)
def save_proposal(
    payload: SaveProposalRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase3Service = Depends(get_phase3_service),
):
    try:
        service.save_proposal(ctx, payload.story_id, payload.task_id, payload.proposal_md)
        return {"ok": True}
    except Exception as exc:
        _handle_error(exc)


@router.get("/packs", response_model=PacksResponse)
def list_packs(
    ctx: RequestContext = Depends(get_request_context),
    service: Phase3Service = Depends(get_phase3_service),
):
    try:
        return {"packs": service.list_all_packs(ctx)}
    except Exception as exc:
        _handle_error(exc)


@router.post("/cross-check-tasks", response_model=CrossCheckResponse)
def cross_check_tasks(
    payload: CrossCheckTasksRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase3Service = Depends(get_phase3_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        return service.cross_check_tasks(ctx, payload.story_id, payload.alt_model)
    except Exception as exc:
        _handle_error(exc)


@router.delete("/proposal/{story_id}/{task_id}", response_model=OkResponse)
def delete_proposal(
    story_id: int,
    task_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase3Service = Depends(get_phase3_service),
):
    try:
        service.delete_proposal(ctx, story_id, task_id)
        return {"ok": True}
    except Exception as exc:
        _handle_error(exc)


@router.get("/proposals/{story_id}", response_model=ProposalsResponse)
def get_proposals(
    story_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase3Service = Depends(get_phase3_service),
):
    try:
        proposals = service.get_proposals(ctx, story_id)
        return {"story_id": story_id, "proposals": proposals}
    except Exception as exc:
        _handle_error(exc)


@router.post("/lock-story", response_model=OkResponse)
def lock_story(
    payload: LockStoryRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase3Service = Depends(get_phase3_service),
):
    try:
        service.lock_story(ctx, payload.story_id, payload.task_ids)
        return {"ok": True}
    except Exception as exc:
        _handle_error(exc)
