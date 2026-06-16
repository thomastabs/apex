"""Phase 6 Maintenance & Evolution service — Triage (F1) + Fix-Bolt routing (F2)."""

import logging

from backend.app.services.ai_service import AiService
from backend.app.services.context_service import ContextService
from backend.app.services.request_context import RequestContext

_logger = logging.getLogger("apex.maintenance_service")

_VALID_SOURCES = ("manual", "github", "taiga")
_VALID_LANES = ("fast", "secure")


class MaintenanceValidationError(ValueError):
    """Raised when a maintenance request is structurally invalid."""


class MaintenanceService:
    def __init__(self, *, ai: AiService | None = None, context: ContextService | None = None) -> None:
        self.ai = ai or AiService()
        self.context = context or ContextService()

    def configure_request(self, ctx: RequestContext) -> None:
        self.context.set_active(ctx)

    # ── intake ──────────────────────────────────────────────────────────────

    def list_items(self, ctx: RequestContext) -> list[dict]:
        self.configure_request(ctx)
        return self.context.load_maintenance_items()

    def create_item(self, ctx: RequestContext, *, subject: str, description: str = "",
                    evidence: str = "", source: str = "manual", ext_ref: str = "",
                    linked_story_id: int | None = None) -> dict:
        self.configure_request(ctx)
        if not subject.strip():
            raise MaintenanceValidationError("A maintenance item needs a subject.")
        if source not in _VALID_SOURCES:
            raise MaintenanceValidationError(f"Unknown source {source!r}.")
        if linked_story_id is not None and str(linked_story_id) not in self.context.story_index():
            raise MaintenanceValidationError(f"Linked story {linked_story_id} is not in the index.")
        item = self.context.create_maintenance_item(
            subject=subject.strip(), description=description, evidence=evidence,
            source=source, ext_ref=ext_ref, linked_story_id=linked_story_id,
        )
        self.context.append_maintenance_log(item["id"], subject, f"created ({source})")
        return item

    # ── helpers ─────────────────────────────────────────────────────────────

    def _require(self, item_id: int) -> dict:
        item = self.context.get_maintenance_item(item_id)
        if item is None:
            raise MaintenanceValidationError(f"Maintenance item {item_id} not found.")
        return item

    def _spec_excerpt(self, item: dict) -> str:
        """Linked story's Gherkin as grounding (empty for net-new items)."""
        sid = item.get("linked_story_id")
        return self.context.story_gherkin(sid) if sid is not None else ""

    # ── F1: classify ─────────────────────────────────────────────────────────

    def classify(self, ctx: RequestContext, item_id: int) -> dict:
        self.configure_request(ctx)
        item = self._require(item_id)
        result = self.ai.triage_feedback(item["subject"], item["description"], self._spec_excerpt(item))
        rationale = {**item.get("ai_rationale", {}), "classify": result["rationale"],
                     "severity_hint": result.get("severity_hint", "unknown")}
        classification = result["classification"]
        if classification == "change_request":
            # Path A — business deviation: never patched; route to discovery.
            updated = self.context.update_maintenance_item(
                item_id, classification="change_request", status="routed_to_discovery",
                ai_rationale=rationale,
            )
            self.context.append_maintenance_log(
                item_id, item["subject"], "classified: change request → routed to discovery (Phase 1)",
                result["rationale"],
            )
        else:
            # Path B — bug: ready for the narrow diagnosis step.
            updated = self.context.update_maintenance_item(
                item_id, classification="bug", ai_rationale=rationale,
            )
            self.context.append_maintenance_log(
                item_id, item["subject"], "classified: bug → diagnosis", result["rationale"],
            )
        return updated

    # ── F1 Path B: narrow diagnosis (Context Isolation) ──────────────────────

    def diagnose(self, ctx: RequestContext, item_id: int, code_snippet: str = "") -> dict:
        self.configure_request(ctx)
        item = self._require(item_id)
        if item.get("classification") != "bug":
            raise MaintenanceValidationError("Only items classified as a bug can be diagnosed.")
        diagnosis = self.ai.diagnose_bug(
            item["subject"], item["description"], evidence=item.get("evidence", ""),
            code_snippet=code_snippet, spec_excerpt=self._spec_excerpt(item),
        )
        updated = self.context.update_maintenance_item(item_id, diagnosis_md=diagnosis, status="diagnosed")
        self.context.append_maintenance_log(item_id, item["subject"], "diagnosed (narrow, human to verify)")
        return updated

    # ── F2: fix-bolt brief ────────────────────────────────────────────────────

    def generate_fix_brief(self, ctx: RequestContext, item_id: int) -> dict:
        self.configure_request(ctx)
        item = self._require(item_id)
        if not item.get("diagnosis_md", "").strip():
            raise MaintenanceValidationError("Diagnose the bug (and verify it) before generating a fix brief.")
        brief = self.ai.fix_bolt_brief(item["diagnosis_md"], self._spec_excerpt(item))
        updated = self.context.update_maintenance_item(item_id, fix_brief_md=brief, status="fix_ready")
        self.context.append_maintenance_log(item_id, item["subject"], "fix-bolt brief generated")
        return updated

    def suggest_lane(self, ctx: RequestContext, item_id: int) -> dict:
        self.configure_request(ctx)
        item = self._require(item_id)
        if not item.get("diagnosis_md", "").strip():
            raise MaintenanceValidationError("Diagnose the bug before assessing severity.")
        return self.ai.suggest_severity_lane(item["diagnosis_md"], item.get("fix_brief_md", ""))

    # ── F2: severity routing ──────────────────────────────────────────────────

    def route_lane(self, ctx: RequestContext, item_id: int, lane: str) -> dict:
        self.configure_request(ctx)
        if lane not in _VALID_LANES:
            raise MaintenanceValidationError(f"Lane must be one of {_VALID_LANES}.")
        item = self._require(item_id)
        sid = item.get("linked_story_id")
        if lane == "fast":
            # Fast Lane: low-risk — straight to a deploy record, QA bypassed.
            if sid is not None:
                title = self.context.story_index().get(str(sid), {}).get("title", f"Story {sid}")
                self.context.append_deployment_record(
                    sid, title, bypass=True, pack_present=False,
                    sign_offs=["fast-lane fix-bolt"], notes=f"Fast Lane fix-bolt (maintenance item #{item_id})",
                )
                self.context.upsert_story_index(sid, phase_status="deployed")
            detail = "Fast Lane — deploy record, QA bypassed" + ("" if sid else " (no linked story)")
        else:
            # Secure Lane: high-risk — back to QA as a Regression Bypass.
            if sid is not None:
                self.context.upsert_story_index(sid, phase_status="implementation", has_bug_report=True)
            detail = "Secure Lane — routed to QA Regression Bypass" + ("" if sid else " (no linked story)")
        updated = self.context.update_maintenance_item(item_id, lane=lane)
        self.context.append_maintenance_log(item_id, item["subject"], f"routed: {lane} lane", detail)
        return updated

    # ── resolve (Vaccine) ─────────────────────────────────────────────────────

    def resolve(self, ctx: RequestContext, item_id: int, *, root_cause: str = "",
                resolution_summary: str = "") -> dict:
        self.configure_request(ctx)
        item = self._require(item_id)
        # Vaccine: permanent annotation so the AI never reintroduces this defect.
        self.context.append_vaccine_record(
            item_id, root_cause or item.get("diagnosis_md", "").strip()[:500] or item["subject"],
            resolution_summary or item.get("fix_brief_md", "").strip()[:500] or "Resolved via Fix-Bolt.",
        )
        updated = self.context.update_maintenance_item(item_id, status="resolved")
        self.context.append_maintenance_log(item_id, item["subject"], "resolved (vaccine recorded)")
        return updated

    def get_log(self, ctx: RequestContext) -> str:
        self.configure_request(ctx)
        return self.context.get_maintenance_log()
