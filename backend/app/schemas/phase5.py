"""Request and response schemas for Phase 5 Deployment Gate endpoints."""

from typing import Literal

from pydantic import BaseModel, Field

from backend.app.schemas.grounding import ExtraContextMixin


class Phase5StoryPreview(BaseModel):
    story_id: int
    title: str
    epic_title: str
    gherkin_preview: str
    has_infra_delta: bool
    has_deploy_pack: bool
    deploy_bypass: bool
    fix_bolt_count: int


class EligibleStoriesResponse(BaseModel):
    stories: list[Phase5StoryPreview]


class StoryContextResponse(BaseModel):
    story_id: int
    title: str
    epic_title: str
    gherkin: str
    technical_spec: str
    tech_stack: str
    github_context_synced: bool
    is_first_deployment: bool = False
    pipeline_detected: bool = False
    has_bug_report: bool
    fix_bolt_count: int


class InfraDeltaItemModel(BaseModel):
    category: Literal["env_var", "migration", "iac", "ci_config", "secret"]
    title: str = Field(..., max_length=500)
    detail: str = Field(..., max_length=5_000)
    risk: Literal["low", "high"]


class InfraDeltaModel(BaseModel):
    needs_infra_change: bool
    rationale: str = Field("", max_length=10_000)
    confidence: Literal["low", "medium", "high"] = "medium"
    evidence: str = Field("", max_length=5_000)
    deltas: list[InfraDeltaItemModel] = Field(default_factory=list)


class GenerateInfraDeltaRequest(ExtraContextMixin):
    story_id: int


class InfraDeltaResponse(BaseModel):
    story_id: int
    delta: InfraDeltaModel


class SaveInfraDeltaRequest(BaseModel):
    story_id: int
    delta: InfraDeltaModel


class DeployPackOptions(BaseModel):
    """Operator-specified guidance to steer deploy-pack generation (all optional)."""

    target_env: Literal["", "production", "staging", "both"] = ""
    iac_format: Literal["", "terraform", "compose", "kubernetes", "bicep", "shell"] = ""
    emphasis: list[
        Literal["zero_downtime", "rollback_depth", "secrets", "db_safety", "observability"]
    ] = Field(default_factory=list, max_length=5)
    instructions: str = Field(default="", max_length=2_000)


class GenerateDeployPackRequest(ExtraContextMixin):
    story_id: int
    options: DeployPackOptions = Field(default_factory=DeployPackOptions)


class DeployPackResponse(BaseModel):
    story_id: int
    deploy_pack_md: str


class DeployPackListItem(BaseModel):
    story_id: int
    title: str = ""
    chars: int = 0


class DeployPacksResponse(BaseModel):
    deploy_packs: list[DeployPackListItem]


class SaveDeployPackRequest(BaseModel):
    story_id: int
    deploy_pack_md: str = Field(min_length=1, max_length=200_000)


class ReviseDeployPackRequest(BaseModel):
    story_id: int
    deploy_pack_md: str = Field(min_length=1, max_length=200_000)
    feedback: str = Field(min_length=1, max_length=5_000)


class PassDeploymentGateRequest(BaseModel):
    story_id: int
    tech_lead_approved: bool = False
    devops_approved: bool = False
    notes: str = Field("", max_length=5_000)


class VerificationScenarioRow(BaseModel):
    scenario: str = Field(..., max_length=500)
    tasks: list[int] = Field(default_factory=list)
    tasks_with_pack: list[int] = Field(default_factory=list)
    qa_result: Literal["pass", "fail", "untested"] = "untested"
    gaps: list[str] = Field(default_factory=list)


class VerificationSummary(BaseModel):
    total: int = 0
    covered: int = 0
    with_pack: int = 0
    tested: int = 0
    gap_count: int = 0


class VerificationMatrix(BaseModel):
    scenarios: list[VerificationScenarioRow] = Field(default_factory=list)
    summary: VerificationSummary = Field(default_factory=VerificationSummary)
    complete: bool = False


class SaveVerificationRequest(BaseModel):
    story_id: int
    matrix: VerificationMatrix


class VerificationResponse(BaseModel):
    story_id: int
    matrix: dict | None = None


class QaResultsResponse(BaseModel):
    story_id: int
    qa_results: dict | None = None
