"""Unit tests for context_manager.py — all storage and index operations."""

import json


# ---------------------------------------------------------------------------
# init_context
# ---------------------------------------------------------------------------

class TestInitContext:
    def test_creates_all_spec_files(self, ctx):
        ctx.init_context()
        assert ctx.PROJECT_CONCEPT_FILE.exists()
        assert ctx.TECH_STACK_FILE.exists()
        assert ctx.FUNCTIONAL_SPEC_FILE.exists()
        assert ctx.TECHNICAL_SPEC_FILE.exists()
        assert ctx.VACCINES_FILE.exists()
        assert ctx.DESIGN_BUNDLE_FILE.exists()

    def test_creates_story_index(self, ctx):
        ctx.init_context()
        assert ctx.STORY_INDEX_FILE.exists()

    def test_idempotent_does_not_overwrite_existing_files(self, ctx):
        ctx.init_context()
        ctx.PROJECT_CONCEPT_FILE.write_text("custom content", encoding="utf-8")
        ctx.init_context()
        assert ctx.PROJECT_CONCEPT_FILE.read_text(encoding="utf-8") == "custom content"

    def test_context_initialized_flag_set(self, ctx):
        assert ctx._context_initialized is False
        ctx.init_context()
        assert ctx._context_initialized is True

    def test_second_call_skips_filesystem(self, ctx, monkeypatch):
        ctx.init_context()
        # Patch mkdir to fail — second call must not reach it
        calls = []
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
        ctx.PROJECT_CONCEPT_FILE.write_text("custom", encoding="utf-8")
        ctx.reset_context()
        content = ctx.PROJECT_CONCEPT_FILE.read_text(encoding="utf-8")
        assert "Project Concept" in content
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
        ctx.PROJECT_CONCEPT_FILE.write_text(
            "# Project Concept\n\nA fishing mobile game for casual players.\n",
            encoding="utf-8",
        )
        result = ctx.get_project_concept()
        assert "fishing mobile game" in result

    def test_stops_at_next_section(self, ctx):
        ctx.init_context()
        ctx.PROJECT_CONCEPT_FILE.write_text(
            "# Project Concept\n\nA fishing game.\n",
            encoding="utf-8",
        )
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

    def test_status_history_stamps_initial_status(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(42, title="S", phase_status="gherkin_locked")
        history = ctx.get_story_index()["42"]["status_history"]
        assert len(history["gherkin_locked"]) == 1

    def test_status_history_appends_on_change_only(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(42, phase_status="gherkin_locked")
        ctx.upsert_story_index(42, title="renamed only")          # no status change
        ctx.upsert_story_index(42, phase_status="gherkin_locked")  # same status
        ctx.upsert_story_index(42, phase_status="design_locked")
        history = ctx.get_story_index()["42"]["status_history"]
        assert len(history["gherkin_locked"]) == 1
        assert len(history["design_locked"]) == 1

    def test_status_history_preserves_reentries(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(42, phase_status="implementation")
        ctx.upsert_story_index(42, phase_status="qa")
        ctx.upsert_story_index(42, phase_status="implementation")  # Fix-Bolt return
        history = ctx.get_story_index()["42"]["status_history"]
        assert len(history["implementation"]) == 2
        assert len(history["qa"]) == 1

    def test_increment_story_counter(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(42, title="S")
        assert ctx.increment_story_counter(42) == 1
        assert ctx.increment_story_counter(42) == 2
        assert ctx.get_story_index()["42"]["fix_bolt_count"] == 2

    def test_increment_story_counter_missing_entry_is_noop(self, ctx):
        ctx.init_context()
        assert ctx.increment_story_counter(999) == 0
        assert "999" not in ctx.get_story_index()


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
        ctx._story_index_caches.pop(ctx._get_project_id(), None)  # force disk re-read
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

    def test_rebuild_preserves_gate_statuses_and_history(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(10, "Story Ten", self.GHERKIN)
        (ctx.CONTEXT_DIR / "bdd_story_10.feature").write_text("Feature: BDD\n", encoding="utf-8")
        ctx.upsert_story_index(10, phase_status="qa")
        ctx.upsert_story_index(10, phase_status="qa_passed", fix_bolt_count=2)
        index = ctx.rebuild_story_index()
        assert index["10"]["phase_status"] == "qa_passed"
        assert index["10"]["fix_bolt_count"] == 2
        assert "qa_passed" in index["10"]["status_history"]

    def test_rebuild_preserves_deployed(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(10, "Story Ten", self.GHERKIN)
        (ctx.CONTEXT_DIR / "bdd_story_10.feature").write_text("Feature: BDD\n", encoding="utf-8")
        ctx.upsert_story_index(10, phase_status="deployed")
        index = ctx.rebuild_story_index()
        assert index["10"]["phase_status"] == "deployed"

    def test_rebuild_does_not_promote_without_bdd(self, ctx):
        # No bdd file → recomputed status stays below qa; old qa_passed must NOT
        # be restored because the artifact chain no longer supports it.
        ctx.init_context()
        ctx.append_gherkin(10, "Story Ten", self.GHERKIN)
        ctx.upsert_story_index(10, phase_status="qa_passed")
        index = ctx.rebuild_story_index()
        assert index["10"]["phase_status"] == "gherkin_locked"

    def test_rebuild_recovers_phase5_artifacts(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(10, "Story Ten", self.GHERKIN)
        (ctx.CONTEXT_DIR / "infra_delta_story_10.json").write_text(
            json.dumps({"needs_infra_change": False, "rationale": "r", "deltas": []}),
            encoding="utf-8",
        )
        (ctx.CONTEXT_DIR / "deploy_pack_story_10.md").write_text("# Pack", encoding="utf-8")
        index = ctx.rebuild_story_index()
        assert index["10"]["has_infra_delta"] is True
        assert index["10"]["deploy_bypass"] is True
        assert index["10"]["has_deploy_pack"] is True


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

    def test_list_all_proposals(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(10, "Story Ten",
                           "Feature: X\n\n  Scenario: s\n    Given x\n    When y\n    Then z\n")
        ctx.save_proposal(story_id=10, task_id=2, proposal="pack two")
        ctx.save_proposal(story_id=10, task_id=1, proposal="pack one")
        ctx.save_proposal(story_id=11, task_id=1, proposal="other story")
        packs = ctx.list_all_proposals()
        assert [(p["story_id"], p["task_id"]) for p in packs] == [(10, 1), (10, 2), (11, 1)]
        assert packs[0]["chars"] == len("pack one")

    def test_delete_proposal_keeps_flag_while_others_remain(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(10, "Story Ten",
                           "Feature: X\n\n  Scenario: s\n    Given x\n    When y\n    Then z\n")
        ctx.save_proposal(story_id=10, task_id=1, proposal="p1")
        ctx.save_proposal(story_id=10, task_id=2, proposal="p2")
        ctx.upsert_story_index(10, phase_status="implementation")
        ctx.delete_proposal(10, 1)
        entry = ctx.get_story_index()["10"]
        assert entry["has_proposal"] is True
        assert entry["phase_status"] == "implementation"
        assert not (ctx.CONTEXT_DIR / "proposal_story_10_task_1.md").exists()

    def test_delete_last_proposal_clears_flag_and_downgrades(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(10, "Story Ten",
                           "Feature: X\n\n  Scenario: s\n    Given x\n    When y\n    Then z\n")
        ctx.save_proposal(story_id=10, task_id=1, proposal="p1")
        ctx.upsert_story_index(10, phase_status="implementation", has_tech_spec=True)
        ctx.delete_proposal(10, 1)
        entry = ctx.get_story_index()["10"]
        assert entry["has_proposal"] is False
        assert entry["phase_status"] == "design_locked"


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
        ctx.PROJECT_CONCEPT_FILE.write_text(
            "# Project Concept\n\nFishing game.\n",
            encoding="utf-8",
        )
        ctx.append_gherkin(1, "Story One", self.GHERKIN)
        ctx.append_technical_spec(1, "openapi: '3.0'\n")

    def test_phase_1_returns_memory_bank(self, ctx):
        self._setup(ctx)
        result = ctx.get_context_for_phase(1)
        assert "Fishing game" in result
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
        assert "Project Concept" not in result

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
            "project-concept.md", "tech-stack.md", "functional-spec.md", "technical-spec.md",
            "vaccines.md", "design-bundle.md",
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
# _context_dir
# ---------------------------------------------------------------------------

class TestBuildContextDir:
    def test_nonzero_id_returns_project_subdir(self):
        from src import context_manager as cm
        assert cm._context_dir(42) == cm._BASE_CONTEXTSPEC / "default" / "42"

    def test_zero_id_returns_default_subdir(self):
        from src import context_manager as cm
        assert cm._context_dir(0) == cm._BASE_CONTEXTSPEC / "default" / "default"

    def test_different_ids_produce_different_dirs(self):
        from src import context_manager as cm
        assert cm._context_dir(1) != cm._context_dir(2)


# ---------------------------------------------------------------------------
# set_active_project
# ---------------------------------------------------------------------------

class TestSetActiveProject:
    def test_updates_context_dir(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        token = cm._active_project_id.set(0)
        try:
            cm.set_active_project(99)
            assert cm.CONTEXT_DIR == tmp_path / "default" / "99"
        finally:
            cm._active_project_id.reset(token)

    def test_updates_all_file_paths(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        token = cm._active_project_id.set(0)
        try:
            cm.set_active_project(77)
            expected = tmp_path / "default" / "77"
            assert cm.PROJECT_CONCEPT_FILE == expected / "project-concept.md"
            assert cm.TECH_STACK_FILE      == expected / "tech-stack.md"
            assert cm.FUNCTIONAL_SPEC_FILE == expected / "functional-spec.md"
            assert cm.TECHNICAL_SPEC_FILE  == expected / "technical-spec.md"
            assert cm.VACCINES_FILE        == expected / "vaccines.md"
            assert cm.STORY_INDEX_FILE     == expected / "story-index.json"
            assert cm.DRAFT_FILE           == expected / ".apex-draft.json"
            assert cm.DESIGN_DRAFT_FILE    == expected / ".apex-design-draft.json"
            assert cm.SESSION_FILE         == expected / ".apex-session.json"
            assert cm.DESIGN_BUNDLE_FILE   == expected / "design-bundle.md"
        finally:
            cm._active_project_id.reset(token)

    def test_switching_to_new_project_shows_uninitialized(self, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_initialized_projects", set())
        token = cm._active_project_id.set(111)
        try:
            # Mark project 111 as initialized (cache key is (instance, pid)).
            cm._initialized_projects.add(cm._ctx_key())
            assert cm._context_initialized is True
            # Switch to a different project — it has not been initialized yet.
            cm.set_active_project(222)
            assert cm._context_initialized is False
        finally:
            cm._active_project_id.reset(token)

    def test_story_index_not_served_from_previous_project_cache(self, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_story_index_caches", {111: {"1": {"story_id": 1}}})
        token = cm._active_project_id.set(111)
        try:
            cm.set_active_project(222)
            # Project 222 has no cache entry — get_story_index() returns empty.
            assert cm._story_index_caches.get(222) is None
        finally:
            cm._active_project_id.reset(token)

    def test_zero_project_id_uses_default_dir(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        token = cm._active_project_id.set(1)
        try:
            cm.set_active_project(0)
            assert cm.CONTEXT_DIR == tmp_path / "default" / "default"
        finally:
            cm._active_project_id.reset(token)

    def test_switching_between_projects_changes_dir(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        token = cm._active_project_id.set(0)
        try:
            cm.set_active_project(10)
            dir_a = cm.CONTEXT_DIR
            cm.set_active_project(20)
            dir_b = cm.CONTEXT_DIR
            assert dir_a != dir_b
            assert dir_a == tmp_path / "default" / "10"
            assert dir_b == tmp_path / "default" / "20"
        finally:
            cm._active_project_id.reset(token)


# ---------------------------------------------------------------------------
# reset_cache
# ---------------------------------------------------------------------------

class TestResetCache:
    def test_resets_initialized_flag(self, ctx):
        ctx.init_context()
        assert ctx._context_initialized is True
        ctx.reset_cache()
        assert ctx._context_initialized is False

    def test_resets_story_index_cache(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(42, title="Test")
        key = ctx._ctx_key()
        assert key in ctx._story_index_caches
        ctx.reset_cache()
        assert key not in ctx._story_index_caches

    def test_does_not_change_context_dir(self, ctx):
        original = ctx.CONTEXT_DIR
        ctx.reset_cache()
        assert ctx.CONTEXT_DIR == original


# ---------------------------------------------------------------------------
# Project isolation (integration)
# ---------------------------------------------------------------------------

class TestProjectIsolation:
    """Data written under one project ID must not be visible under another."""

    GHERKIN = "Feature: X\n\n  Scenario: s\n    Given x\n    When y\n    Then z\n"

    def _setup(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        monkeypatch.setattr(cm, "_initialized_projects", set())
        monkeypatch.setattr(cm, "_story_index_caches", {})
        return cm

    def test_gherkin_isolated_between_projects(self, tmp_path, monkeypatch):
        cm = self._setup(tmp_path, monkeypatch)
        token = cm._active_project_id.set(1)
        try:
            cm.init_context()
            cm.append_gherkin(10, "Story A", self.GHERKIN)
            assert "Feature: X" in cm.get_story_gherkin(10)

            cm.set_active_project(2)
            cm.init_context()
            assert cm.get_story_gherkin(10) == ""

            # switch back — original data still present
            cm.set_active_project(1)
            assert "Feature: X" in cm.get_story_gherkin(10)
        finally:
            cm._active_project_id.reset(token)

    def test_story_index_isolated_between_projects(self, tmp_path, monkeypatch):
        cm = self._setup(tmp_path, monkeypatch)
        token = cm._active_project_id.set(10)
        try:
            cm.init_context()
            cm.upsert_story_index(5, title="Project 10 Story")

            cm.set_active_project(20)
            cm.init_context()
            assert "5" not in cm.get_story_index()
        finally:
            cm._active_project_id.reset(token)

    def test_separate_subdirectories_created_on_disk(self, tmp_path, monkeypatch):
        cm = self._setup(tmp_path, monkeypatch)
        token = cm._active_project_id.set(100)
        try:
            cm.init_context()
            cm.set_active_project(200)
            cm.init_context()
            assert (tmp_path / "default" / "100").is_dir()
            assert (tmp_path / "default" / "200").is_dir()
        finally:
            cm._active_project_id.reset(token)

    def test_memory_bank_content_isolated(self, tmp_path, monkeypatch):
        cm = self._setup(tmp_path, monkeypatch)
        token = cm._active_project_id.set(1)
        try:
            cm.init_context()
            cm.PROJECT_CONCEPT_FILE.write_text("# Project Concept\n\nProject One.", encoding="utf-8")

            cm.set_active_project(2)
            cm.init_context()
            assert "Project One" not in cm.PROJECT_CONCEPT_FILE.read_text(encoding="utf-8")
        finally:
            cm._active_project_id.reset(token)


# ---------------------------------------------------------------------------
# is_project_selected
# ---------------------------------------------------------------------------

class TestIsProjectSelected:
    def test_false_when_project_id_is_zero(self):
        from src import context_manager as cm
        token = cm._active_project_id.set(0)
        try:
            assert cm.is_project_selected() is False
        finally:
            cm._active_project_id.reset(token)

    def test_true_when_project_id_is_nonzero(self):
        from src import context_manager as cm
        token = cm._active_project_id.set(1786966)
        try:
            assert cm.is_project_selected() is True
        finally:
            cm._active_project_id.reset(token)


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

    def test_set_active_project_does_not_write_config(self, tmp_path, monkeypatch):
        """set_active_project runs on every request — persisting config here
        lets concurrent users on different projects thrash the shared config
        file. Persistence is the frontend's explicit POST /workspace/config."""
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        monkeypatch.setattr(cm, "_CONFIG_FILE", tmp_path / ".apex-config.json")
        token = cm._active_project_id.set(0)
        try:
            cm.set_active_project(42)
            assert cm._get_project_id() == 42
            assert not (tmp_path / ".apex-config.json").exists()
        finally:
            cm._active_project_id.reset(token)

    # ── H4: TTL cache + write serialisation ──────────────────────────────────

    def test_load_caches_within_ttl(self, tmp_path, monkeypatch):
        """A second load within the TTL must not re-read the file (the Azure
        File Share read is the cost H4 removes)."""
        import json
        from src import context_manager as cm
        f = tmp_path / ".apex-config.json"
        f.write_text(json.dumps({"project_id": 1}), encoding="utf-8")
        monkeypatch.setattr(cm, "_CONFIG_FILE", f)

        assert cm.load_config()["project_id"] == 1
        # Edit the file behind the cache's back; within TTL the cached value stands.
        f.write_text(json.dumps({"project_id": 2}), encoding="utf-8")
        assert cm.load_config()["project_id"] == 1
        # Explicit invalidation forces a fresh read.
        cm._invalidate_config_cache()
        assert cm.load_config()["project_id"] == 2

    def test_load_returns_copy_not_cached_object(self, tmp_path, monkeypatch):
        """Callers (save_* read-modify-write) mutate the returned dict; that must
        not corrupt the cached config."""
        import json
        from src import context_manager as cm
        f = tmp_path / ".apex-config.json"
        f.write_text(json.dumps({"project_id": 1}), encoding="utf-8")
        monkeypatch.setattr(cm, "_CONFIG_FILE", f)

        first = cm.load_config()
        first["mutated"] = True
        assert "mutated" not in cm.load_config()

    def test_save_primes_cache_with_written_value(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        monkeypatch.setattr(cm, "_CONFIG_FILE", tmp_path / ".apex-config.json")
        cm.save_pm_config(pm_tool="jira", jira_base_url="https://acme.atlassian.net")
        cfg = cm.load_config()
        assert cfg["pm_tool"] == "jira"
        assert cfg["jira_base_url"] == "https://acme.atlassian.net"

    def test_sequential_saves_preserve_each_others_fields(self, tmp_path, monkeypatch):
        """Serialised read-modify-write: one save must not drop another's field."""
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        monkeypatch.setattr(cm, "_CONFIG_FILE", tmp_path / ".apex-config.json")
        cm.save_config(42)
        cm.save_pm_config(pm_tool="taiga")
        cm.save_pm_config(jira_base_url="https://acme.atlassian.net")
        cfg = cm.load_config()
        assert cfg == {"project_id": 42, "pm_tool": "taiga", "jira_base_url": "https://acme.atlassian.net"}


# ---------------------------------------------------------------------------
# init_context no-op when no project selected
# ---------------------------------------------------------------------------

class TestInitContextNoProject:
    def test_does_not_create_files_when_no_project(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        monkeypatch.setattr(cm, "_initialized_projects", set())
        token = cm._active_project_id.set(0)
        try:
            cm.init_context()
            assert not (tmp_path / "default").exists()
        finally:
            cm._active_project_id.reset(token)

    def test_readers_return_empty_when_no_project(self, tmp_path, monkeypatch):
        from src import context_manager as cm
        monkeypatch.setattr(cm, "_BASE_CONTEXTSPEC", tmp_path)
        monkeypatch.setattr(cm, "_initialized_projects", set())
        token = cm._active_project_id.set(0)
        try:
            assert cm.get_project_concept() == ""
            assert cm.get_vaccines() == ""
            assert cm.get_story_gherkin(1) == ""
            assert cm.get_story_technical_spec(1) == ""
            assert cm.get_story_index() == {}
        finally:
            cm._active_project_id.reset(token)


# ---------------------------------------------------------------------------
# Story index — locking + cross-worker invalidation (audit H2)
# ---------------------------------------------------------------------------

class TestStoryIndexConcurrency:
    def test_concurrent_upserts_do_not_lose_updates(self, ctx):
        import concurrent.futures
        import contextvars

        ctx.init_context()

        def upsert(i: int) -> None:
            ctx.upsert_story_index(i, title=f"story-{i}")

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            futures = [
                pool.submit(contextvars.copy_context().run, upsert, i)
                for i in range(1, 41)
            ]
            for f in futures:
                f.result()

        index = ctx.get_story_index()
        assert len(index) == 40
        assert all(str(i) in index for i in range(1, 41))

    def test_external_file_write_invalidates_cache(self, ctx):
        """A write from another worker/process must be visible here —
        the cache is keyed on the index file's mtime."""
        import json
        import os

        ctx.init_context()
        ctx.upsert_story_index(1, title="from this worker")
        assert "1" in ctx.get_story_index()

        # Simulate another worker rewriting the file behind our back.
        sif = ctx.get_file_path("story-index.json")
        sif.write_text(
            json.dumps({"2": {"story_id": 2, "title": "from other worker"}}),
            encoding="utf-8",
        )
        os.utime(str(sif), (os.path.getmtime(str(sif)) + 10, os.path.getmtime(str(sif)) + 10))

        index = ctx.get_story_index()
        assert "2" in index
        assert "1" not in index


# ---------------------------------------------------------------------------
# get_story_design_bundle — per-epic slice (roadmap #5 hygiene)
# ---------------------------------------------------------------------------

class TestStoryDesignBundle:
    GHERKIN = (
        "Feature: X\n\n"
        "  Scenario: S\n"
        "    Given a\n"
        "    When b\n"
        "    Then c\n"
    )

    def test_returns_only_the_storys_epic_block(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(101, "Login", self.GHERKIN, epic_id=1, epic_title="Auth")
        ctx.append_gherkin(201, "Cart", self.GHERKIN, epic_id=2, epic_title="Shop")
        ctx.append_epic_design_bundle(1, "Auth", "wf1", "flow1", "tree1", "spec1")
        ctx.append_epic_design_bundle(2, "Shop", "wf2", "flow2", "tree2", "spec2")
        sliced = ctx.get_story_design_bundle(101)
        assert "## Epic 1: Auth" in sliced and "spec1" in sliced
        # unrelated epic excluded — this is the unbounded-growth fix
        assert "Epic 2" not in sliced and "spec2" not in sliced

    def test_falls_back_to_full_bundle_for_unified_format(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(101, "Login", self.GHERKIN, epic_id=1, epic_title="Auth")
        ctx.write_project_design_bundle("ux brief", "endpoint list", "the data model")
        sliced = ctx.get_story_design_bundle(101)
        assert "## UX Brief" in sliced and "the data model" in sliced

    def test_falls_back_when_story_has_no_epic_id(self, ctx):
        ctx.init_context()
        ctx.append_gherkin(101, "Login", self.GHERKIN)  # flat, no epic
        ctx.append_epic_design_bundle(1, "Auth", "wf1", "flow1", "tree1", "spec1")
        sliced = ctx.get_story_design_bundle(101)
        assert "spec1" in sliced  # whole file returned


# ---------------------------------------------------------------------------
# Controlled spec co-evolution — amendments + drift flag (roadmap #4)
# ---------------------------------------------------------------------------

class TestSpecCoEvolution:
    GHERKIN = "Feature: X\n\n  Scenario: S\n    Given a\n    When b\n    Then c\n"

    def test_post_lock_edit_flags_only_affected_stories(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(1, phase_status="implementation")  # past design_locked
        ctx.upsert_story_index(2, phase_status="gherkin_locked")  # before design_locked
        result = ctx.amend_locked_spec("technical-spec.md", note="tighten auth")
        assert result["amended"] is True
        assert result["affected_story_ids"] == [1]
        index = ctx.get_story_index()
        assert index["1"]["spec_drift"] is True
        assert index["1"]["drift_reason"] == "technical-spec.md"
        assert index["2"]["spec_drift"] is False

    def test_functional_spec_locks_at_gherkin_locked(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(1, phase_status="gherkin_locked")
        result = ctx.amend_locked_spec("functional-spec.md")
        assert result["affected_story_ids"] == [1]

    def test_pre_lock_edit_is_not_an_amendment(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(1, phase_status="gherkin_locked")  # before design_locked
        result = ctx.amend_locked_spec("design-bundle.md")
        assert result["amended"] is False
        assert ctx.get_story_index()["1"]["spec_drift"] is False

    def test_non_spec_file_never_drifts(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(1, phase_status="deployed")
        assert ctx.amend_locked_spec("github-context.md")["amended"] is False
        assert ctx.amend_locked_spec("vaccines.md")["amended"] is False

    def test_amendment_logged_to_file(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(1, phase_status="qa")
        ctx.amend_locked_spec("constraints.md", note="raise rate limit")
        log = ctx.get_amendments()
        assert "constraints.md" in log
        assert "raise rate limit" in log
        assert "#1" in log

    def test_clear_spec_drift(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(1, phase_status="implementation")
        ctx.amend_locked_spec("technical-spec.md")
        ctx.clear_spec_drift(1)
        assert ctx.get_story_index()["1"]["spec_drift"] is False
        assert ctx.get_story_index()["1"]["drift_reason"] == ""

    def test_save_proposal_auto_clears_drift(self, ctx):
        ctx.init_context()
        ctx.upsert_story_index(1, phase_status="implementation")
        ctx.amend_locked_spec("technical-spec.md")
        assert ctx.get_story_index()["1"]["spec_drift"] is True
        ctx.save_proposal(1, 1, "## Context\nre-derived\n")
        assert ctx.get_story_index()["1"]["spec_drift"] is False


# ---------------------------------------------------------------------------
# Phase 6 Maintenance — feedback triage store (F1/F2)
# ---------------------------------------------------------------------------

class TestMaintenanceItems:
    def test_create_assigns_sequential_ids(self, ctx):
        ctx.init_context()
        a = ctx.create_maintenance_item(subject="Login 500", description="empty pw")
        b = ctx.create_maintenance_item(subject="CSV export", source="github", ext_ref="GH#43")
        assert a["id"] == 1 and b["id"] == 2
        assert a["status"] == "new" and a["classification"] == "unclassified"
        assert b["source"] == "github" and b["ext_ref"] == "GH#43"

    def test_load_returns_newest_first(self, ctx):
        ctx.init_context()
        ctx.create_maintenance_item(subject="one")
        ctx.create_maintenance_item(subject="two")
        ids = [i["id"] for i in ctx.load_maintenance_items()]
        assert ids == [2, 1]

    def test_update_patches_fields_and_touches_updated_at(self, ctx):
        ctx.init_context()
        item = ctx.create_maintenance_item(subject="bug")
        updated = ctx.update_maintenance_item(item["id"], classification="bug", status="diagnosed")
        assert updated["classification"] == "bug" and updated["status"] == "diagnosed"
        assert updated["id"] == item["id"]

    def test_update_missing_returns_none(self, ctx):
        ctx.init_context()
        assert ctx.update_maintenance_item(999, status="resolved") is None

    def test_get_maintenance_item(self, ctx):
        ctx.init_context()
        ctx.create_maintenance_item(subject="x")
        assert ctx.get_maintenance_item(1)["subject"] == "x"
        assert ctx.get_maintenance_item(42) is None

    def test_log_append(self, ctx):
        ctx.init_context()
        ctx.append_maintenance_log(1, "Login 500", "classified: bug", "high severity hint")
        log = ctx.get_maintenance_log()
        assert "Item #1: Login 500" in log
        assert "classified: bug" in log and "high severity hint" in log
