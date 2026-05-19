"""Request and response schemas for Phase 2 design endpoints."""

from typing import Literal

from pydantic import BaseModel, Field


class TechStackStatusResponse(BaseModel):
    defined: bool
    tech_stack: str | None = None


class EligibleEpicSchema(BaseModel):
    epic_id: int
    epic_title: str
    story_count: int
    phase_status: Literal["gherkin_locked", "design_locked"]


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


class GenerateDesignBundleRequest(BaseModel):
    epic_id: int


class DesignBundleResponse(BaseModel):
    wireframes: str
    user_flow: str
    component_tree: str
    tech_spec: str
    story_ids: list[int] = Field(default_factory=list)


class LockEpicDesignRequest(BaseModel):
    epic_id: int
    epic_title: str = ""
    story_ids: list[int] = Field(default_factory=list)
    wireframes: str
    user_flow: str
    component_tree: str
    tech_spec: str


class TaigaTransitionFailure(BaseModel):
    story_id: int
    error: str


class LockEpicDesignResponse(BaseModel):
    ok: bool
    epic_id: int
    story_ids: list[int]
    taiga_failures: list[TaigaTransitionFailure] = Field(default_factory=list)
