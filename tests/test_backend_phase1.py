"""Tests for the migrated FastAPI Phase 1 backend service."""

import pytest

from backend.app.services.phase1_service import Phase1Service, Phase1ValidationError
from backend.app.services.request_context import RequestContext


class FakeAiService:
    def __init__(self):
        self.generated_args = None

    def suggest_epics(self, project_concept: str, hint: str) -> list[dict]:
        return [{"title": "Account Access", "description": f"{project_concept}|{hint}"}]

    def analyze_requirement_gaps(self, project_concept, existing_epics, hint="") -> dict:
        self.gap_args = (project_concept, existing_epics, hint)
        return {
            "assessment": "Decent coverage.",
            "gaps": [{"title": "Notifications", "kind": "missing_epic",
                      "rationale": "Concept mentions alerts.", "suggested_stories": ["Email alert"]}],
        }

    def generate_nl_stories(
        self,
        epic_subject: str,
        epic_description: str,
        *,
        hint: str,
        project_concept: str,
        instructions: str = "",
        figma_context: str = "",
    ) -> tuple[str, int]:
        self.generated_args = (epic_subject, epic_description, hint, project_concept)
        self.figma_context = figma_context
        return "[S] Story A", 1

    def generate_stories_from_figma(self, frames, flows, *, project_concept, instructions=""):
        self.figma_args = (frames, flows, project_concept)
        return "[S] Login Story", len(frames)

    def compile_gherkin(self, nl_draft: str) -> list[dict]:
        return [{"title": "Story A", "size": "S", "gherkin": "Feature: A\n\n  Scenario: s"}]

    # Multi-model cross-check
    alt = "gpt-4o"

    def pick_alt_model(self, model: str):
        return self.alt

    def resolve_alt_model(self, primary_model: str, requested: str = ""):
        return requested or self.pick_alt_model(primary_model)

    def cross_check_nl_stories(self, epic_subject, epic_description, *, hint, project_concept, primary_model, alt_model):
        self.cross_args = (epic_subject, primary_model, alt_model)
        return {"agreed": ["Valid login"],
                "only_primary": [],
                "only_alt": [{"story_title": "Login", "title": "Locked account", "description": "lock"}]}

    def generate_constraints(self, project_concept, tech_stack, all_stories):
        self.constraints_args = (project_concept, tech_stack, all_stories)
        items = [{"id": "NFR-1", "category": "security", "ears_type": "event-driven",
                  "text": "When a user signs in, the system shall rate-limit attempts.",
                  "rationale": "brute-force"}]
        return items, "# Constraints\n\n## Security\n\n- **NFR-1**: ...\n"


class FakeContextService:
    def __init__(self):
        self.project_id = 0
        self.appended = []
        self.initialized = False

    def set_active(self, ctx):
        self.set_project(ctx.project_id)

    def set_project(self, project_id: int) -> None:
        self.project_id = project_id

    def project_concept(self) -> str:
        return "Project concept"

    def init_context(self) -> None:
        self.initialized = True

    def read_tech_stack(self) -> str:
        return "FastAPI + React"

    def story_index(self) -> dict:
        return {
            "1": {"title": "Sign In", "epic_title": "Auth"},
            "2": {"title": "Reset Password", "epic_title": "Auth"},
        }

    def write_context_file(self, filename: str, content: str) -> None:
        self.files = getattr(self, "files", {})
        self.files[filename] = content

    def read_context_file(self, filename: str) -> str:
        return getattr(self, "files", {}).get(filename, "")

    def append_gherkin(self, story_id, story_title, gherkin, *, epic_id, epic_title) -> None:
        self.appended.append({
            "story_id": story_id,
            "story_title": story_title,
            "gherkin": gherkin,
            "epic_id": epic_id,
            "epic_title": epic_title,
        })


def _service():
    ai = FakeAiService()
    context = FakeContextService()
    return Phase1Service(ai=ai, context=context), ai, context


def _ctx() -> RequestContext:
    return RequestContext(pm_token="token", project_id=42)


def test_generate_nl_stories_injects_project_concept():
    service, ai, _ = _service()

    draft, count = service.generate_nl_stories(
        _ctx(),
        epic_subject="Epic",
        epic_description="Description",
        hint="Keep small",
    )

    assert draft == "[S] Story A"
    assert count == 1
    assert ai.generated_args == ("Epic", "Description", "Keep small", "Project concept")


def test_generate_nl_stories_injects_figma_context():
    service, ai, context = _service()
    context.write_context_file("figma-context.md", "# Figma\nLogin screen, Dashboard")

    service.generate_nl_stories(_ctx(), epic_subject="Epic", epic_description="Desc")

    assert ai.figma_context == "# Figma\nLogin screen, Dashboard"


def test_generate_stories_from_figma_passes_frames_and_concept():
    service, ai, _ = _service()

    draft, count = service.generate_stories_from_figma(
        _ctx(),
        frames=[{"name": "Login", "description": ""}, {"name": "Dashboard", "description": ""}],
        flows=[{"from_name": "Login", "to_name": "Dashboard"}],
    )

    assert draft == "[S] Login Story"
    assert count == 2
    frames, flows, concept = ai.figma_args
    assert [f["name"] for f in frames] == ["Login", "Dashboard"]
    assert flows == [{"from_name": "Login", "to_name": "Dashboard"}]
    assert concept == "Project concept"


def test_generate_stories_from_figma_empty_frames_raises():
    service, _, _ = _service()
    with pytest.raises(Phase1ValidationError):
        service.generate_stories_from_figma(_ctx(), frames=[], flows=[])


def test_analyze_gaps_passes_concept_and_epics():
    service, ai, _ = _service()
    epics = [{"title": "Auth", "description": "login", "stories": ["Sign in"]}]

    report = service.analyze_gaps(_ctx(), existing_epics=epics, hint="mobile")

    assert report["assessment"] == "Decent coverage."
    assert report["gaps"][0]["title"] == "Notifications"
    assert ai.gap_args == ("Project concept", epics, "mobile")


def test_analyze_gaps_requires_concept():
    ai = FakeAiService()
    context = FakeContextService()
    context.project_concept = lambda: "   "  # type: ignore[assignment]
    service = Phase1Service(ai=ai, context=context)

    with pytest.raises(Phase1ValidationError, match="project concept"):
        service.analyze_gaps(_ctx(), existing_epics=[], hint="")


def test_generate_nl_stories_requires_subject():
    service, _, _ = _service()

    with pytest.raises(Phase1ValidationError, match="epic_subject"):
        service.generate_nl_stories(_ctx(), epic_subject=" ", epic_description="")


def test_cross_check_stories_returns_diff(monkeypatch):
    import src.ai_engine as ai_engine
    monkeypatch.setattr(ai_engine, "get_model", lambda: "claude-sonnet-4-6")
    service, ai, _ = _service()
    out = service.cross_check_stories(_ctx(), epic_subject="Auth", epic_description="login")
    assert out["primary_model"] == "claude-sonnet-4-6" and out["alt_model"] == "gpt-4o"
    assert out["primary_label"] and out["alt_label"]
    assert out["agreed"] == ["Valid login"]
    assert out["only_alt"][0]["title"] == "Locked account"
    assert ai.cross_args[1:] == ("claude-sonnet-4-6", "gpt-4o")


def test_cross_check_requires_second_provider(monkeypatch):
    import src.ai_engine as ai_engine
    monkeypatch.setattr(ai_engine, "get_model", lambda: "claude-sonnet-4-6")
    service, ai, _ = _service()
    ai.pick_alt_model = lambda model: None  # no second provider configured
    with pytest.raises(Phase1ValidationError, match="second AI provider"):
        service.cross_check_stories(_ctx(), epic_subject="Auth", epic_description="login")


def test_compile_gherkin_requires_draft():
    service, _, _ = _service()

    with pytest.raises(Phase1ValidationError, match="nl_draft"):
        service.compile_gherkin(nl_draft="")


def test_finalize_stories_writes_context_entries():
    service, _, context = _service()

    result = service.finalize_stories(
        _ctx(),
        epic_id=20,
        epic_subject="New Epic",
        stories=[{"id": 100, "title": "Story A", "gherkin": "Feature: Story A\n  Scenario: basic\n    Given a state\n    When action\n    Then outcome"}],
    )
    assert result["ok"] is True
    assert result["epic_id"] == 20
    assert result["story_ids"] == [100]
    assert context.initialized is True
    assert context.appended[0]["epic_id"] == 20
    assert context.appended[0]["epic_title"] == "New Epic"
    assert context.appended[0]["story_title"] == "Story A"


def test_generate_constraints_grounds_in_concept_stack_and_stories():
    service, ai, _ = _service()
    items, md = service.generate_constraints(_ctx())
    concept, tech_stack, all_stories = ai.constraints_args
    assert concept == "Project concept"
    assert tech_stack == "FastAPI + React"
    # All index stories passed as scope signal (titles + epic), not behaviour.
    assert {s["title"] for s in all_stories} == {"Sign In", "Reset Password"}
    assert all(set(s) == {"epic_title", "title"} for s in all_stories)
    assert items[0]["id"] == "NFR-1"
    assert md.startswith("# Constraints")


def test_save_and_get_constraints_roundtrip():
    service, _, context = _service()
    service.save_constraints(_ctx(), constraints_md="# NFRs\n\n- NFR-1")
    assert context.initialized is True
    assert context.files["constraints.md"] == "# NFRs\n\n- NFR-1"
    assert service.get_constraints(_ctx()) == "# NFRs\n\n- NFR-1"
