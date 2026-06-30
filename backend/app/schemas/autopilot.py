"""Pydantic schemas for the Autopilot API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


AutopilotState = Literal["running", "paused", "stopped", "done", "error"]
AutopilotPhase = Literal["init", "phase1", "phase2", "phase3", "phase4", "phase5", "done"]
EventLevel = Literal["info", "success", "warning", "error", "checkpoint"]


class AutopilotEpic(BaseModel):
    title: str = Field(min_length=1)
    description: str = ""


class AutopilotSettings(BaseModel):
    pause_at_checkpoints: bool = True
    # Default ON: a fresh Autopilot run should populate the PM board so it matches the
    # story index (index-only runs show as "0 on board / N indexed"). Disable for a
    # re-run where the epics/stories already exist in Taiga.
    create_epics_in_taiga: bool = True
    # When true, the pipeline derives the epic set from the project concept (AI)
    # instead of requiring a manual epics list. Ignored in Figma project mode
    # (which already creates one epic per file).
    auto_epics: bool = False


class AutopilotStartRequest(BaseModel):
    concept: str = Field(min_length=1)
    # Epics are required UNLESS a Figma project is supplied — in project mode the
    # pipeline derives one epic per project file (file-as-epic).
    epics: list[AutopilotEpic] = Field(default_factory=list)
    tech_stack_hint: str = ""
    settings: AutopilotSettings = Field(default_factory=AutopilotSettings)
    # Optional Figma seeding: design context injected into Phase 1/2 + a real
    # screen-flow built from frames. The token is held in-memory for the job only.
    figma_file_key: str = Field("", max_length=128)
    figma_token: str = Field("", max_length=2_000)
    # When set, the pipeline ingests the whole project and creates one epic per file.
    figma_project_id: str = Field("", max_length=64)

    @model_validator(mode="after")
    def _epics_required_without_project(self) -> "AutopilotStartRequest":
        # Epics may be empty when the AI derives them (auto_epics) or when a Figma
        # project supplies one epic per file.
        if not self.epics and not self.figma_project_id.strip() and not self.settings.auto_epics:
            raise ValueError("epics is required unless figma_project_id is set or auto_epics is enabled")
        return self


class AutopilotEvent(BaseModel):
    id: int
    ts: float
    level: EventLevel
    msg: str
    phase: str = ""
    artifact: str = ""


class AutopilotStatusResponse(BaseModel):
    job_id: str
    state: AutopilotState
    current_phase: AutopilotPhase
    current_epic_idx: int | None = None
    current_story_id: int | None = None
    events: list[AutopilotEvent]
    error: str | None = None
    story_count: int = 0
    stories_done: int = 0
    checkpoint_phase: str | None = None


class AutopilotStartResponse(BaseModel):
    job_id: str


class AutopilotControlResponse(BaseModel):
    ok: bool
    state: AutopilotState
