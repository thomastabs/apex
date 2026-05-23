"""Request and response schemas for Phase 2 design endpoints."""

from typing import Literal

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


class DesignSectionRequest(BaseModel):
    section: Literal["wireframes", "user_flow", "component_tree", "tech_spec"]
    prior: dict[str, str] = Field(default_factory=dict)


class DesignSectionResponse(BaseModel):
    section: str
    content: str
    story_ids: list[int] = Field(default_factory=list)


class LockDesignRequest(BaseModel):
    story_ids: list[int] = Field(min_length=1)
    wireframes: str = Field(min_length=1)
    user_flow: str = Field(min_length=1)
    component_tree: str = Field(min_length=1)
    tech_spec: str = Field(min_length=1)


class TaigaTransitionFailure(BaseModel):
    story_id: int
    error: str


class LockDesignResponse(BaseModel):
    ok: bool
    story_ids: list[int]
    taiga_failures: list[TaigaTransitionFailure] = Field(default_factory=list)
