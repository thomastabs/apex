"""Tests for the Phase 6 backend service (spec↔code conformance)."""

import pytest

from backend.app.services.phase6_service import Phase6Service, Phase6ValidationError
from backend.app.services.request_context import RequestContext


_GHERKIN = "Scenario: User signs in\n  Then a token is returned"
_TECH_SPEC = "- `POST /api/v1/auth/login` · auth:none · out:token:str"
_GITHUB = "# GitHub Repository Context\n\n## File Tree\n\n```\nbackend/api/auth.py\n```\n"


def _index():
    return {
        "1": {"story_id": 1, "title": "Login", "epic_title": "Auth", "phase_status": "implementation"},
        "2": {"story_id": 2, "title": "Draft", "epic_title": "Auth", "phase_status": "design_locked"},
        "3": {"story_id": 3, "title": "Done", "epic_title": "Auth", "phase_status": "deployed"},
    }


class FakeAiService:
    def __init__(self):
        self.layer_a_calls = 0
        self.verify_calls = 0
        self.last_precheck = None

    def layer_a_conformance(self, gherkin, technical_spec, github_context, constraints=""):
        self.layer_a_calls += 1
        self.last_github_context = github_context
        return {"endpoints": [], "scenarios": [], "constraints": [], "summary": "layerA", "score": 40}

    def verify_conformance(self, story_subject, gherkin, technical_spec, github_context,
                           constraints="", tech_stack="", precheck=None):
        self.verify_calls += 1
        self.last_precheck = precheck
        self.last_github_context = github_context
        return {"endpoints": [], "scenarios": [], "constraints": [], "summary": "AI", "score": 70}


class FakeContextService:
    def __init__(self, index=None):
        self.index = index if index is not None else _index()
        self.store: dict[int, dict] = {}
        self.context_files = {"github-context.md": _GITHUB, "constraints.md": ""}

    def set_active(self, ctx):
        self.project_id = ctx.project_id

    def story_index(self):
        return self.index

    def story_gherkin(self, story_id):
        return _GHERKIN

    def story_technical_spec(self, story_id):
        return _TECH_SPEC

    def read_tech_stack(self):
        return "FastAPI"

    def read_context_file(self, filename):
        return self.context_files.get(filename, "")

    def save_conformance(self, story_id, data):
        self.store[story_id] = {**data, "story_id": story_id, "generated_at": "2026-06-16T00:00:00Z"}

    def load_conformance(self, story_id):
        return self.store.get(story_id)


@pytest.fixture
def ctx():
    return RequestContext(pm_token="t", project_id=1, instance_id="test")


def _service(index=None):
    ai = FakeAiService()
    context = FakeContextService(index)
    return Phase6Service(ai=ai, context=context), ai, context


def test_eligible_stories_filters_and_reports_score(ctx):
    svc, _, context = _service()
    context.store[1] = {"score": 55}
    rows = svc.get_eligible_stories(ctx)
    ids = [r["story_id"] for r in rows]
    assert ids == [1, 3]  # design_locked (2) excluded
    by = {r["story_id"]: r for r in rows}
    assert by[1]["has_conformance"] and by[1]["score"] == 55
    assert by[3]["has_conformance"] is False and by[3]["score"] is None


def test_verify_deterministic_only_no_ai(ctx):
    svc, ai, context = _service()
    report = svc.verify_conformance(ctx, 1, ai=False)
    assert ai.layer_a_calls == 1 and ai.verify_calls == 0
    assert report["layer"] == "deterministic"
    assert report["score"] == 40
    assert report["title"] == "Login"
    assert context.store[1]["story_id"] == 1


def test_verify_ai_layer_feeds_precheck(ctx):
    svc, ai, context = _service()
    report = svc.verify_conformance(ctx, 1, ai=True)
    assert ai.layer_a_calls == 1 and ai.verify_calls == 1
    # Layer-A result is passed to the AI as grounding.
    assert ai.last_precheck["score"] == 40
    assert report["layer"] == "ai" and report["score"] == 70
    assert context.store[1]["summary"] == "AI"


def test_ineligible_story_raises(ctx):
    svc, _, _ = _service()
    with pytest.raises(Phase6ValidationError):
        svc.verify_conformance(ctx, 2)  # design_locked → not eligible


def test_unknown_story_raises(ctx):
    svc, _, _ = _service()
    with pytest.raises(Phase6ValidationError):
        svc.verify_conformance(ctx, 999)


def test_unsynced_github_blanked(ctx):
    svc, ai, context = _service()
    context.context_files["github-context.md"] = "# GitHub Repository Context\n\n<!-- not synced -->"
    captured = {}
    ai.layer_a_conformance = lambda g, t, gh, c="": captured.setdefault("gh", gh) or {"score": 0}
    svc.verify_conformance(ctx, 1, ai=False)
    assert captured["gh"] == ""  # template treated as not synced


def test_get_conformance_roundtrip(ctx):
    svc, _, context = _service()
    assert svc.get_conformance(ctx, 1) is None
    svc.verify_conformance(ctx, 1, ai=False)
    assert svc.get_conformance(ctx, 1)["story_id"] == 1


def test_extra_files_appended_to_context(ctx):
    svc, ai, context = _service()
    svc.verify_conformance(ctx, 1, ai=True, extra_files=[{"path": "api/auth.py", "content": "def login(): pass"}])
    # the supplied file is appended to the github context the AI sees (#1 v2)
    assert "## `api/auth.py`" in ai.last_github_context
    assert "def login(): pass" in ai.last_github_context
