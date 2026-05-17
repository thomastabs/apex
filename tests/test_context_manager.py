"""Unit tests for context_manager.py — all storage and index operations."""

import json
import pytest


# ---------------------------------------------------------------------------
# init_context
# ---------------------------------------------------------------------------

class TestInitContext:
    def test_creates_all_spec_files(self, ctx):
        ctx.init_context()
        assert ctx.MEMORY_BANK_FILE.exists()
        assert ctx.FUNCTIONAL_SPEC_FILE.exists()
        assert ctx.TECHNICAL_SPEC_FILE.exists()
        assert ctx.VACCINES_FILE.exists()
        assert ctx.DESIGN_BUNDLE_FILE.exists()

    def test_creates_story_index(self, ctx):
        ctx.init_context()
        assert ctx.STORY_INDEX_FILE.exists()

    def test_idempotent_does_not_overwrite_existing_files(self, ctx):
        ctx.init_context()
        ctx.MEMORY_BANK_FILE.write_text("custom content", encoding="utf-8")
        ctx.init_context()
        assert ctx.MEMORY_BANK_FILE.read_text(encoding="utf-8") == "custom content"

    def test_context_initialized_flag_set(self, ctx):
        assert ctx._context_initialized is False
        ctx.init_context()
        assert ctx._context_initialized is True

    def test_second_call_skips_filesystem(self, ctx, monkeypatch):
        ctx.init_context()
        # Patch mkdir to fail — second call must not reach it
        calls = []
        original_mkdir = ctx.CONTEXT_DIR.__class__.mkdir
        monkeypatch.setattr(ctx.CONTEXT_DIR.__class__, "mkdir",
                            lambda self, **kw: calls.append(1))
        ctx.init_context()
        assert calls == [], "init_context() should skip all filesystem work on second call"


# ---------------------------------------------------------------------------
# reset_context
# ---------------------------------------------------------------------------

class TestResetContext:
    def test_resets_files_to_templates(self, ctx):
        ctx.init_context()
        ctx.MEMORY_BANK_FILE.write_text("custom", encoding="utf-8")
        ctx.reset_context()
        content = ctx.MEMORY_BANK_FILE.read_text(encoding="utf-8")
        assert "Memory Bank" in content
        assert "custom" not in content

    def test_clears_story_index(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(1, title="My Story")
        ctx.reset_context()
        assert ctx.get_story_index() == {}

    def test_resets_initialized_flag(self, ctx):
        ctx.init_context()
        assert ctx._context_initialized is True
        ctx.reset_context()
        assert ctx._context_initialized is False

    def test_clears_draft(self, ctx):
        ctx.init_context()
        ctx.save_draft({"epic_subject": "Test"})
        ctx.reset_context()
        assert ctx.load_draft() is None


# ---------------------------------------------------------------------------
# append_gherkin
# ---------------------------------------------------------------------------

class TestAppendGherkin:
    GHERKIN = (
        "Feature: User Login\n\n"
        "  Scenario: Successful login\n"
        "    Given the user is on the login page\n"
        "    When they submit valid credentials\n"
        "    Then they see the dashboard\n"
    )

    def test_flat_format_appended(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(101, "User Login", self.GHERKIN)
        content = ctx.FUNCTIONAL_SPEC_FILE.read_text(encoding="utf-8")
        assert "## Story 101: User Login" in content
        assert "Feature: User Login" in content

    def test_epic_format_nested_under_epic(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(101, "User Login", self.GHERKIN,
                           epic_id=5, epic_title="Authentication")
        content = ctx.FUNCTIONAL_SPEC_FILE.read_text(encoding="utf-8")
        assert "## Epic 5: Authentication" in content
        assert "### Story 101: User Login" in content

    def test_replaces_existing_entry(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(101, "User Login", "Feature: Old\n\n  Scenario: Old\n    Given x\n    When y\n    Then z\n")
        ctx.append_gherkin(101, "User Login", self.GHERKIN)
        content = ctx.FUNCTIONAL_SPEC_FILE.read_text(encoding="utf-8")
        assert content.count("## Story 101") == 1
        assert "Feature: User Login" in content
        assert "Feature: Old" not in content

    def test_updates_story_index(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(101, "User Login", self.GHERKIN)
        index = ctx.get_story_index()
        assert "101" in index
        assert index["101"]["has_gherkin"] is True

    def test_status_set_to_gherkin_locked(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(101, "User Login", self.GHERKIN)
        assert ctx.get_story_index()["101"]["phase_status"] == "gherkin_locked"

    def test_multiple_stories_both_present(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(101, "Story A", self.GHERKIN)
        ctx.append_gherkin(102, "Story B", self.GHERKIN)
        content = ctx.FUNCTIONAL_SPEC_FILE.read_text(encoding="utf-8")
        assert "Story 101" in content
        assert "Story 102" in content


# ---------------------------------------------------------------------------
# append_technical_spec
# ---------------------------------------------------------------------------

class TestAppendTechnicalSpec:
    SPEC = "openapi: '3.0'\npaths:\n  /login:\n    post:\n      summary: Login\n"

    def test_spec_written(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(101, "Story A",
                           "Feature: A\n\n  Scenario: s\n    Given x\n    When y\n    Then z\n")
        ctx.append_technical_spec(101, self.SPEC)
        content = ctx.TECHNICAL_SPEC_FILE.read_text(encoding="utf-8")
        assert "### Technical Spec — Story 101" in content
        assert "openapi" in content

    def test_updates_has_tech_spec(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(101, "Story A",
                           "Feature: A\n\n  Scenario: s\n    Given x\n    When y\n    Then z\n")
        ctx.append_technical_spec(101, self.SPEC)
        assert ctx.get_story_index()["101"]["has_tech_spec"] is True

    def test_status_advances_to_design_locked(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(101, "Story A",
                           "Feature: A\n\n  Scenario: s\n    Given x\n    When y\n    Then z\n")
        ctx.append_technical_spec(101, self.SPEC)
        assert ctx.get_story_index()["101"]["phase_status"] == "design_locked"


# ---------------------------------------------------------------------------
# get_story_gherkin
# ---------------------------------------------------------------------------

class TestGetStoryGherkin:
    GHERKIN = "Feature: Login\n\n  Scenario: Log in\n    Given x\n    When y\n    Then z\n"

    def test_returns_gherkin_for_known_story(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(101, "Login", self.GHERKIN)
        result = ctx.get_story_gherkin(101)
        assert "Feature: Login" in result

    def test_returns_empty_string_for_unknown_story(self, ctx):
        ctx.init_context()
        assert ctx.get_story_gherkin(999) == ""

    def test_returns_correct_story_among_multiple(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(101, "Login",  self.GHERKIN)
        ctx.append_gherkin(102, "Logout",
                           "Feature: Logout\n\n  Scenario: s\n    Given x\n    When y\n    Then z\n")
        result = ctx.get_story_gherkin(102)
        assert "Feature: Logout" in result
        assert "Feature: Login" not in result


# ---------------------------------------------------------------------------
# get_project_concept
# ---------------------------------------------------------------------------

class TestGetProjectConcept:
    def test_returns_empty_when_placeholder_not_filled(self, ctx):
        ctx.init_context()
        assert ctx.get_project_concept() == ""

    def test_returns_content_when_filled(self, ctx):
        ctx.init_context()
        mb = ctx.MEMORY_BANK_FILE.read_text(encoding="utf-8")
        filled = mb.replace(
            "<!-- Describe the project's purpose, target users, and core value proposition. -->",
            "A fishing mobile game for casual players."
        )
        ctx.MEMORY_BANK_FILE.write_text(filled, encoding="utf-8")
        result = ctx.get_project_concept()
        assert "fishing mobile game" in result

    def test_stops_at_next_section(self, ctx):
        ctx.init_context()
        mb = ctx.MEMORY_BANK_FILE.read_text(encoding="utf-8")
        filled = mb.replace(
            "<!-- Describe the project's purpose, target users, and core value proposition. -->",
            "A fishing game."
        )
        ctx.MEMORY_BANK_FILE.write_text(filled, encoding="utf-8")
        result = ctx.get_project_concept()
        assert "Tech Stack" not in result


# ---------------------------------------------------------------------------
# upsert_story_index
# ---------------------------------------------------------------------------

class TestUpsertStoryIndex:
    def test_creates_entry_with_defaults(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(42, title="My Story")
        entry = ctx.get_story_index()["42"]
        assert entry["title"] == "My Story"
        assert entry["has_gherkin"] is False

    def test_updates_existing_entry(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(42, title="My Story")
        ctx.upsert_story_index(42, has_gherkin=True)
        entry = ctx.get_story_index()["42"]
        assert entry["title"] == "My Story"
        assert entry["has_gherkin"] is True

    def test_story_id_always_preserved(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(42, title="My Story")
        assert ctx.get_story_index()["42"]["story_id"] == 42

    def test_persisted_to_disk(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(42, title="Persisted")
        raw = json.loads(ctx.STORY_INDEX_FILE.read_text(encoding="utf-8"))
        assert "42" in raw


# ---------------------------------------------------------------------------
# rebuild_story_index
# ---------------------------------------------------------------------------

class TestRebuildStoryIndex:
    GHERKIN = "Feature: X\n\n  Scenario: s\n    Given x\n    When y\n    Then z\n"

    def test_flat_story_indexed(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(10, "Story Ten", self.GHERKIN)
        index = ctx.rebuild_story_index()
        assert "10" in index
        assert index["10"]["has_gherkin"] is True

    def test_nested_story_indexed_with_epic(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(10, "Story Ten", self.GHERKIN, epic_id=3, epic_title="Epic Three")
        index = ctx.rebuild_story_index()
        assert index["10"]["epic_id"] == 3

    def test_has_tech_spec_recovered(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(10, "Story Ten", self.GHERKIN)
        ctx.append_technical_spec(10, "openapi: '3.0'\n")
        ctx._story_index_cache = None  # force disk re-read
        index = ctx.rebuild_story_index()
        assert index["10"]["has_tech_spec"] is True
        assert index["10"]["phase_status"] == "design_locked"

    def test_has_bdd_recovered(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(10, "Story Ten", self.GHERKIN)
        bdd_path = ctx.CONTEXT_DIR / "bdd_story_10.feature"
        bdd_path.write_text("Feature: BDD\n\n  Scenario: test\n    Given x\n    When y\n    Then z\n",
                            encoding="utf-8")
        index = ctx.rebuild_story_index()
        assert index["10"]["has_bdd"] is True
        assert index["10"]["phase_status"] == "qa"

    def test_has_proposal_recovered(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(10, "Story Ten", self.GHERKIN)
        proposal_path = ctx.CONTEXT_DIR / "proposal_story_10_task_1.md"
        proposal_path.write_text("## Proposal\n\nContent here.", encoding="utf-8")
        index = ctx.rebuild_story_index()
        assert index["10"]["has_proposal"] is True
        assert index["10"]["phase_status"] == "implementation"

    def test_empty_functional_spec_gives_empty_index(self, ctx):
        ctx.init_context()
        index = ctx.rebuild_story_index()
        assert index == {}


# ---------------------------------------------------------------------------
# save_proposal
# ---------------------------------------------------------------------------

class TestSaveProposal:
    def test_file_written_with_correct_name(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(10, "Story Ten",
                           "Feature: X\n\n  Scenario: s\n    Given x\n    When y\n    Then z\n")
        path = ctx.save_proposal(story_id=10, task_id=1, proposal="# Plan\n\nDo X.")
        assert path.name == "proposal_story_10_task_1.md"
        assert path.read_text(encoding="utf-8") == "# Plan\n\nDo X."

    def test_updates_has_proposal_in_index(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(10, "Story Ten",
                           "Feature: X\n\n  Scenario: s\n    Given x\n    When y\n    Then z\n")
        ctx.save_proposal(story_id=10, task_id=1, proposal="proposal")
        assert ctx.get_story_index()["10"]["has_proposal"] is True


# ---------------------------------------------------------------------------
# Draft persistence
# ---------------------------------------------------------------------------

class TestDraftPersistence:
    def test_save_and_load_round_trip(self, ctx):
        ctx.CONTEXT_DIR.mkdir(parents=True, exist_ok=True)
        data = {"epic_subject": "Auth", "nl_draft": "As a user...", "compiled_stories": None}
        ctx.save_draft(data)
        loaded = ctx.load_draft()
        assert loaded == data

    def test_load_returns_none_when_no_draft(self, ctx):
        ctx.CONTEXT_DIR.mkdir(parents=True, exist_ok=True)
        assert ctx.load_draft() is None

    def test_clear_draft_removes_file(self, ctx):
        ctx.CONTEXT_DIR.mkdir(parents=True, exist_ok=True)
        ctx.save_draft({"key": "value"})
        ctx.clear_draft()
        assert ctx.load_draft() is None

    def test_load_returns_none_on_corrupt_file(self, ctx):
        ctx.CONTEXT_DIR.mkdir(parents=True, exist_ok=True)
        ctx.DRAFT_FILE.write_text("{broken json", encoding="utf-8")
        assert ctx.load_draft() is None


# ---------------------------------------------------------------------------
# get_context_for_phase
# ---------------------------------------------------------------------------

class TestGetContextForPhase:
    GHERKIN = "Feature: X\n\n  Scenario: s\n    Given x\n    When y\n    Then z\n"

    def _setup(self, ctx):
        ctx.init_context()
        mb = ctx.MEMORY_BANK_FILE.read_text(encoding="utf-8")
        ctx.MEMORY_BANK_FILE.write_text(
            mb.replace(
                "<!-- Describe the project's purpose, target users, and core value proposition. -->",
                "Fishing game."
            ),
            encoding="utf-8",
        )
        ctx.append_gherkin(1, "Story One", self.GHERKIN)
        ctx.append_technical_spec(1, "openapi: '3.0'\n")

    def test_phase_1_returns_memory_bank(self, ctx):
        self._setup(ctx)
        result = ctx.get_context_for_phase(1)
        assert "Memory Bank" in result
        assert "Feature: X" not in result

    def test_phase_2_includes_gherkin(self, ctx):
        self._setup(ctx)
        result = ctx.get_context_for_phase(2, story_id=1)
        assert "Feature: X" in result

    def test_phase_3_includes_gherkin_and_tech(self, ctx):
        self._setup(ctx)
        result = ctx.get_context_for_phase(3, story_id=1)
        assert "Feature: X" in result
        assert "openapi" in result

    def test_phase_4_returns_only_gherkin(self, ctx):
        self._setup(ctx)
        result = ctx.get_context_for_phase(4, story_id=1)
        assert "Feature: X" in result
        assert "Memory Bank" not in result

    def test_phase_5_includes_tech_not_gherkin(self, ctx):
        self._setup(ctx)
        result = ctx.get_context_for_phase(5, story_id=1)
        assert "openapi" in result
        assert "Feature: X" not in result

    def test_phase_6_returns_empty_string(self, ctx):
        self._setup(ctx)
        result = ctx.get_context_for_phase(6, story_id=1)
        assert result == ""


# ---------------------------------------------------------------------------
# append_vaccine_record
# ---------------------------------------------------------------------------

class TestAppendVaccineRecord:
    def test_record_written_to_vaccines_file(self, ctx):
        ctx.init_context()
        ctx.append_vaccine_record(7, "Null pointer in auth middleware", "Added None check")
        content = ctx.VACCINES_FILE.read_text(encoding="utf-8")
        assert "## Vaccine #7" in content
        assert "Null pointer" in content
        assert "Added None check" in content

    def test_multiple_records_all_present(self, ctx):
        ctx.init_context()
        ctx.append_vaccine_record(1, "Bug A", "Fix A")
        ctx.append_vaccine_record(2, "Bug B", "Fix B")
        content = ctx.VACCINES_FILE.read_text(encoding="utf-8")
        assert "Vaccine #1" in content
        assert "Vaccine #2" in content


# ---------------------------------------------------------------------------
# get_context_sizes
# ---------------------------------------------------------------------------

class TestGetContextSizes:
    def test_returns_dict_with_all_files(self, ctx):
        ctx.init_context()
        sizes = ctx.get_context_sizes()
        assert set(sizes.keys()) == {
            "memory-bank.md", "functional-spec.md", "technical-spec.md", "vaccines.md",
            "design-bundle.md",
        }

    def test_sizes_are_non_negative_ints(self, ctx):
        ctx.init_context()
        for size in ctx.get_context_sizes().values():
            assert isinstance(size, int)
            assert size >= 0


# ---------------------------------------------------------------------------
# append_epic_design_bundle / get_epic_design_bundle
# ---------------------------------------------------------------------------

class TestDesignBundle:
    def test_round_trip(self, ctx):
        ctx.init_context()
        ctx.append_epic_design_bundle(
            epic_id=42,
            epic_title="Payments",
            wireframes="+-+\n|X|\n+-+",
            user_flow="flowchart TD\n  A-->B",
            component_tree="App\n  Form",
            tech_spec="openapi: '3.0'\npaths: {}",
        )
        bundle = ctx.get_epic_design_bundle(42)
        assert bundle is not None
        assert bundle["wireframes"] == "+-+\n|X|\n+-+"
        assert bundle["user_flow"] == "flowchart TD\n  A-->B"
        assert bundle["component_tree"] == "App\n  Form"
        assert bundle["tech_spec"] == "openapi: '3.0'\npaths: {}"

    def test_returns_none_when_no_bundle(self, ctx):
        ctx.init_context()
        assert ctx.get_epic_design_bundle(999) is None

    def test_replaces_existing_bundle(self, ctx):
        ctx.init_context()
        ctx.append_epic_design_bundle(5, "E", "old wf", "old uf", "old ct", "old ts")
        ctx.append_epic_design_bundle(5, "E", "new wf", "new uf", "new ct", "new ts")
        bundle = ctx.get_epic_design_bundle(5)
        assert bundle["wireframes"] == "new wf"
        assert "old wf" not in ctx.DESIGN_BUNDLE_FILE.read_text(encoding="utf-8")

    def test_multiple_epics_isolated(self, ctx):
        ctx.init_context()
        ctx.append_epic_design_bundle(1, "E1", "wf1", "uf1", "ct1", "ts1")
        ctx.append_epic_design_bundle(2, "E2", "wf2", "uf2", "ct2", "ts2")
        b1 = ctx.get_epic_design_bundle(1)
        b2 = ctx.get_epic_design_bundle(2)
        assert b1["wireframes"] == "wf1"
        assert b2["wireframes"] == "wf2"

    def test_removed_on_epic_delete(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(10, epic_id=3, title="S", phase_status="gherkin_locked")
        ctx.append_gherkin(10, "S", "Feature: S\n", epic_id=3, epic_title="E3")
        ctx.append_epic_design_bundle(3, "E3", "wf", "uf", "ct", "ts")
        ctx.remove_epic_from_story_index(3)
        assert ctx.get_epic_design_bundle(3) is None

    def test_reset_on_reset_context(self, ctx):
        ctx.init_context()
        ctx.append_epic_design_bundle(7, "E7", "wf", "uf", "ct", "ts")
        ctx.reset_context()
        assert ctx.DESIGN_BUNDLE_FILE.exists()
        content = ctx.DESIGN_BUNDLE_FILE.read_text(encoding="utf-8")
        assert "# Design Bundles" in content
        assert "Epic 7" not in content


# ---------------------------------------------------------------------------
# get_other_epics_design_context
# ---------------------------------------------------------------------------

class TestGetOtherEpicsDesignContext:
    def test_returns_empty_when_no_bundle_file(self, ctx):
        ctx.init_context()
        assert ctx.get_other_epics_design_context(1) == ""

    def test_returns_empty_when_only_current_epic(self, ctx):
        ctx.init_context()
        ctx.append_epic_design_bundle(5, "E5", "wf", "uf", "ct", "ts")
        assert ctx.get_other_epics_design_context(5) == ""

    def test_excludes_current_epic(self, ctx):
        ctx.init_context()
        ctx.append_epic_design_bundle(1, "Auth", "wf1", "uf1", "ct1", "ts1")
        ctx.append_epic_design_bundle(2, "Orders", "wf2", "uf2", "ct2", "ts2")
        result = ctx.get_other_epics_design_context(exclude_epic_id=2)
        assert "Auth" in result
        assert "ct1" in result
        assert "wf1" in result
        assert "uf1" in result
        assert "Orders" not in result
        assert "ct2" not in result

    def test_contains_all_three_sections(self, ctx):
        ctx.init_context()
        ctx.append_epic_design_bundle(10, "Dashboard", "wf10", "uf10", "ct10", "ts10")
        result = ctx.get_other_epics_design_context(exclude_epic_id=99)
        assert "Existing Component Architecture" in result
        assert "Existing Wireframe Patterns" in result
        assert "Existing User Flows" in result

    def test_multiple_epics_all_appear(self, ctx):
        ctx.init_context()
        ctx.append_epic_design_bundle(1, "A", "wfA", "ufA", "ctA", "tsA")
        ctx.append_epic_design_bundle(2, "B", "wfB", "ufB", "ctB", "tsB")
        ctx.append_epic_design_bundle(3, "C", "wfC", "ufC", "ctC", "tsC")
        result = ctx.get_other_epics_design_context(exclude_epic_id=3)
        assert "ctA" in result
        assert "ctB" in result
        assert "ctC" not in result


# ---------------------------------------------------------------------------
# _build_context_dir
# ---------------------------------------------------------------------------

class TestBuildContextDir:
    def test_nonzero_id_returns_project_subdir(self):
        from src import context_manager as cm
        assert cm._build_context_dir(42) == cm._BASE_CONTEXTSPEC / "42"

    def test_zero_id_returns_default_subdir(self):
        from src import context_manager as cm
        assert cm._build_context_dir(0) == cm._BASE_CONTEXTSPEC / "default"

    def test_different_ids_produce_different_dirs(self):
        from src import context_manager as cm
        assert cm._build_context_dir(1) != cm._build_context_dir(2)


# ---------------------------------------------------------------------------
# set_active_project
# ---------------------------------------------------------------------------

_PATH_GLOBALS = (
    "CONTEXT_DIR", "MEMORY_BANK_FILE", "FUNCTIONAL_SPEC_FILE",
    "TECHNICAL_SPEC_FILE", "VACCINES_FILE", "STORY_INDEX_FILE",
    "DRAFT_FILE", "DESIGN_DRAFT_FILE", "SESSION_FILE", "DESIGN_BUNDLE_FILE",
    "_context_initialized", "_story_index_cache",
)


def _snapshot(monkeypatch, cm) -> None:
    """Register all path globals and caches for automatic restore after the test."""
    for attr in _PATH_GLOBALS:
        monkeypatch.setattr(cm, attr, getattr(cm, attr))


class TestSetActiveProject:
    def test_updates_context_dir(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        _snapshot(monkeypatch, cm)
        cm.set_active_project(99)
        assert cm.CONTEXT_DIR == tmp_path / "99"

    def test_updates_all_file_paths(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        _snapshot(monkeypatch, cm)
        cm.set_active_project(77)
        expected = tmp_path / "77"
        assert cm.MEMORY_BANK_FILE     == expected / "memory-bank.md"
        assert cm.FUNCTIONAL_SPEC_FILE == expected / "functional-spec.md"
        assert cm.TECHNICAL_SPEC_FILE  == expected / "technical-spec.md"
        assert cm.VACCINES_FILE        == expected / "vaccines.md"
        assert cm.STORY_INDEX_FILE     == expected / "story-index.json"
        assert cm.DRAFT_FILE           == expected / ".apex-draft.json"
        assert cm.DESIGN_DRAFT_FILE    == expected / ".apex-design-draft.json"
        assert cm.SESSION_FILE         == expected / ".apex-session.json"
        assert cm.DESIGN_BUNDLE_FILE   == expected / "design-bundle.md"

    def test_resets_context_initialized(self, monkeypatch):
        from src import context_manager as cm
        _snapshot(monkeypatch, cm)
        monkeypatch.setattr(cm, "_context_initialized", True)
        cm.set_active_project(1)
        assert cm._context_initialized is False

    def test_resets_story_index_cache(self, monkeypatch):
        from src import context_manager as cm
        _snapshot(monkeypatch, cm)
        monkeypatch.setattr(cm, "_story_index_cache", {"1": {"story_id": 1}})
        cm.set_active_project(1)
        assert cm._story_index_cache is None

    def test_zero_project_id_uses_default_dir(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        _snapshot(monkeypatch, cm)
        cm.set_active_project(0)
        assert cm.CONTEXT_DIR == tmp_path / "default"

    def test_switching_between_projects_changes_dir(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        _snapshot(monkeypatch, cm)
        cm.set_active_project(10)
        dir_a = cm.CONTEXT_DIR
        cm.set_active_project(20)
        dir_b = cm.CONTEXT_DIR
        assert dir_a != dir_b
        assert dir_a == tmp_path / "10"
        assert dir_b == tmp_path / "20"


# ---------------------------------------------------------------------------
# reset_cache
# ---------------------------------------------------------------------------

class TestResetCache:
    def test_resets_initialized_flag(self, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_context_initialized", True)
        cm.reset_cache()
        assert cm._context_initialized is False

    def test_resets_story_index_cache(self, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_story_index_cache", {"42": {}})
        cm.reset_cache()
        assert cm._story_index_cache is None

    def test_does_not_change_context_dir(self, monkeypatch):
        from src import context_manager as cm
        from pathlib import Path
        original = cm.CONTEXT_DIR
        cm.reset_cache()
        assert cm.CONTEXT_DIR == original


# ---------------------------------------------------------------------------
# Project isolation (integration)
# ---------------------------------------------------------------------------

class TestProjectIsolation:
    """Data written under one project ID must not be visible under another."""

    GHERKIN = "Feature: X\n\n  Scenario: s\n    Given x\n    When y\n    Then z\n"

    def test_gherkin_isolated_between_projects(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        _snapshot(monkeypatch, cm)

        cm.set_active_project(1)
        cm.init_context()
        cm.append_gherkin(10, "Story A", self.GHERKIN)
        assert "Feature: X" in cm.get_story_gherkin(10)

        cm.set_active_project(2)
        cm.init_context()
        assert cm.get_story_gherkin(10) == ""

        # switch back — original data still present
        cm.set_active_project(1)
        assert "Feature: X" in cm.get_story_gherkin(10)

    def test_story_index_isolated_between_projects(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        _snapshot(monkeypatch, cm)

        cm.set_active_project(10)
        cm.init_context()
        cm.upsert_story_index(5, title="Project 10 Story")

        cm.set_active_project(20)
        cm.init_context()
        assert "5" not in cm.get_story_index()

    def test_separate_subdirectories_created_on_disk(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        _snapshot(monkeypatch, cm)

        cm.set_active_project(100)
        cm.init_context()
        cm.set_active_project(200)
        cm.init_context()

        assert (tmp_path / "100").is_dir()
        assert (tmp_path / "200").is_dir()

    def test_memory_bank_content_isolated(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        _snapshot(monkeypatch, cm)

        cm.set_active_project(1)
        cm.init_context()
        cm.MEMORY_BANK_FILE.write_text("# Memory Bank\n\n## Project Concept\n\nProject One.", encoding="utf-8")

        cm.set_active_project(2)
        cm.init_context()
        assert "Project One" not in cm.MEMORY_BANK_FILE.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# is_project_selected
# ---------------------------------------------------------------------------

class TestIsProjectSelected:
    def test_false_when_context_dir_is_default(self, monkeypatch):
        from src import context_manager as cm
        from pathlib import Path
        monkeypatch.setattr(cm, "CONTEXT_DIR", Path("contextspec/default"))
        assert cm.is_project_selected() is False

    def test_true_when_context_dir_has_project_id(self, monkeypatch):
        from src import context_manager as cm
        from pathlib import Path
        monkeypatch.setattr(cm, "CONTEXT_DIR", Path("contextspec/1786966"))
        assert cm.is_project_selected() is True


# ---------------------------------------------------------------------------
# save_config / load_config
# ---------------------------------------------------------------------------

class TestConfig:
    def test_save_and_load_round_trip(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        monkeypatch.setattr(cm, "_CONFIG_FILE", tmp_path / ".apex-config.json")
        cm.save_config(1786966)
        assert cm.load_config()["project_id"] == 1786966

    def test_save_config_strips_stale_auth_token(self, tmp_path, monkeypatch):
        """save_config() removes any previously persisted auth_token."""
        import json
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        cfg_file = tmp_path / ".apex-config.json"
        monkeypatch.setattr(cm, "_CONFIG_FILE", cfg_file)
        # Simulate a stale file that has an auth_token from an older version.
        cfg_file.write_text(json.dumps({"project_id": 1, "auth_token": "stale-tok"}))
        cm.save_config(42)
        cfg = cm.load_config()
        assert cfg["project_id"] == 42
        assert "auth_token" not in cfg

    def test_load_returns_empty_when_file_missing(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_CONFIG_FILE", tmp_path / ".apex-config.json")
        assert cm.load_config() == {}

    def test_load_returns_empty_on_corrupt_file(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        f = tmp_path / ".apex-config.json"
        f.write_text("{broken json", encoding="utf-8")
        monkeypatch.setattr(cm, "_CONFIG_FILE", f)
        assert cm.load_config() == {}

    def test_set_active_project_saves_config(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        monkeypatch.setattr(cm, "_CONFIG_FILE", tmp_path / ".apex-config.json")
        _snapshot(monkeypatch, cm)
        cm.set_active_project(42)
        assert cm.load_config().get("project_id") == 42


# ---------------------------------------------------------------------------
# init_context no-op when no project selected
# ---------------------------------------------------------------------------

class TestInitContextNoProject:
    def test_does_not_create_files_when_no_project(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        _snapshot(monkeypatch, cm)
        cm.set_active_project(0)  # puts CONTEXT_DIR at tmp_path/default
        cm.init_context()
        assert not (tmp_path / "default").exists()

    def test_readers_return_empty_when_no_project(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        _snapshot(monkeypatch, cm)
        cm.set_active_project(0)
        assert cm.get_memory_bank() == ""
        assert cm.get_vaccines() == ""
        assert cm.get_story_gherkin(1) == ""
        assert cm.get_story_technical_spec(1) == ""
        assert cm.get_story_index() == {}
