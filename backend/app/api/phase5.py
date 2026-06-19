"""Phase 5 Deployment Gate API routes."""

from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.api.deps import RequestContext, get_request_context
from backend.app.api.rate_limit import ai_rate_limit
from backend.app.schemas.phase5 import (
    DeployPackResponse,
    DeployPacksResponse,
    EligibleStoriesResponse,
    GenerateDeployPackRequest,
    GenerateInfraDeltaRequest,
    InfraDeltaResponse,
    PassDeploymentGateRequest,
    QaResultsResponse,
    ReviseDeployPackRequest,
    SaveDeployPackRequest,
    SaveInfraDeltaRequest,
    SaveVerificationRequest,
    StoryContextResponse,
    VerificationResponse,
)
from backend.app.schemas.workspace import OkResponse
from backend.app.services.phase5_service import Phase5Service, Phase5ValidationError
from src.ai_engine import AIError, AIRateLimitError, AITimeoutError

router = APIRouter()


def get_phase5_service() -> Phase5Service:
    return Phase5Service()


def _handle_error(exc: Exception) -> NoReturn:
    if isinstance(exc, Phase5ValidationError):
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
    service: Phase5Service = Depends(get_phase5_service),
):
    try:
        return {"stories": service.get_eligible_stories(ctx)}
    except Exception as exc:
        _handle_error(exc)


@router.get("/story-context/{story_id}", response_model=StoryContextResponse)
def story_context(
    story_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase5Service = Depends(get_phase5_service),
):
    try:
        return service.get_story_context(ctx, story_id)
    except Exception as exc:
        _handle_error(exc)


@router.post("/generate-infra-delta", response_model=InfraDeltaResponse)
def generate_infra_delta(
    payload: GenerateInfraDeltaRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase5Service = Depends(get_phase5_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        delta = service.generate_infra_delta(ctx, payload.story_id)
        return {"story_id": payload.story_id, "delta": delta}
    except Exception as exc:
        _handle_error(exc)


@router.post("/save-infra-delta", response_model=OkResponse)
def save_infra_delta(
    payload: SaveInfraDeltaRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase5Service = Depends(get_phase5_service),
):
    try:
        service.save_infra_delta(ctx, payload.story_id, payload.delta.model_dump())
        return {"ok": True}
    except Exception as exc:
        _handle_error(exc)


@router.get("/infra-delta/{story_id}", response_model=InfraDeltaResponse)
def get_infra_delta(
    story_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase5Service = Depends(get_phase5_service),
):
    try:
        return {"story_id": story_id, "delta": service.load_infra_delta(ctx, story_id)}
    except Exception as exc:
        _handle_error(exc)


@router.post("/generate-deploy-pack", response_model=DeployPackResponse)
def generate_deploy_pack(
    payload: GenerateDeployPackRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase5Service = Depends(get_phase5_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        md = service.generate_deploy_pack(ctx, payload.story_id, payload.options)
        return {"story_id": payload.story_id, "deploy_pack_md": md}
    except Exception as exc:
        _handle_error(exc)


@router.post("/save-deploy-pack", response_model=OkResponse)
def save_deploy_pack(
    payload: SaveDeployPackRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase5Service = Depends(get_phase5_service),
):
    try:
        service.save_deploy_pack(ctx, payload.story_id, payload.deploy_pack_md)
        return {"ok": True}
    except Exception as exc:
        _handle_error(exc)


@router.get("/deploy-packs", response_model=DeployPacksResponse)
def list_deploy_packs(
    ctx: RequestContext = Depends(get_request_context),
    service: Phase5Service = Depends(get_phase5_service),
):
    try:
        return {"deploy_packs": service.list_all_deploy_packs(ctx)}
    except Exception as exc:
        _handle_error(exc)


@router.get("/deploy-pack/{story_id}", response_model=DeployPackResponse)
def get_deploy_pack(
    story_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase5Service = Depends(get_phase5_service),
):
    try:
        return {"story_id": story_id, "deploy_pack_md": service.load_deploy_pack(ctx, story_id)}
    except Exception as exc:
        _handle_error(exc)


@router.delete("/deploy-pack/{story_id}", response_model=OkResponse)
def delete_deploy_pack(
    story_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase5Service = Depends(get_phase5_service),
):
    try:
        service.delete_deploy_pack(ctx, story_id)
        return {"ok": True}
    except Exception as exc:
        _handle_error(exc)


@router.post("/revise-deploy-pack", response_model=DeployPackResponse)
def revise_deploy_pack(
    payload: ReviseDeployPackRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase5Service = Depends(get_phase5_service),
    _rl: None = Depends(ai_rate_limit),
):
    try:
        md = service.revise_deploy_pack(ctx, payload.story_id, payload.deploy_pack_md, payload.feedback)
        return {"story_id": payload.story_id, "deploy_pack_md": md}
    except Exception as exc:
        _handle_error(exc)


@router.get("/qa-results/{story_id}", response_model=QaResultsResponse)
def qa_results(
    story_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase5Service = Depends(get_phase5_service),
):
    try:
        return {"story_id": story_id, "qa_results": service.get_qa_results(ctx, story_id)}
    except Exception as exc:
        _handle_error(exc)


@router.post("/save-verification", response_model=OkResponse)
def save_verification(
    payload: SaveVerificationRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase5Service = Depends(get_phase5_service),
):
    try:
        service.save_verification(ctx, payload.story_id, payload.matrix.model_dump())
        return {"ok": True}
    except Exception as exc:
        _handle_error(exc)


@router.get("/verification/{story_id}", response_model=VerificationResponse)
def get_verification(
    story_id: int,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase5Service = Depends(get_phase5_service),
):
    try:
        return {"story_id": story_id, "matrix": service.load_verification(ctx, story_id)}
    except Exception as exc:
        _handle_error(exc)


@router.post("/pass-deployment-gate", response_model=OkResponse)
def pass_deployment_gate(
    payload: PassDeploymentGateRequest,
    ctx: RequestContext = Depends(get_request_context),
    service: Phase5Service = Depends(get_phase5_service),
):
    try:
        service.pass_deployment_gate(
            ctx,
            payload.story_id,
            tech_lead_approved=payload.tech_lead_approved,
            devops_approved=payload.devops_approved,
            notes=payload.notes,
        )
        return {"ok": True}
    except Exception as exc:
        _handle_error(exc)
