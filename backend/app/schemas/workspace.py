"""Schemas for shell/sidebar workspace endpoints."""

from pydantic import BaseModel, Field


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
    content: str


class SaveAiConfigRequest(BaseModel):
    fast_model: str | None = None
    coder_model: str | None = None


class SaveConfigRequest(BaseModel):
    project_id: int | None = None


class OkResponse(BaseModel):
    ok: bool = True


class ConfigResponse(BaseModel):
    project_id: int | None = None
    taiga_web_url: str = ""


class AiConfigModel(BaseModel):
    id: str
    label: str
    role: str = ""
    provider: str = "anthropic"
    note: str = ""


class AiConfigResponse(BaseModel):
    fast_model: str
    coder_model: str
    available_models: list[AiConfigModel] = Field(default_factory=list)
    configured_providers: list[str] = Field(default_factory=list)


class StoryIndexStatsResponse(BaseModel):
    total: int = 0
    phase2_designed: int = 0
    phase3_proposed: int = 0
    phase4_tested: int = 0
    phase5_deployed: int = 0
