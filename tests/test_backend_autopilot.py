"""Tests for autopilot service functions and API routes."""
import threading
import time

import pytest
from fastapi import HTTPException

from backend.app.api.autopilot import (
    autopilot_pause,
    autopilot_resume,
    autopilot_start,
    autopilot_status,
    autopilot_stop,
    autopilot_take_over,
)
from backend.app.api.deps import get_request_context
from backend.app.schemas.autopilot import AutopilotEpic, AutopilotSettings, AutopilotStartRequest
from backend.app.services import autopilot_service as svc


def _ctx():
    return get_request_context(authorization="Bearer tok", project_id_new=42)


@pytest.fixture(autouse=True)
def _clear_jobs():
    svc._JOBS.clear()
    yield
    svc._JOBS.clear()


def _make_job(state: str = "running", settings: dict | None = None) -> dict:
    stop_event = threading.Event()
    resume_event = threading.Event()
    return {
        "job_id": "test-job-id",
        "state": state,
        "current_phase": "init",
        "current_epic_idx": None,
        "current_story_id": None,
        "checkpoint_phase": None,
        "events": [],
        "event_counter": 0,
        "story_count": 0,
        "stories_done": 0,
        "error": None,
        "_all_story_ids": [],
        "_stop_event": stop_event,
        "_resume_event": resume_event,
        "_thread": None,
        "settings": settings or {"pause_at_checkpoints": False, "create_epics_in_taiga": False},
        "concept": "Test concept",
        "epics": [],
        "tech_stack_hint": "",
        "taiga_base": "",
        "taiga_token": "tok",
        "ctx": None,
    }


# ---------------------------------------------------------------------------
# _emit
# ---------------------------------------------------------------------------

class TestEmit:
    def test_appends_event_with_correct_fields(self):
        job = _make_job()
        svc._emit(job, "info", "hello", phase="phase1", artifact="art")
        assert len(job["events"]) == 1
        ev = job["events"][0]
        assert ev["id"] == 1
        assert ev["level"] == "info"
        assert ev["msg"] == "hello"
        assert ev["phase"] == "phase1"
        assert ev["artifact"] == "art"
        assert isinstance(ev["ts"], float)

    def test_increments_event_counter_across_calls(self):
        job = _make_job()
        svc._emit(job, "info", "a")
        svc._emit(job, "success", "b")
        assert job["event_counter"] == 2
        assert job["events"][0]["id"] == 1
        assert job["events"][1]["id"] == 2

    def test_defaults_phase_and_artifact_to_empty(self):
        job = _make_job()
        svc._emit(job, "success", "done")
        ev = job["events"][0]
        assert ev["phase"] == ""
        assert ev["artifact"] == ""

    def test_all_levels_accepted(self):
        job = _make_job()
        for level in ("info", "success", "warning", "error", "checkpoint"):
            svc._emit(job, level, f"msg-{level}")
        assert len(job["events"]) == 5


# ---------------------------------------------------------------------------
# _check_stop
# ---------------------------------------------------------------------------

class TestCheckStop:
    def test_returns_false_when_running(self):
        job = _make_job(state="running")
        assert svc._check_stop(job) is False

    def test_returns_true_when_state_stopped(self):
        job = _make_job(state="stopped")
        assert svc._check_stop(job) is True

    def test_returns_true_when_stop_event_set(self):
        job = _make_job(state="running")
        job["_stop_event"].set()
        assert svc._check_stop(job) is True

    def test_returns_false_when_paused_and_event_not_set(self):
        job = _make_job(state="paused")
        assert svc._check_stop(job) is False


# ---------------------------------------------------------------------------
# _maybe_checkpoint
# ---------------------------------------------------------------------------

class TestMaybeCheckpoint:
    def test_no_pause_setting_skips_checkpoint(self):
        job = _make_job(settings={"pause_at_checkpoints": False})
        result = svc._maybe_checkpoint(job, "Phase 1")
        assert result is False
        assert job["state"] == "running"

    def test_already_stopped_before_checkpoint_returns_true(self):
        job = _make_job(state="stopped", settings={"pause_at_checkpoints": True})
        result = svc._maybe_checkpoint(job, "Phase 1")
        assert result is True

    def test_stop_event_during_checkpoint_wait_returns_true(self):
        job = _make_job(state="running", settings={"pause_at_checkpoints": True})

        def _stop_soon():
            time.sleep(0.05)
            job["_stop_event"].set()

        threading.Thread(target=_stop_soon, daemon=True).start()
        result = svc._maybe_checkpoint(job, "Phase 1")
        assert result is True

    def test_resume_event_during_checkpoint_continues(self):
        job = _make_job(state="running", settings={"pause_at_checkpoints": True})

        def _resume_soon():
            time.sleep(0.05)
            job["_resume_event"].set()

        threading.Thread(target=_resume_soon, daemon=True).start()
        result = svc._maybe_checkpoint(job, "Phase 1")
        assert result is False
        assert job["state"] == "running"

    def test_checkpoint_emits_checkpoint_and_resume_events(self):
        job = _make_job(state="running", settings={"pause_at_checkpoints": True})

        def _resume_soon():
            time.sleep(0.05)
            job["_resume_event"].set()

        threading.Thread(target=_resume_soon, daemon=True).start()
        svc._maybe_checkpoint(job, "Phase 1")
        levels = [e["level"] for e in job["events"]]
        assert "checkpoint" in levels
        assert "info" in levels  # "Resumed from checkpoint" event


# ---------------------------------------------------------------------------
# serialize_job
# ---------------------------------------------------------------------------

class TestSerializeJob:
    def test_excludes_threading_objects(self):
        job = _make_job()
        snap = svc.serialize_job(job)
        assert "_stop_event" not in snap
        assert "_resume_event" not in snap
        assert "_thread" not in snap
        assert "_all_story_ids" not in snap

    def test_includes_required_fields(self):
        job = _make_job()
        snap = svc.serialize_job(job)
        for key in ("job_id", "state", "current_phase", "events", "story_count", "stories_done",
                    "current_epic_idx", "current_story_id", "error", "checkpoint_phase"):
            assert key in snap, f"Missing field: {key}"

    def test_preserves_job_id(self):
        job = _make_job()
        snap = svc.serialize_job(job)
        assert snap["job_id"] == "test-job-id"

    def test_preserves_events_list(self):
        job = _make_job()
        svc._emit(job, "info", "test")
        snap = svc.serialize_job(job)
        assert len(snap["events"]) == 1
        assert snap["events"][0]["msg"] == "test"


# ---------------------------------------------------------------------------
# start_job / get_job
# ---------------------------------------------------------------------------

class TestStartGetJob:
    def test_start_job_stores_job_and_returns_uuid(self, monkeypatch):
        threads_started = []

        class _FakeThread:
            def __init__(self, *a, **kw):
                pass
            def start(self):
                threads_started.append(True)

        monkeypatch.setattr(threading, "Thread", _FakeThread)
        ctx = _ctx()
        job_id = svc.start_job(
            ctx,
            concept="Auth service",
            epics=[{"title": "Login", "description": ""}],
            tech_stack_hint="",
            settings={"pause_at_checkpoints": False, "create_epics_in_taiga": False},
        )
        assert isinstance(job_id, str) and len(job_id) == 36
        assert len(threads_started) == 1
        stored = svc.get_job(job_id)
        assert stored is not None
        assert stored["concept"] == "Auth service"
        assert stored["state"] == "running"

    def test_get_job_returns_none_for_unknown_id(self):
        assert svc.get_job("does-not-exist") is None

    def test_start_job_stores_settings(self, monkeypatch):
        class _FakeThread:
            def __init__(self, *a, **kw):
                pass
            def start(self):
                pass

        monkeypatch.setattr(threading, "Thread", _FakeThread)
        ctx = _ctx()
        job_id = svc.start_job(
            ctx,
            concept="c",
            epics=[{"title": "E", "description": ""}],
            tech_stack_hint="React",
            settings={"pause_at_checkpoints": True, "create_epics_in_taiga": True},
        )
        stored = svc.get_job(job_id)
        assert stored["tech_stack_hint"] == "React"
        assert stored["settings"]["pause_at_checkpoints"] is True
        assert stored["settings"]["create_epics_in_taiga"] is True


# ---------------------------------------------------------------------------
# pause_job / resume_job / stop_job
# ---------------------------------------------------------------------------

class TestJobControls:
    def setup_method(self):
        self.job = _make_job(state="running")
        svc._JOBS["test-job-id"] = self.job

    def test_pause_sets_state_to_paused(self):
        result = svc.pause_job("test-job-id")
        assert result is True
        assert self.job["state"] == "paused"
        assert not self.job["_resume_event"].is_set()

    def test_pause_noop_when_not_running(self):
        self.job["state"] = "paused"
        assert svc.pause_job("test-job-id") is False

    def test_pause_noop_on_unknown_job(self):
        assert svc.pause_job("nonexistent") is False

    def test_resume_sets_state_and_fires_event(self):
        self.job["state"] = "paused"
        result = svc.resume_job("test-job-id")
        assert result is True
        assert self.job["state"] == "running"
        assert self.job["_resume_event"].is_set()

    def test_resume_noop_when_not_paused(self):
        assert svc.resume_job("test-job-id") is False

    def test_resume_noop_on_unknown_job(self):
        assert svc.resume_job("nonexistent") is False

    def test_stop_sets_state_and_both_events(self):
        result = svc.stop_job("test-job-id")
        assert result is True
        assert self.job["state"] == "stopped"
        assert self.job["_stop_event"].is_set()
        assert self.job["_resume_event"].is_set()

    def test_stop_noop_on_done(self):
        self.job["state"] = "done"
        assert svc.stop_job("test-job-id") is False

    def test_stop_noop_on_error(self):
        self.job["state"] = "error"
        assert svc.stop_job("test-job-id") is False

    def test_stop_noop_on_already_stopped(self):
        self.job["state"] = "stopped"
        assert svc.stop_job("test-job-id") is False

    def test_stop_noop_on_unknown_job(self):
        assert svc.stop_job("nonexistent") is False


# ---------------------------------------------------------------------------
# API route tests
# ---------------------------------------------------------------------------

_FAKE_STATUS_SNAP = {
    "job_id": "abc",
    "state": "running",
    "current_phase": "phase1",
    "current_epic_idx": None,
    "current_story_id": None,
    "events": [],
    "error": None,
    "story_count": 0,
    "stories_done": 0,
    "checkpoint_phase": None,
}


class TestAutopilotRoutes:
    def test_start_returns_job_id(self, monkeypatch):
        monkeypatch.setattr(svc, "start_job", lambda *a, **kw: "fake-uuid-1234")
        resp = autopilot_start(
            AutopilotStartRequest(
                concept="Auth service",
                epics=[AutopilotEpic(title="Login")],
                settings=AutopilotSettings(),
            ),
            ctx=_ctx(),
            taiga_base="https://api.taiga.io/api/v1",
        )
        assert resp.job_id == "fake-uuid-1234"

    def test_start_requires_concept_and_epic(self):
        with pytest.raises(Exception):
            AutopilotStartRequest(concept="", epics=[], settings=AutopilotSettings())

    def test_status_returns_job_snapshot(self, monkeypatch):
        monkeypatch.setattr(svc, "get_job", lambda job_id: _make_job())
        monkeypatch.setattr(svc, "serialize_job", lambda job: _FAKE_STATUS_SNAP)
        resp = autopilot_status("abc", ctx=_ctx())
        assert resp.job_id == "abc"
        assert resp.state == "running"
        assert resp.current_phase == "phase1"

    def test_status_404_on_unknown_job(self, monkeypatch):
        monkeypatch.setattr(svc, "get_job", lambda job_id: None)
        with pytest.raises(HTTPException) as exc:
            autopilot_status("missing", ctx=_ctx())
        assert exc.value.status_code == 404

    def test_pause_transitions_state(self, monkeypatch):
        fake_job = _make_job(state="running")

        def _pause(job_id):
            fake_job["state"] = "paused"

        monkeypatch.setattr(svc, "get_job", lambda job_id: fake_job)
        monkeypatch.setattr(svc, "pause_job", _pause)
        resp = autopilot_pause("abc", ctx=_ctx())
        assert resp.ok is True
        assert resp.state == "paused"

    def test_pause_404_on_unknown_job(self, monkeypatch):
        monkeypatch.setattr(svc, "get_job", lambda job_id: None)
        with pytest.raises(HTTPException) as exc:
            autopilot_pause("missing", ctx=_ctx())
        assert exc.value.status_code == 404

    def test_resume_transitions_state(self, monkeypatch):
        fake_job = _make_job(state="paused")

        def _resume(job_id):
            fake_job["state"] = "running"

        monkeypatch.setattr(svc, "get_job", lambda job_id: fake_job)
        monkeypatch.setattr(svc, "resume_job", _resume)
        resp = autopilot_resume("abc", ctx=_ctx())
        assert resp.ok is True
        assert resp.state == "running"

    def test_resume_404_on_unknown_job(self, monkeypatch):
        monkeypatch.setattr(svc, "get_job", lambda job_id: None)
        with pytest.raises(HTTPException) as exc:
            autopilot_resume("missing", ctx=_ctx())
        assert exc.value.status_code == 404

    def test_stop_returns_stopped_state(self, monkeypatch):
        monkeypatch.setattr(svc, "get_job", lambda job_id: _make_job())
        monkeypatch.setattr(svc, "stop_job", lambda job_id: True)
        resp = autopilot_stop("abc", ctx=_ctx())
        assert resp.ok is True
        assert resp.state == "stopped"

    def test_stop_404_on_unknown_job(self, monkeypatch):
        monkeypatch.setattr(svc, "get_job", lambda job_id: None)
        with pytest.raises(HTTPException) as exc:
            autopilot_stop("missing", ctx=_ctx())
        assert exc.value.status_code == 404

    def test_take_over_stops_job_and_returns_stopped(self, monkeypatch):
        stopped_ids = []
        monkeypatch.setattr(svc, "get_job", lambda job_id: _make_job())
        monkeypatch.setattr(svc, "stop_job", lambda job_id: stopped_ids.append(job_id) or True)
        resp = autopilot_take_over("abc", ctx=_ctx())
        assert resp.ok is True
        assert resp.state == "stopped"
        assert "abc" in stopped_ids

    def test_take_over_404_on_unknown_job(self, monkeypatch):
        monkeypatch.setattr(svc, "get_job", lambda job_id: None)
        with pytest.raises(HTTPException) as exc:
            autopilot_take_over("missing", ctx=_ctx())
        assert exc.value.status_code == 404
