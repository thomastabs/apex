"""Tests for the living traceability graph service + route."""

import pytest
from fastapi import HTTPException

from backend.app.schemas.workspace import TraceabilityGraphResponse
from backend.app.services.request_context import RequestContext
from backend.app.services.traceability_service import TraceabilityService


def _ctx() -> RequestContext:
    return RequestContext(pm_token="tok", project_id=1)


class FakeContextService:
    def __init__(self, index=None, proposals=None, gherkin="Feature: f\n  Scenario: a\n  Scenario: b", verifications=None, layout=None):
        self.index = index or {}
        self.proposals = proposals or []
        self.gherkin = gherkin
        self.verifications = verifications or {}
        self.layout = layout or {}
        self.saved_layout = None

    def set_active(self, ctx):
        pass

    def load_trace_layout(self):
        return self.layout

    def save_trace_layout(self, layout):
        self.saved_layout = layout

    def story_index(self):
        return self.index

    def list_all_proposals(self):
        return self.proposals

    def load_all_proposals(self):
        return [dict(p) for p in self.proposals]

    def story_gherkin(self, story_id):
        return self.gherkin

    def load_verification(self, story_id):
        return self.verifications.get(story_id)


def _graph(index, include_scenarios=False, **kw):
    return TraceabilityService(context=FakeContextService(index=index, **kw)).build_graph(
        _ctx(), include_scenarios=include_scenarios)


def test_empty_index_is_just_the_project_node():
    g = _graph({})
    assert [n["id"] for n in g["nodes"]] == ["project"]
    assert g["edges"] == []


def test_full_story_yields_the_derivation_chain():
    index = {"1": {"story_id": 1, "epic_id": 10, "title": "Login", "phase_status": "deployed",
                   "has_gherkin": True, "has_tech_spec": True, "has_proposal": True,
                   "has_bdd": True, "has_deploy_pack": True}}
    g = _graph(index)
    ids = {n["id"] for n in g["nodes"]}
    assert {"project", "design", "epic:10", "story:1", "gherkin:1", "tasks:1", "tests:1", "deploy:1"} <= ids
    chain = {(e["source"], e["target"]) for e in g["edges"] if e["kind"] == "derive"}
    assert {("project", "epic:10"), ("epic:10", "story:1"), ("story:1", "gherkin:1"),
            ("gherkin:1", "tasks:1"), ("tasks:1", "tests:1"), ("tests:1", "deploy:1")} <= chain
    # story with a locked design links to the shared Design node
    assert ("story:1", "design", "design") in {(e["source"], e["target"], e["kind"]) for e in g["edges"]}
    gh = next(n for n in g["nodes"] if n["id"] == "gherkin:1")
    assert gh["scenario_count"] == 2


def test_figma_node_added_when_story_linked():
    index = {"1": {"story_id": 1, "epic_id": 10, "title": "Login", "phase_status": "new",
                   "figma_node_id": "12:34"}}
    g = _graph(index)
    fig = next((n for n in g["nodes"] if n["id"] == "figma:1"), None)
    assert fig is not None
    assert fig["type"] == "figma" and fig["figma_node_id"] == "12:34"
    assert ("story:1", "figma:1", "design") in {(e["source"], e["target"], e["kind"]) for e in g["edges"]}


def test_no_figma_node_when_not_linked():
    g = _graph({"1": {"story_id": 1, "epic_id": 1, "title": "S", "phase_status": "new"}})
    assert "figma:1" not in {n["id"] for n in g["nodes"]}


def test_no_design_node_when_no_tech_spec():
    g = _graph({"1": {"story_id": 1, "epic_id": 1, "title": "S", "phase_status": "new", "has_gherkin": True}})
    assert "design" not in {n["id"] for n in g["nodes"]}


def test_trace_flag_adds_a_trace_edge_to_source():
    index = {"1": {"story_id": 1, "epic_id": 1, "title": "S", "phase_status": "deployed",
                   "has_gherkin": True, "trace_flag": True, "trace_phase": "gherkin_locked"}}
    g = _graph(index)
    assert ("story:1", "gherkin:1", "trace") in {(e["source"], e["target"], e["kind"]) for e in g["edges"]}
    story = next(n for n in g["nodes"] if n["id"] == "story:1")
    assert story["flags"]["trace"] is True


def test_scenario_layer_adds_scenario_nodes_and_verify_edges():
    index = {"1": {"story_id": 1, "epic_id": 1, "title": "Login", "phase_status": "qa_passed",
                   "has_gherkin": True, "has_bdd": True}}
    verif = {1: {"scenarios": [
        {"scenario": "a", "qa_result": "passed", "gaps": []},
        {"scenario": "b", "qa_result": "untested", "gaps": ["no pack"]},
    ]}}
    g = _graph(index, include_scenarios=True, verifications=verif)
    sc = {n["id"]: n for n in g["nodes"] if n["type"] == "scenario"}
    assert set(sc) == {"scenario:1:0", "scenario:1:1"}
    assert sc["scenario:1:0"]["verified"] is True
    assert sc["scenario:1:1"]["flags"]["gap"] is True
    kinds = {(e["source"], e["target"], e["kind"]) for e in g["edges"]}
    assert ("gherkin:1", "scenario:1:0", "derive") in kinds
    assert ("scenario:1:0", "tests:1", "verify") in kinds  # passed scenario links to tests
    assert ("scenario:1:1", "tests:1", "verify") not in kinds  # untested does not


def test_scenarios_off_by_default():
    index = {"1": {"story_id": 1, "epic_id": 1, "title": "S", "phase_status": "new", "has_gherkin": True}}
    g = _graph(index)
    assert not any(n["type"] == "scenario" for n in g["nodes"])


def test_saved_layout_merges_onto_matching_nodes():
    index = {"1": {"story_id": 1, "epic_id": 1, "title": "S", "phase_status": "new"}}
    fake = FakeContextService(index=index, layout={"story:1": {"x": 100, "y": 50}})
    g = TraceabilityService(context=fake).build_graph(_ctx())
    story = next(n for n in g["nodes"] if n["id"] == "story:1")
    assert story["position"] == {"x": 100, "y": 50}
    # nodes without a saved position stay None (client Dagre-fills them)
    assert next(n for n in g["nodes"] if n["id"] == "project")["position"] is None


def test_save_layout_persists_id_keyed_positions():
    fake = FakeContextService()
    TraceabilityService(context=fake).save_layout(
        _ctx(), [{"id": "story:1", "x": 10.0, "y": 20.0}],
    )
    assert fake.saved_layout == {"story:1": {"x": 10.0, "y": 20.0}}


def test_api_response_schema_accepts_runtime_and_regression_edges():
    index = {"1": {"story_id": 1, "epic_id": 1, "title": "S", "phase_status": "implementation",
                   "has_runtime_spec": True, "has_proposal": True, "has_bdd": True,
                   "has_deploy_pack": True, "has_bug_report": True}}
    g = _graph(index)

    assert "runtime" in {n["type"] for n in g["nodes"]}
    assert "regression" in {e["kind"] for e in g["edges"]}
    TraceabilityGraphResponse.model_validate(g)


def test_route_maps_failure_to_500(monkeypatch):
    from backend.app.api import workspace
    monkeypatch.setattr(
        workspace.ContextService, "set_active", lambda self, ctx: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    with pytest.raises(HTTPException) as exc:
        workspace.traceability_graph(ctx=_ctx())
    assert exc.value.status_code == 500
