"""Tests for autopilot service functions and API routes."""
import asyncio
import json
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
    autopilot_stream,
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

    def test_start_job_stores_figma_fields(self, monkeypatch):
        class _FakeThread:
            def __init__(self, *a, **kw):
                pass
            def start(self):
                pass

        monkeypatch.setattr(threading, "Thread", _FakeThread)
        job_id = svc.start_job(
            _ctx(),
            concept="c",
            epics=[{"title": "E", "description": ""}],
            tech_stack_hint="",
            settings={"pause_at_checkpoints": False, "create_epics_in_taiga": False},
            figma_file_key="  ABC123 ",
            figma_token=" figd_tok ",
        )
        stored = svc.get_job(job_id)
        assert stored["figma_file_key"] == "ABC123"
        assert stored["figma_token"] == "figd_tok"


# ---------------------------------------------------------------------------
# _seed_figma
# ---------------------------------------------------------------------------

class TestSeedFigma:
    def test_noop_without_key_or_token(self):
        job = _make_job()
        job["figma_file_key"] = ""
        job["figma_token"] = ""

        class _CS:
            def write_context_file(self, *a, **kw):
                raise AssertionError("should not write when figma not configured")

        svc._seed_figma(job, _CS())
        assert "_figma_frames" not in job

    def test_seeds_context_and_stashes_frames(self, monkeypatch):
        job = _make_job()
        job["figma_file_key"] = "ABC123"
        job["figma_token"] = "figd_tok"
        frames = [{"node_id": "1:1", "name": "Login", "page": "Flows"}]
        flows = [{"from_name": "Login", "to_name": "Home"}]
        monkeypatch.setattr(
            "backend.app.services.figma_fetch.fetch_context_and_frames",
            lambda token, key: ("# Figma Design Context", frames, flows),
        )
        images = [{"node_id": "1:1", "name": "Login", "b64_png": "QUJD", "media_type": "image/png"}]
        monkeypatch.setattr(
            "backend.app.services.figma_fetch.fetch_frame_images",
            lambda token, key, fr: images,
        )
        written = {}

        class _CS:
            def write_context_file(self, name, content):
                written[name] = content

        svc._seed_figma(job, _CS())
        assert written["figma-context.md"].startswith("# Figma Design Context")
        assert job["_figma_frames"] == frames
        assert job["_figma_flows"] == flows
        assert job["_figma_images"] == images

    def test_seeding_failure_is_swallowed(self, monkeypatch):
        from backend.app.services.figma_fetch import FigmaFetchError

        job = _make_job()
        job["figma_file_key"] = "ABC123"
        job["figma_token"] = "bad"

        def _boom(token, key):
            raise FigmaFetchError("401")

        monkeypatch.setattr(
            "backend.app.services.figma_fetch.fetch_context_and_frames", _boom)

        class _CS:
            def write_context_file(self, *a, **kw):
                raise AssertionError("should not write on fetch failure")

        svc._seed_figma(job, _CS())  # must not raise
        assert "_figma_frames" not in job
        assert any(e["level"] == "warning" for e in job["events"])

    def test_project_mode_derives_one_epic_per_file(self, monkeypatch):
        job = _make_job()
        job["figma_token"] = "figd_tok"
        job["figma_project_id"] = "777"
        bundles = [
            {"file_key": "K1", "file_name": "Home", "context_md": "# Home",
             "frames": [{"node_id": "1:1", "name": "Login", "page": "P"}], "flows": [],
             "images": [{"node_id": "1:1", "name": "Login", "b64_png": "X", "media_type": "image/png"}]},
            {"file_key": "K2", "file_name": "Settings", "context_md": "# Settings",
             "frames": [{"node_id": "1:1", "name": "Prefs", "page": "P"}], "flows": [],
             "images": []},
        ]
        monkeypatch.setattr("backend.app.services.figma_fetch.fetch_project_designs", lambda t, p: bundles)
        monkeypatch.setattr("backend.app.services.figma_fetch.build_project_context_markdown",
                            lambda b: "# Figma Project Design Context")
        written = {}

        class _CS:
            def write_context_file(self, name, content):
                written[name] = content

        svc._seed_figma(job, _CS())
        assert written["figma-context.md"].startswith("# Figma Project Design Context")
        # one epic per file, with the file-key marker
        assert [e["title"] for e in job["epics"]] == ["Home", "Settings"]
        assert [e["_figma_file_key"] for e in job["epics"]] == ["K1", "K2"]
        assert set(job["_figma_by_file"]) == {"K1", "K2"}
        # union frames have file-namespaced node ids (no cross-file collision)
        assert {f["node_id"] for f in job["_figma_frames"]} == {"K1:1:1", "K2:1:1"}

    def test_project_mode_empty_bundles_skips(self, monkeypatch):
        job = _make_job()
        job["figma_token"] = "figd_tok"
        job["figma_project_id"] = "777"
        monkeypatch.setattr("backend.app.services.figma_fetch.fetch_project_designs", lambda t, p: [])

        class _CS:
            def write_context_file(self, *a, **kw):
                raise AssertionError("should not write when project has no usable files")

        svc._seed_figma(job, _CS())  # must not raise
        assert "epics" in job and job["epics"] == []  # untouched
        assert any(e["level"] == "warning" for e in job["events"])

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


# ---------------------------------------------------------------------------
# Automatic epics (auto_epics) — AI derives the epic set from the concept
# ---------------------------------------------------------------------------

class TestAutoEpics:
    def test_request_allows_empty_epics_when_auto(self):
        # No epics, no Figma project — valid only because auto_epics is on.
        req = AutopilotStartRequest(
            concept="A todo app",
            epics=[],
            settings=AutopilotSettings(auto_epics=True),
        )
        assert req.epics == []
        assert req.settings.auto_epics is True

    def test_request_rejects_empty_epics_when_not_auto(self):
        with pytest.raises(ValueError):
            AutopilotStartRequest(concept="A todo app", epics=[])

    def test_epic_field_reads_dict_and_object(self):
        assert svc._epic_field({"title": "Auth"}, "title") == "Auth"
        assert svc._epic_field({"title": None}, "title") == ""

        class _E:
            title = "Billing"
            description = "scope"

        assert svc._epic_field(_E(), "title") == "Billing"
        assert svc._epic_field(_E(), "description") == "scope"

    def test_run_phase1_derives_epics_from_concept(self, monkeypatch):
        job = _make_job(settings={"pause_at_checkpoints": False, "create_epics_in_taiga": False, "auto_epics": True})
        job["epics"] = []  # auto mode: nothing manual

        suggest_calls = []

        class _StubP1:
            def suggest_epics(self, ctx, *, hint=""):
                suggest_calls.append(hint)
                return [{"title": "Authentication", "description": "logins"}, {"title": "Billing", "description": ""}]

            def generate_nl_stories(self, ctx, *, epic_subject, epic_description, images=None, instructions=""):
                return ("draft", 1)

            def compile_gherkin(self, *, nl_draft):
                return [{"title": "Story"}]

            def finalize_stories(self, ctx, *, epic_id, epic_subject, stories):
                return {"story_ids": [epic_id]}

        class _StubCS:
            def set_active(self, ctx):
                pass

            def init_context(self):
                pass

            def write_context_file(self, name, content):
                pass

        monkeypatch.setattr(svc, "Phase1Service", _StubP1)
        monkeypatch.setattr(svc, "ContextService", _StubCS)

        story_ids = svc._run_phase1(job, _ctx())

        assert suggest_calls == [""]  # called once, with the (empty) tech-stack hint
        assert [e["title"] for e in job["epics"]] == ["Authentication", "Billing"]
        assert len(story_ids) == 2  # one story per derived epic

    def test_run_phase1_skips_derivation_when_epics_given(self, monkeypatch):
        job = _make_job(settings={"pause_at_checkpoints": False, "create_epics_in_taiga": False, "auto_epics": True})
        job["epics"] = [{"title": "Manual epic", "description": ""}]

        class _StubP1:
            def suggest_epics(self, ctx, *, hint=""):
                raise AssertionError("suggest_epics must not run when epics are supplied")

            def generate_nl_stories(self, ctx, *, epic_subject, epic_description, images=None, instructions=""):
                return ("draft", 1)

            def compile_gherkin(self, *, nl_draft):
                return [{"title": "Story"}]

            def finalize_stories(self, ctx, *, epic_id, epic_subject, stories):
                return {"story_ids": [epic_id]}

        class _StubCS:
            def set_active(self, ctx):
                pass

            def init_context(self):
                pass

            def write_context_file(self, name, content):
                pass

        monkeypatch.setattr(svc, "Phase1Service", _StubP1)
        monkeypatch.setattr(svc, "ContextService", _StubCS)

        svc._run_phase1(job, _ctx())
        assert [e["title"] for e in job["epics"]] == ["Manual epic"]


# ---------------------------------------------------------------------------
# Phase 1 Taiga push — story carries the Gherkin as description AND is linked to
# its epic via the related-userstories endpoint (not an ignored `epic` field).
# ---------------------------------------------------------------------------

class TestPhase1TaigaPush:
    def test_story_gets_description_and_epic_link(self, monkeypatch):
        job = _make_job(settings={"pause_at_checkpoints": False, "create_epics_in_taiga": True, "auto_epics": False})
        job["epics"] = [{"title": "Auth", "description": "logins"}]
        job["taiga_base"] = "https://taiga.example/api/v1"
        job["taiga_token"] = "tok"

        posts = []

        def _fake_post(url, token, body):
            posts.append((url, body))
            if url.endswith("/epics"):
                return {"id": 555}
            if url.endswith("/userstories"):
                return {"id": 1001}
            return {"id": 1}  # related_userstories

        monkeypatch.setattr(svc, "_taiga_post", _fake_post)

        class _StubP1:
            def generate_nl_stories(self, ctx, *, epic_subject, epic_description, images=None, instructions=""):
                return ("draft", 1)

            def compile_gherkin(self, *, nl_draft):
                return [{"title": "Sign in", "gherkin": "Scenario: user signs in"}]

            def finalize_stories(self, ctx, *, epic_id, epic_subject, stories):
                return {"story_ids": [s["id"] for s in stories]}

        class _StubCS:
            def set_active(self, ctx):
                pass

            def init_context(self):
                pass

            def write_context_file(self, name, content):
                pass

        monkeypatch.setattr(svc, "Phase1Service", _StubP1)
        monkeypatch.setattr(svc, "ContextService", _StubCS)

        story_ids = svc._run_phase1(job, _ctx())

        # The userstory POST carries the Gherkin as description and NO `epic` field.
        us_posts = [b for (u, b) in posts if u.endswith("/userstories")]
        assert us_posts == [{"project": 42, "subject": "Sign in", "description": "Scenario: user signs in"}]
        # The story is linked to its epic via the related-userstories endpoint.
        link_posts = [(u, b) for (u, b) in posts if "related_userstories" in u]
        assert link_posts == [("https://taiga.example/api/v1/epics/555/related_userstories", {"epic": 555, "user_story": 1001})]
        # The real Taiga id (not a synthetic one) is threaded into the story index.
        assert story_ids == [1001]


# ---------------------------------------------------------------------------
# Live steer — a note injected into subsequent generative steps
# ---------------------------------------------------------------------------

class TestSteer:
    def test_steer_job_sets_note_and_emits(self, monkeypatch):
        job = _make_job(state="running")
        monkeypatch.setitem(svc._JOBS, job["job_id"], job)
        assert svc.steer_job(job["job_id"], "  prefer mobile-first  ") is True
        assert job["steer_note"] == "prefer mobile-first"
        assert any("Steer updated" in e["msg"] for e in job["events"])

    def test_steer_job_clears_with_empty_note(self, monkeypatch):
        job = _make_job(state="running")
        job["steer_note"] = "old"
        monkeypatch.setitem(svc._JOBS, job["job_id"], job)
        assert svc.steer_job(job["job_id"], "") is True
        assert job["steer_note"] == ""

    def test_steer_job_rejects_terminal(self, monkeypatch):
        job = _make_job(state="done")
        monkeypatch.setitem(svc._JOBS, job["job_id"], job)
        assert svc.steer_job(job["job_id"], "x") is False

    def test_steer_note_flows_into_phase1_instructions(self, monkeypatch):
        job = _make_job(settings={"pause_at_checkpoints": False, "create_epics_in_taiga": False, "auto_epics": False})
        job["epics"] = [{"title": "Auth", "description": ""}]
        job["steer_note"] = "keep stories tiny"

        seen = {}

        class _StubP1:
            def generate_nl_stories(self, ctx, *, epic_subject, epic_description, images=None, instructions=""):
                seen["instructions"] = instructions
                return ("draft", 1)

            def compile_gherkin(self, *, nl_draft):
                return [{"title": "S", "gherkin": "Scenario: x"}]

            def finalize_stories(self, ctx, *, epic_id, epic_subject, stories):
                return {"story_ids": [s["id"] for s in stories]}

        class _StubCS:
            def set_active(self, ctx):
                pass

            def init_context(self):
                pass

            def write_context_file(self, name, content):
                pass

        monkeypatch.setattr(svc, "Phase1Service", _StubP1)
        monkeypatch.setattr(svc, "ContextService", _StubCS)

        svc._run_phase1(job, _ctx())
        assert seen["instructions"] == "keep stories tiny"


# ---------------------------------------------------------------------------
# Live stream endpoint (NDJSON push)
# ---------------------------------------------------------------------------

class TestStream:
    def test_unknown_job_404(self):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(autopilot_stream("nope", ctx=_ctx()))
        assert exc.value.status_code == 404

    def test_terminal_job_emits_one_snapshot_then_closes(self, monkeypatch):
        job = _make_job(state="done")
        monkeypatch.setitem(svc._JOBS, job["job_id"], job)
        svc._emit(job, "success", "Autopilot complete", phase="done")

        async def _collect():
            resp = await autopilot_stream(job["job_id"], ctx=_ctx())
            chunks = [c async for c in resp.body_iterator]
            return resp, chunks

        resp, chunks = asyncio.run(_collect())
        assert resp.media_type == "application/x-ndjson"
        frames = [json.loads(c) for c in b"".join(
            c if isinstance(c, bytes) else c.encode() for c in chunks
        ).decode().splitlines() if c.strip()]
        # A done job yields exactly one snapshot, then the generator stops.
        assert len(frames) == 1
        assert frames[0]["job_id"] == job["job_id"]
        assert frames[0]["state"] == "done"
        assert any(e["msg"] == "Autopilot complete" for e in frames[0]["events"])


# ---------------------------------------------------------------------------
# Durable resume — persist snapshot, reattach as interrupted, resume from cursor
# ---------------------------------------------------------------------------

class TestResume:
    def _save_snapshot(self, **over):
        from backend.app.services.context_service import ContextService
        cs = ContextService()
        cs.set_active(_ctx())
        cs.init_context()
        snap = {
            "job_id": "rj",
            "state": "running",
            "current_phase": "phase3",
            "current_epic_idx": None,
            "current_story_id": None,
            "events": [{"id": 1, "ts": 1.0, "level": "info", "msg": "x", "phase": "phase1", "artifact": ""}],
            "error": None,
            "story_count": 3,
            "stories_done": 1,
            "checkpoint_phase": None,
            "steer_note": "go small",
            "_resume": {
                "concept": "c", "epics": [{"title": "E", "description": ""}], "tech_stack_hint": "",
                "settings": {"pause_at_checkpoints": False, "create_epics_in_taiga": False, "auto_epics": False},
                "completed_epics": [0], "all_story_ids": [10, 11, 12],
                "taiga_base": "", "figma_file_key": "", "figma_project_id": "",
            },
        }
        snap.update(over)
        cs.save_autopilot_job(snap)

    def test_persisted_status_maps_running_to_interrupted(self, ctx):
        self._save_snapshot()
        st = svc.load_persisted_status(_ctx())
        assert st["state"] == "interrupted"
        assert st["current_phase"] == "phase3"
        assert "_resume" not in st  # internal cursor stripped from the status payload

    def test_persisted_status_returns_none_without_snapshot(self, ctx):
        assert svc.load_persisted_status(_ctx()) is None

    def test_persisted_status_prefers_live_in_memory_job(self, ctx, monkeypatch):
        self._save_snapshot()
        live = _make_job(state="running")
        live["job_id"] = "rj"
        monkeypatch.setitem(svc._JOBS, "rj", live)
        st = svc.load_persisted_status(_ctx())
        assert st["state"] == "running"  # live status wins over the disk snapshot

    def test_resume_rebuilds_job_from_cursor_and_launches(self, ctx, monkeypatch):
        self._save_snapshot()
        launched = []
        monkeypatch.setattr(svc, "_run_pipeline", lambda jid: launched.append(jid))
        jid = svc.resume_interrupted_job(_ctx())
        assert jid == "rj"
        job = svc.get_job("rj")
        assert job is not None
        assert job["current_phase"] == "phase3"
        assert job["completed_epics"] == [0]
        assert job["_all_story_ids"] == [10, 11, 12]
        assert job["steer_note"] == "go small"
        assert job["figma_token"] == ""  # secret not restored
        time.sleep(0.05)
        assert launched == ["rj"]

    def test_resume_none_when_no_snapshot(self, ctx):
        assert svc.resume_interrupted_job(_ctx()) is None

    def test_clear_persisted_removes_snapshot(self, ctx):
        self._save_snapshot()
        svc.clear_persisted_job(_ctx())
        assert svc.load_persisted_status(_ctx()) is None


# ---------------------------------------------------------------------------
# Resume idempotency — re-entering a phase skips already-done units
# ---------------------------------------------------------------------------

class _NoopCS:
    def set_active(self, ctx):
        pass

    def init_context(self):
        pass

    def write_context_file(self, name, content):
        pass

    def save_autopilot_job(self, snap):
        pass


class TestResumeSkips:
    def test_phase1_skips_completed_epics(self, monkeypatch):
        job = _make_job(settings={"pause_at_checkpoints": False, "create_epics_in_taiga": False, "auto_epics": False})
        job["epics"] = [{"title": "A", "description": ""}, {"title": "B", "description": ""}]
        job["completed_epics"] = [0]
        job["_all_story_ids"] = [10]
        generated = []

        class _StubP1:
            def generate_nl_stories(self, ctx, *, epic_subject, epic_description, images=None, instructions=""):
                generated.append(epic_subject)
                return ("draft", 1)

            def compile_gherkin(self, *, nl_draft):
                return [{"title": "S", "gherkin": "Scenario: x"}]

            def finalize_stories(self, ctx, *, epic_id, epic_subject, stories):
                return {"story_ids": [s["id"] for s in stories]}

        monkeypatch.setattr(svc, "Phase1Service", _StubP1)
        monkeypatch.setattr(svc, "ContextService", _NoopCS)

        ids = svc._run_phase1(job, _ctx())
        assert generated == ["B"]   # epic 0 (A) skipped on resume
        assert 10 in ids            # prior story id retained
        assert job["completed_epics"] == [0, 1]

    def test_phase3_skips_already_planned_stories(self, monkeypatch):
        job = _make_job(settings={"pause_at_checkpoints": False, "create_epics_in_taiga": False, "auto_epics": False})
        monkeypatch.setattr(svc, "_status_snapshot", lambda j: {"10": "deployed", "11": "gherkin_locked"})
        monkeypatch.setattr(svc, "ContextService", _NoopCS)
        planned = []

        class _StubP3:
            def generate_tasks(self, ctx, story_id, instructions=""):
                planned.append(story_id)
                return [{"id": 1, "subject": "t", "description": ""}]

            def generate_proposal(self, *a, **k):
                return "pack"

            def save_proposal(self, *a, **k):
                pass

            def lock_story(self, *a, **k):
                pass

        monkeypatch.setattr(svc, "Phase3Service", _StubP3)
        svc._run_phase3(job, _ctx(), [10, 11])
        assert planned == [11]  # story 10 (deployed) skipped on resume
        assert job["stories_done"] == 2  # skipped one counted for progress


# ---------------------------------------------------------------------------
# Bounded concurrency — Phases 3/4 process stories in parallel
# ---------------------------------------------------------------------------

class TestConcurrency:
    def test_phase3_processes_all_pending_stories(self, monkeypatch):
        job = _make_job(settings={"pause_at_checkpoints": False, "create_epics_in_taiga": False, "auto_epics": False})
        monkeypatch.setattr(svc, "_status_snapshot", lambda j: {})  # nothing done yet
        monkeypatch.setattr(svc, "ContextService", _NoopCS)
        planned: list[int] = []
        lock = threading.Lock()

        class _StubP3:
            def generate_tasks(self, ctx, story_id, instructions=""):
                with lock:
                    planned.append(story_id)
                return [{"id": 1, "subject": "t", "description": ""}]

            def generate_proposal(self, *a, **k):
                return "pack"

            def save_proposal(self, *a, **k):
                pass

            def lock_story(self, *a, **k):
                pass

        monkeypatch.setattr(svc, "Phase3Service", _StubP3)
        svc._run_phase3(job, _ctx(), [1, 2, 3, 4, 5])
        assert sorted(planned) == [1, 2, 3, 4, 5]  # every pending story ran
        assert job["stories_done"] == 5
