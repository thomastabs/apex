"""Request and response schemas for Phase 5 Deployment Gate endpoints."""

from typing import Literal

from pydantic import BaseModel, Field


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
    deltas: list[InfraDeltaItemModel] = Field(default_factory=list)


class GenerateInfraDeltaRequest(BaseModel):
    story_id: int


class InfraDeltaResponse(BaseModel):
    story_id: int
    delta: InfraDeltaModel


class SaveInfraDeltaRequest(BaseModel):
    story_id: int
    delta: InfraDeltaModel


class GenerateDeployPackRequest(BaseModel):
    story_id: int


class DeployPackResponse(BaseModel):
    story_id: int
    deploy_pack_md: str


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
