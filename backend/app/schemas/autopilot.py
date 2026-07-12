"""Pydantic schemas for the Autopilot API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


AutopilotState = Literal["running", "paused", "stopped", "done", "error", "interrupted"]
AutopilotPhase = Literal["init", "phase1", "phase2", "phase3", "phase4", "phase5", "done"]
EventLevel = Literal["info", "success", "warning", "error", "checkpoint"]

_PHASE_ORDER = ["phase1", "phase2", "phase3", "phase4", "phase5"]


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
    # After Phase 1, drop near-duplicate stories that independent per-epic generation
    # produced across DIFFERENT epics, so the backlog stays concise (pure, no AI).
    dedup_stories: bool = True


class AutopilotStartRequest(BaseModel):
    concept: str = ""
    # When true, Phase 1 uses the project's existing project-concept.md as the concept
    # instead of `concept` (which is then ignored). The run fails early if the file is
    # empty or still the blank template.
    use_existing_concept: bool = False
    # Epics are required UNLESS a Figma project is supplied — in project mode the
    # pipeline derives one epic per project file (file-as-epic).
    epics: list[AutopilotEpic] = Field(default_factory=list)
    tech_stack_hint: str = ""
    # Optional steering note applied as `instructions` to every generative step from
    # the very first phase — the setup-time equivalent of the live steer endpoint
    # (POST /{job_id}/steer), which takes over carrying it (as steer_note) once the
    # run is underway and the user can update or clear it.
    instructions: str = Field("", max_length=2_000)
    settings: AutopilotSettings = Field(default_factory=AutopilotSettings)
    # Optional Figma seeding: design context injected into Phase 1/2 + a real
    # screen-flow built from frames. The token is held in-memory for the job only.
    figma_file_key: str = Field("", max_length=128)
    figma_token: str = Field("", max_length=2_000)
    # When set, the pipeline ingests the whole project and creates one epic per file.
    figma_project_id: str = Field("", max_length=64)
    # Start the pipeline at a later phase when earlier ones are already done in this
    # project (e.g. Phase 2 finished manually → start Autopilot at Phase 3). Phases
    # before it are skipped and the existing story index drives the rest.
    start_phase: Literal["phase1", "phase2", "phase3", "phase4", "phase5"] = "phase1"
    # Stop the pipeline once this phase completes instead of running through Phase 5 —
    # e.g. start at Phase 1, end at Phase 2, then take the design over manually.
    end_phase: Literal["phase1", "phase2", "phase3", "phase4", "phase5"] = "phase5"

    @model_validator(mode="after")
    def _epics_required_for_phase1(self) -> "AutopilotStartRequest":
        # Concept + epics only matter for a from-scratch run (Phase 1). When starting
        # later, the project's existing stories drive the pipeline.
        if self.start_phase != "phase1":
            return self
        if not self.concept.strip() and not self.use_existing_concept:
            raise ValueError("concept is required when starting at Phase 1")
        if not self.epics and not self.figma_project_id.strip() and not self.settings.auto_epics:
            raise ValueError("epics is required unless figma_project_id is set or auto_epics is enabled")
        return self

    @model_validator(mode="after")
    def _end_not_before_start(self) -> "AutopilotStartRequest":
        if _PHASE_ORDER.index(self.end_phase) < _PHASE_ORDER.index(self.start_phase):
            raise ValueError("end_phase cannot be before start_phase")
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
    epic_count: int = 0
    epics_done: int = 0
    checkpoint_phase: str | None = None
    steer_note: str = ""


class AutopilotStartResponse(BaseModel):
    job_id: str


class AutopilotSteerRequest(BaseModel):
    note: str = Field("", max_length=2_000)


class AutopilotControlResponse(BaseModel):
    ok: bool
    state: AutopilotState
