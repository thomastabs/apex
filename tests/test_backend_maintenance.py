"""Tests for the Phase 6 MaintenanceService (Triage F1 + Fix-Bolt routing F2)."""

import pytest

from backend.app.services.maintenance_service import (
    MaintenanceService, MaintenanceValidationError,
)
from backend.app.services.request_context import RequestContext


class FakeAiService:
    def __init__(self, classification="bug", severity="high", lane="secure"):
        self.classification = classification
        self.severity = severity
        self.lane = lane

    def triage_feedback(self, subject, description, spec_excerpt=""):
        return {"classification": self.classification, "rationale": "because",
                "severity_hint": self.severity}

    def diagnose_bug(self, subject, description, evidence="", code_snippet="", spec_excerpt=""):
        return "## Root Cause\nmissing null check"

    def fix_bolt_brief(self, diagnosis_md, spec_excerpt=""):
        return "## Fix-Bolt Brief\n**Patch**: guard null"

    def suggest_severity_lane(self, diagnosis_md, patch_scope=""):
        return {"lane": self.lane, "rationale": "touches auth"}


class FakeContextService:
    def __init__(self, index=None):
        self.index = index if index is not None else {"5": {"story_id": 5, "title": "Login", "phase_status": "deployed"}}
        self.items: dict[int, dict] = {}
        self._seq = 0
        self.deployments: list[dict] = []
        self.fix_log: list[tuple] = []
        self.log: list[str] = []

    def set_active(self, ctx):
        self.project_id = ctx.project_id

    def story_index(self):
        return self.index

    def story_gherkin(self, story_id):
        return f"Scenario: story {story_id}"

    def load_maintenance_items(self):
        return sorted(self.items.values(), key=lambda i: i["id"], reverse=True)

    def get_maintenance_item(self, item_id):
        return self.items.get(item_id)

    def create_maintenance_item(self, **kw):
        self._seq += 1
        item = {"id": self._seq, "classification": "unclassified", "status": "new",
                "diagnosis_md": "", "fix_brief_md": "", "lane": None, "ai_rationale": {},
                "evidence": "", "description": "", "linked_story_id": None, **kw}
        self.items[self._seq] = item
        return item

    def update_maintenance_item(self, item_id, **updates):
        if item_id not in self.items:
            return None
        self.items[item_id].update(updates)
        return self.items[item_id]

    def delete_maintenance_item(self, item_id):
        return self.items.pop(item_id, None) is not None

    def append_maintenance_log(self, item_id, subject, event, detail=""):
        self.log.append(f"#{item_id} {event} {detail}")

    def get_maintenance_log(self):
        return "\n".join(self.log)

    def upsert_story_index(self, story_id, **updates):
        self.index.setdefault(str(story_id), {"story_id": story_id}).update(updates)

    def append_deployment_record(self, story_id, title, *, bypass, pack_present, sign_offs, notes=""):
        self.deployments.append({"story_id": story_id, "bypass": bypass, "notes": notes})

    def append_fix_log_record(self, issue_id, root_cause, resolution_summary):
        self.fix_log.append((issue_id, root_cause, resolution_summary))


@pytest.fixture
def ctx():
    return RequestContext(pm_token="t", project_id=1, instance_id="test")


def _svc(ai=None, context=None):
    ai = ai or FakeAiService()
    context = context or FakeContextService()
    return MaintenanceService(ai=ai, context=context), context


def test_create_item_validates_subject(ctx):
    svc, _ = _svc()
    with pytest.raises(MaintenanceValidationError):
        svc.create_item(ctx, subject="  ")


def test_create_item_rejects_unknown_linked_story(ctx):
    svc, _ = _svc()
    with pytest.raises(MaintenanceValidationError):
        svc.create_item(ctx, subject="bug", linked_story_id=999)


def test_classify_change_request_routes_to_discovery(ctx):
    svc, c = _svc(ai=FakeAiService(classification="change_request"))
    item = svc.create_item(ctx, subject="Add export", linked_story_id=5)
    out = svc.classify(ctx, item["id"])
    assert out["classification"] == "change_request"
    assert out["status"] == "routed_to_discovery"


def test_classify_bug_then_diagnose_then_fix(ctx):
    svc, c = _svc(ai=FakeAiService(classification="bug"))
    item = svc.create_item(ctx, subject="500", description="boom", linked_story_id=5)
    svc.classify(ctx, item["id"])
    assert c.items[item["id"]]["classification"] == "bug"
    diag = svc.diagnose(ctx, item["id"], code_snippet="def f(): ...")
    assert diag["status"] == "diagnosed" and "Root Cause" in diag["diagnosis_md"]
    fix = svc.generate_fix_brief(ctx, item["id"])
    assert fix["status"] == "fix_ready" and "Fix-Bolt Brief" in fix["fix_brief_md"]


def test_delete_item_removes_and_logs(ctx):
    svc, c = _svc()
    item = svc.create_item(ctx, subject="typo")
    svc.delete_item(ctx, item["id"])
    assert item["id"] not in c.items
    assert any("deleted" in entry for entry in c.log)


def test_delete_unknown_item_raises(ctx):
    svc, _ = _svc()
    with pytest.raises(MaintenanceValidationError):
        svc.delete_item(ctx, 999)


def test_diagnose_requires_bug_classification(ctx):
    svc, _ = _svc()
    item = svc.create_item(ctx, subject="x")  # unclassified
    with pytest.raises(MaintenanceValidationError):
        svc.diagnose(ctx, item["id"])


def test_fix_brief_requires_diagnosis(ctx):
    svc, c = _svc(ai=FakeAiService(classification="bug"))
    item = svc.create_item(ctx, subject="x", linked_story_id=5)
    svc.classify(ctx, item["id"])
    with pytest.raises(MaintenanceValidationError):
        svc.generate_fix_brief(ctx, item["id"])


def test_fast_lane_writes_deploy_record_and_deploys_story(ctx):
    svc, c = _svc()
    item = svc.create_item(ctx, subject="typo", linked_story_id=5)
    svc.route_lane(ctx, item["id"], "fast")
    assert c.deployments and c.deployments[0]["bypass"] is True
    assert c.index["5"]["phase_status"] == "deployed"
    assert c.items[item["id"]]["lane"] == "fast"


def test_secure_lane_sets_regression_bypass(ctx):
    svc, c = _svc()
    item = svc.create_item(ctx, subject="auth bug", linked_story_id=5)
    svc.route_lane(ctx, item["id"], "secure")
    assert c.index["5"]["phase_status"] == "implementation"
    assert c.index["5"]["has_bug_report"] is True
    assert not c.deployments


def test_route_invalid_lane_raises(ctx):
    svc, _ = _svc()
    item = svc.create_item(ctx, subject="x", linked_story_id=5)
    with pytest.raises(MaintenanceValidationError):
        svc.route_lane(ctx, item["id"], "turbo")


def test_resolve_writes_fix_log(ctx):
    svc, c = _svc()
    item = svc.create_item(ctx, subject="bug", linked_story_id=5)
    svc.resolve(ctx, item["id"], root_cause="null deref", resolution_summary="guarded")
    assert c.fix_log == [(item["id"], "null deref", "guarded")]
    assert c.items[item["id"]]["status"] == "resolved"


def test_net_new_item_routes_without_story(ctx):
    svc, c = _svc()
    item = svc.create_item(ctx, subject="general slowness")  # no linked story
    svc.route_lane(ctx, item["id"], "secure")
    assert c.items[item["id"]]["lane"] == "secure"
    assert not c.deployments  # nothing to route
