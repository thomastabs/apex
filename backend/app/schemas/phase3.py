"""Request and response schemas for Phase 3 implementation endpoints."""

from pydantic import BaseModel, Field


class GenerateTasksRequest(BaseModel):
    story_id: int


class TaskSchema(BaseModel):
    id: int
    subject: str
    description: str


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
