"""Tests for the migrated FastAPI Phase 1 backend service."""

import pytest

import backend.app.services.ai_grounding as ai_grounding
from backend.app.services.phase1_service import Phase1Service, Phase1ValidationError
from backend.app.services.request_context import RequestContext


class FakeAiService:
    def __init__(self):
        self.generated_args = None

    def suggest_epics(self, project_concept: str, hint: str) -> list[dict]:
        self.suggest_args = (project_concept, hint)
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
        images=None,
    ) -> tuple[str, int]:
        self.generated_args = (epic_subject, epic_description, hint, project_concept)
        self.figma_context = figma_context
        self.images = images
        return "[S] Story A", 1

    def generate_stories_from_figma(self, frames, flows, *, project_concept, instructions="", images=None):
        self.figma_args = (frames, flows, project_concept)
        self.images = images
        return "[S] Login Story", len(frames)

    def compile_gherkin(self, nl_draft: str, clarifications: list[dict] | None = None) -> list[dict]:
        self.compile_args = (nl_draft, clarifications)
        return [{"title": "Story A", "size": "S", "gherkin": "Feature: A\n\n  Scenario: s"}]

    def generate_clarifying_questions(
        self, epic_subject: str, epic_description: str, nl_draft: str, *, project_concept: str = "", hint: str = "",
    ) -> list[dict]:
        self.clarify_args = (epic_subject, epic_description, nl_draft, project_concept, hint)
        return [{"id": "Q1", "question": "What happens on timeout?", "rationale": "Draft doesn't say."}]

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

    def generate_constraints(self, project_concept, tech_stack, all_stories, *, existing_constraints=""):
        self.constraints_args = (project_concept, tech_stack, all_stories, existing_constraints)
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

    def read_agent_file(self, filename: str) -> str:
        return getattr(self, "agent_files", {}).get(filename, "")

    def append_gherkin(self, story_id, story_title, gherkin, *, epic_id, epic_title) -> None:
        self.appended.append({
            "story_id": story_id,
            "story_title": story_title,
            "gherkin": gherkin,
            "epic_id": epic_id,
            "epic_title": epic_title,
        })

    def save_epic_clarifications(self, epic_id, epic_title, qa_pairs) -> None:
        self.saved_clarifications = (epic_id, epic_title, qa_pairs)


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


def test_generate_nl_stories_renders_epic_images_when_token_and_file(monkeypatch):
    # #4: manual epic→stories grounds on the configured file's matching frames.
    service, ai, _ = _service()
    import backend.app.services.figma_fetch as ff
    from src import context_manager

    monkeypatch.setattr(context_manager, "get_instance_figma_file_key", lambda: "FILEK")
    captured = {}

    def _epic_imgs(token, file_key, subject, *a, **k):
        captured["args"] = (token, file_key, subject)
        return [{"node_id": "1:1", "name": "Login", "b64_png": "X", "media_type": "image/png"}]

    monkeypatch.setattr(ff, "fetch_epic_frame_images", _epic_imgs)
    service.generate_nl_stories(_ctx(), epic_subject="Login", epic_description="d", figma_token="tok")
    assert captured["args"] == ("tok", "FILEK", "Login")
    assert ai.images and ai.images[0]["node_id"] == "1:1"


def test_generate_nl_stories_no_images_without_token():
    # No token → text-only (figma_context) path, ai.images stays None.
    service, ai, _ = _service()
    service.generate_nl_stories(_ctx(), epic_subject="Login", epic_description="d")
    assert ai.images is None


def test_generate_nl_stories_no_images_when_no_file_configured(monkeypatch):
    service, ai, _ = _service()
    from src import context_manager
    monkeypatch.setattr(context_manager, "get_instance_figma_file_key", lambda: "")
    service.generate_nl_stories(_ctx(), epic_subject="Login", epic_description="d", figma_token="tok")
    assert ai.images is None


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


def test_generate_stories_from_figma_single_file_renders_with_file_key(monkeypatch):
    service, ai, _ = _service()
    captured = {}
    import backend.app.services.figma_fetch as ff

    def _single(token, file_key, frames):
        captured["single"] = (token, file_key)
        return [{"node_id": "1:1", "name": "Login", "b64_png": "X", "media_type": "image/png"}]

    monkeypatch.setattr(ff, "fetch_frame_images", _single)
    service.generate_stories_from_figma(
        _ctx(),
        frames=[{"name": "Login", "node_id": "1:1"}],
        flows=[],
        figma_token="tok",
        file_key="FILEK",
    )
    assert captured["single"] == ("tok", "FILEK")
    assert ai.images and ai.images[0]["node_id"] == "1:1"


def test_generate_stories_from_figma_multi_file_union_renders_per_file(monkeypatch):
    service, ai, _ = _service()
    captured = {}
    import backend.app.services.figma_fetch as ff

    def _multi(token, frames):
        captured["multi"] = (token, [f["node_id"] for f in frames])
        return [{"node_id": "FILEA:1:1", "name": "Home", "b64_png": "X", "media_type": "image/png"}]

    monkeypatch.setattr(ff, "fetch_frame_images_multi", _multi)
    # no file_key but a token → multi-file union path (frames are file-namespaced)
    service.generate_stories_from_figma(
        _ctx(),
        frames=[{"name": "Home", "node_id": "FILEA:1:1"}, {"name": "Cfg", "node_id": "FILEB:2:2"}],
        flows=[],
        figma_token="tok",
        file_key="",
    )
    assert captured["multi"] == ("tok", ["FILEA:1:1", "FILEB:2:2"])
    assert ai.images and ai.images[0]["node_id"] == "FILEA:1:1"


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


def test_compile_gherkin_forwards_clarifications():
    service, ai, _ = _service()

    service.compile_gherkin(nl_draft="Draft", clarifications=[{"question": "Q", "answer": "A"}])

    assert ai.compile_args == ("Draft", [{"question": "Q", "answer": "A"}])


def test_generate_clarifying_questions_requires_draft():
    service, _, _ = _service()

    with pytest.raises(Phase1ValidationError, match="nl_draft"):
        service.generate_clarifying_questions(_ctx(), epic_subject="Epic", nl_draft="")


def test_generate_clarifying_questions_forwards_concept():
    service, ai, _ = _service()

    questions = service.generate_clarifying_questions(
        _ctx(), epic_subject="Epic", epic_description="Desc", nl_draft="Draft", hint="mobile",
    )

    assert questions == [{"id": "Q1", "question": "What happens on timeout?", "rationale": "Draft doesn't say."}]
    assert ai.clarify_args == ("Epic", "Desc", "Draft", "Project concept", "mobile")


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
    assert not hasattr(context, "saved_clarifications")


def test_finalize_stories_saves_clarifications_when_given():
    service, _, context = _service()

    service.finalize_stories(
        _ctx(),
        epic_id=20,
        epic_subject="New Epic",
        stories=[{"id": 100, "title": "Story A", "gherkin": "Feature: Story A\n  Scenario: basic\n    Given a state\n    When action\n    Then outcome"}],
        clarifications=[{"question": "Q", "answer": "A"}],
    )

    assert context.saved_clarifications == (20, "New Epic", [{"question": "Q", "answer": "A"}])


def test_finalize_stories_skips_clarifications_when_empty():
    service, _, context = _service()

    service.finalize_stories(
        _ctx(),
        epic_id=20,
        epic_subject="New Epic",
        stories=[{"id": 100, "title": "Story A", "gherkin": "Feature: Story A\n  Scenario: basic\n    Given a state\n    When action\n    Then outcome"}],
        clarifications=[],
    )

    assert not hasattr(context, "saved_clarifications")


def test_generate_constraints_grounds_in_concept_stack_and_stories():
    service, ai, context = _service()
    context.files = {"constraints.md": "- **NFR-1** _(security)_: The system shall preserve existing controls.\n"}
    items, md = service.generate_constraints(_ctx())
    concept, tech_stack, all_stories, existing_constraints = ai.constraints_args
    assert concept == "Project concept"
    assert tech_stack == "FastAPI + React"
    assert "preserve existing controls" in existing_constraints
    # All index stories passed as scope signal (titles + epic), not behaviour.
    assert {s["title"] for s in all_stories} == {"Sign In", "Reset Password"}
    assert all(set(s) == {"epic_title", "title"} for s in all_stories)
    assert items[0]["id"] == "NFR-1"
    assert md.startswith("# Constraints")


def test_suggest_epics_appends_selected_extra_context_file():
    service, ai, context = _service()
    context.files = {"decisions.md": "# Decisions\n\n- Prefer OAuth."}

    service.suggest_epics(_ctx(), hint="", extra_context_files=["decisions.md"])

    concept, _hint = ai.suggest_args
    assert "## Additional Grounding Files" in concept
    assert "### decisions.md" in concept
    assert "Prefer OAuth" in concept


def test_suggest_epics_appends_selected_agent_file(monkeypatch, tmp_path):
    monkeypatch.setattr(ai_grounding, "REPO_ROOT", tmp_path)
    (tmp_path / "AGENTS.md").write_text("# Agents\n\n- Keep commits user-authored.", encoding="utf-8")
    service, ai, _context = _service()

    service.suggest_epics(_ctx(), hint="", extra_context_files=["AGENTS.md"])

    concept, _hint = ai.suggest_args
    assert "## Additional Grounding Files" in concept
    assert "### AGENTS.md" in concept
    assert "Keep commits user-authored" in concept


def test_save_and_get_constraints_roundtrip():
    service, _, context = _service()
    service.save_constraints(_ctx(), constraints_md="# NFRs\n\n- NFR-1")
    assert context.initialized is True
    assert context.files["constraints.md"] == "# NFRs\n\n- NFR-1"
    assert service.get_constraints(_ctx()) == "# NFRs\n\n- NFR-1"
