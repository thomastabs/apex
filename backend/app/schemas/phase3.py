"""Request and response schemas for Phase 3 implementation endpoints."""

from typing import Literal

from pydantic import BaseModel, Field


class GenerateTasksRequest(BaseModel):
    story_id: int
    instructions: str = Field("", max_length=2_000)


class TaskSchema(BaseModel):
    id: int
    subject: str
    description: str
    effort_estimate: Literal["XS", "S", "M", "L", "XL"]
    covered_scenarios: list[str]
    predecessor_task_ids: list[int] = Field(default_factory=list)
    taiga_task_id: int | None = None


class GenerateTasksResponse(BaseModel):
    story_id: int
    tasks: list[TaskSchema]


class StoryPreview(BaseModel):
    story_id: int
    title: str
    epic_title: str
    gherkin_preview: str
    tech_spec_preview: str
    # "design_locked" = not yet decomposed; anything later (implementation, qa,
    # qa_passed) means the story is locked as implementation-ready.
    phase_status: str = "design_locked"
    # True as soon as ANY task has a saved dev pack — independent of phase_status:
    # a story can have packs generated (tasks decomposed, some/all packs written)
    # without yet being locked (Stage D's "Lock Story" not clicked), so this and
    # phase_status can and do disagree.
    has_proposal: bool = False


class EligibleStoriesResponse(BaseModel):
    stories: list[StoryPreview]


class StoryContextResponse(BaseModel):
    story_id: int
    title: str
    epic_title: str
    gherkin: str
    technical_spec: str
    project_concept: str
    tech_stack: str
    design_bundle: str


class TaskSummary(BaseModel):
    id: int
    subject: str
    description: str = ""


class GenerateProposalRequest(BaseModel):
    story_id: int
    task_id: int
    task_subject: str = Field(..., max_length=2_000)
    task_description: str = Field(..., max_length=10_000)
    hint: str = Field("", max_length=2_000)
    recent_commits_context: str = Field("", max_length=20_000)
    all_tasks: list[TaskSummary] = Field(default_factory=list)


class GenerateProposalResponse(BaseModel):
    proposal_md: str


class SaveProposalRequest(BaseModel):
    story_id: int
    task_id: int
    proposal_md: str = Field(min_length=1, max_length=200_000)


class LockStoryRequest(BaseModel):
    story_id: int
    task_ids: list[int] = Field(min_length=1)


class ProposalItem(BaseModel):
    task_id: int
    proposal_md: str


class ProposalsResponse(BaseModel):
    story_id: int
    proposals: list[ProposalItem]


class PackItem(BaseModel):
    story_id: int
    story_title: str = ""
    task_id: int
    chars: int = 0


class PacksResponse(BaseModel):
    packs: list[PackItem]


class ConflictRow(BaseModel):
    story_id: int
    title: str = ""
    reason: str = ""
    files: list[str] = Field(default_factory=list)
    endpoints: list[str] = Field(default_factory=list)


class DesignConflictReportResponse(BaseModel):
    results: list[ConflictRow] = Field(default_factory=list)
    conflicted_ids: list[int] = Field(default_factory=list)


class CrossCheckTasksRequest(BaseModel):
    story_id: int
    alt_model: str = Field("", max_length=100)


