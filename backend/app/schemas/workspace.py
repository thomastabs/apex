"""Schemas for shell/sidebar workspace endpoints."""

from typing import Literal

from pydantic import BaseModel, Field

PhaseStatus = Literal[
    "new", "gherkin_locked", "design_locked", "implementation", "qa", "qa_passed", "deployed",
]


class PhaseStatusResponse(BaseModel):
    phase_status: str | None = None


class SetPhaseStatusRequest(BaseModel):
    phase_status: PhaseStatus


class ContextFileSchema(BaseModel):
    filename: str
    label: str
    content: str
    chars: int
    last_modified: str | None = None


class ContextFilesResponse(BaseModel):
    files: list[ContextFileSchema]
    total_chars: int


class UpdateContextFileRequest(BaseModel):
    content: str = Field(..., max_length=5_242_880)  # 5 MB


class SaveAiConfigRequest(BaseModel):
    model: str | None = Field(None, max_length=200)


class SaveConfigRequest(BaseModel):
    project_id: int | None = None
    pm_tool: str | None = Field(None, max_length=20)
    taiga_url: str | None = Field(None, max_length=2_048)
    jira_base_url: str | None = Field(None, max_length=2_048)
    github_repo: str | None = Field(None, max_length=255)


class OkResponse(BaseModel):
    ok: bool = True


class ConfigResponse(BaseModel):
    project_id: int | None = None
    taiga_web_url: str = ""
    pm_tool: str = "taiga"
    pm_web_url: str = ""
    github_repo: str = ""


class AiConfigModel(BaseModel):
    id: str
    label: str
    role: str = ""
    provider: str = "anthropic"
    note: str = ""


class AiConfigResponse(BaseModel):
    model: str
    available_models: list[AiConfigModel] = Field(default_factory=list)
    configured_providers: list[str] = Field(default_factory=list)


class StoryIndexStatsResponse(BaseModel):
    total: int = 0
    phase2_designed: int = 0
    phase3_proposed: int = 0
    phase4_tested: int = 0
    phase4_passed: int = 0
    phase5_deployed: int = 0
