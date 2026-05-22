"""Request and response schemas for Phase 2 design endpoints."""

from pydantic import BaseModel, Field


class TechStackStatusResponse(BaseModel):
    defined: bool
    tech_stack: str | None = None


class ArchitectureAlternativeSchema(BaseModel):
    name: str
    description: str
    trade_offs: str


class ProposeTechStackRequest(BaseModel):
    hint: str = ""


class ProposeTechStackResponse(BaseModel):
    alternatives: list[ArchitectureAlternativeSchema]


class LockTechStackRequest(BaseModel):
    tech_stack: str


class DesignBundleResponse(BaseModel):
    wireframes: str
    user_flow: str
    component_tree: str
    tech_spec: str
    story_ids: list[int] = Field(default_factory=list)


class LockDesignRequest(BaseModel):
    story_ids: list[int] = Field(default_factory=list)
    wireframes: str
    user_flow: str
    component_tree: str
    tech_spec: str


class TaigaTransitionFailure(BaseModel):
    story_id: int
    error: str


class LockDesignResponse(BaseModel):
    ok: bool
    story_ids: list[int]
    taiga_failures: list[TaigaTransitionFailure] = Field(default_factory=list)
