"""Request and response schemas for Phase 4 QA endpoints."""

from pydantic import BaseModel, Field


class EligibleStoryPreview(BaseModel):
    story_id: int
    title: str
    epic_title: str
    gherkin_preview: str
    has_bdd: bool
    has_bug_report: bool
    is_regression_bypass: bool


class EligibleStoriesResponse(BaseModel):
    stories: list[EligibleStoryPreview]


class StoryContextResponse(BaseModel):
    story_id: int
    title: str
    epic_title: str
    gherkin: str
    technical_spec: str
    tech_stack: str
    task_list: list[dict] = Field(default_factory=list)


class GenerateTestPlanRequest(BaseModel):
    story_id: int


class GenerateTestPlanResponse(BaseModel):
    story_id: int
    test_plan_md: str


class SaveTestPlanRequest(BaseModel):
    story_id: int
    test_plan_md: str = Field(min_length=1, max_length=200_000)


class TestPlanResponse(BaseModel):
    story_id: int
    test_plan_md: str


class FailedScenario(BaseModel):
    scenario_name: str = Field(..., max_length=500)
    qa_notes: str = Field("", max_length=5_000)


class GenerateBugReportRequest(BaseModel):
    story_id: int
    failed_scenarios: list[FailedScenario] = Field(min_length=1)


class GenerateBugReportResponse(BaseModel):
    story_id: int
    bug_report_md: str


class PassGateRequest(BaseModel):
    story_id: int


class FailGateRequest(BaseModel):
    story_id: int
    bug_report_md: str = Field(min_length=1, max_length=200_000)
    root_cause: str = Field("", max_length=5_000)
    resolution_summary: str = Field("", max_length=5_000)
    push_to_pm: bool = False
