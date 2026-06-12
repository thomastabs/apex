"""Phase 4 QA assistant API routes."""

from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.api.deps import RequestContext, get_request_context
from backend.app.api.rate_limit import ai_rate_limit
from backend.app.schemas.phase4 import (
    EligibleStoriesResponse,
    FailGateRequest,
    GenerateBugReportRequest,
    GenerateBugReportResponse,
    GenerateTestPlanRequest,
    GenerateTestPlanResponse,
    PassGateRequest,
    StoryContextResponse,
    SaveTestPlanRequest,
    TestPlanResponse,
)
from backend.app.schemas.workspace import OkResponse
from backend.app.services.phase4_service import Phase4Service, Phase4ValidationError
from src.ai_engine import AIError, AIRateLimitError, AITimeoutError

router = APIRouter()


def get_phase4_service() -> Phase4Service:
    return Phase4Service()


def _handle_error(exc: Exception) -> NoReturn:
    if isinstance(exc, Phase4ValidationError):
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
    service: Phase4Service = Depends(get_phase4_service),
):
    try:
        return {"stories": service.get_eligible_stories(ctx)}
    except Exception as exc:
        _handle_error(exc)


@router.get("/story-context/{story_id}", response_model=StoryContextResponse)
def story_context(
    story_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase4Service = Depends(get_phase4_service),
):
    try:
        return service.get_story_context(ctx, story_id)
    except Exception as exc:
        _handle_error(exc)


@router.post("/generate-test-plan", response_model=GenerateTestPlanResponse)
def generate_test_plan(
    payload: GenerateTestPlanRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase4Service = Depends(get_phase4_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        md = service.generate_test_plan(ctx, payload.story_id)
        return {"story_id": payload.story_id, "test_plan_md": md}
    except Exception as exc:
        _handle_error(exc)


@router.post("/save-test-plan", response_model=OkResponse)
def save_test_plan(
    payload: SaveTestPlanRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase4Service = Depends(get_phase4_service),
):
    try:
        service.save_test_plan(ctx, payload.story_id, payload.test_plan_md)
        return {"ok": True}
    except Exception as exc:
        _handle_error(exc)


@router.get("/test-plan/{story_id}", response_model=TestPlanResponse)
def get_test_plan(
    story_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase4Service = Depends(get_phase4_service),
):
    try:
        md = service.load_test_plan(ctx, story_id)
        return {"story_id": story_id, "test_plan_md": md}
    except Exception as exc:
        _handle_error(exc)


@router.post("/generate-bug-report", response_model=GenerateBugReportResponse)
def generate_bug_report(
    payload: GenerateBugReportRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase4Service = Depends(get_phase4_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        md = service.generate_bug_report(
            ctx,
            payload.story_id,
            [fs.model_dump() for fs in payload.failed_scenarios],
        )
        return {"story_id": payload.story_id, "bug_report_md": md}
    except Exception as exc:
        _handle_error(exc)


@router.post("/pass-gate", response_model=OkResponse)
def pass_gate(
    payload: PassGateRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase4Service = Depends(get_phase4_service),
):
    try:
        service.pass_gate(
            ctx,
            payload.story_id,
            scenario_results=(
                [r.model_dump() for r in payload.scenario_results]
                if payload.scenario_results else None
            ),
        )
        return {"ok": True}
    except Exception as exc:
        _handle_error(exc)


@router.post("/fail-gate", response_model=OkResponse)
def fail_gate(
    payload: FailGateRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase4Service = Depends(get_phase4_service),
):
    try:
        service.fail_gate(
            ctx,
            payload.story_id,
            payload.bug_report_md,
            payload.root_cause,
            payload.resolution_summary,
            scenario_results=(
                [r.model_dump() for r in payload.scenario_results]
                if payload.scenario_results else None
            ),
        )
        return {"ok": True}
    except Exception as exc:
        _handle_error(exc)
