"""Request and response schemas for Phase 3 implementation endpoints."""

from typing import Literal

from pydantic import BaseModel, Field


class GenerateTasksRequest(BaseModel):
    story_id: int


class TaskSchema(BaseModel):
    id: int
    subject: str
    description: str
    effort_estimate: Literal["XS", "S", "M", "L", "XL"]
    covered_scenarios: list[str]
    predecessor_task_ids: list[int] = Field(default_factory=list)


class GenerateTasksResponse(BaseModel):
    story_id: int
    tasks: list[TaskSchema]


class StoryPreview(BaseModel):
    story_id: int
    title: str
    epic_title: str
    gherkin_preview: str
    tech_spec_preview: str


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


class GenerateProposalRequest(BaseModel):
    story_id: int
    task_id: int
    task_subject: str
    task_description: str


class GenerateProposalResponse(BaseModel):
    proposal_md: str


class SaveProposalRequest(BaseModel):
    story_id: int
    task_id: int
    proposal_md: str = Field(min_length=1)


class LockStoryRequest(BaseModel):
    story_id: int
    task_ids: list[int] = Field(min_length=1)


class TaskListRequest(BaseModel):
    tasks: list[TaskSchema]


class TaskListResponse(BaseModel):
    story_id: int
    tasks: list[TaskSchema]


class TaskBoardTask(BaseModel):
    id: int
    subject: str
    effort_estimate: str = ""
    has_proposal: bool


class TaskBoardStory(BaseModel):
    story_id: int
    title: str
    epic_title: str
    phase_status: str
    tasks: list[TaskBoardTask]


class TaskBoardResponse(BaseModel):
    stories: list[TaskBoardStory]


class ProposalItem(BaseModel):
    task_id: int
    proposal_md: str


class ProposalsResponse(BaseModel):
    story_id: int
    proposals: list[ProposalItem]
