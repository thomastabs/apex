"""Phase 5 Deployment Gate workflow service.

Implements the framework's "Deployment & Release" playbook as a governance
layer: infra delta check → deploy pack or routine bypass → human-gated
deployment decision. Apex records artifacts and gate decisions; it does not
trigger real deployments.
"""

import logging

from backend.app.services.ai_service import AiService
from backend.app.services.context_service import ContextService
from backend.app.services.request_context import RequestContext

_logger = logging.getLogger("apex.phase5_service")

_PREVIEW_CHARS = 600

# Substrings that, if present in the synced repo context, indicate a deployment
# pipeline / containerisation / IaC already exists (case-insensitive).
_PIPELINE_MARKERS = (
    ".github/workflows", "gitlab-ci", "azure-pipelines", "jenkinsfile", "bitbucket-pipelines",
    "cloudbuild", "dockerfile", "docker-compose", "compose.yaml", "compose.yml",
    "procfile", "fly.toml", "vercel.json", "netlify.toml", "render.yaml", "serverless.yml",
    ".tf", ".bicep", "helm", "k8s", "kubernetes",
)


class Phase5ValidationError(ValueError):
    """Raised when a Phase 5 request is structurally invalid."""


class Phase5Service:
    def __init__(
        self,
        *,
        ai: AiService | None = None,
        context: ContextService | None = None,
    ) -> None:
        self.ai = ai or AiService()
        self.context = context or ContextService()

    def configure_request(self, ctx: RequestContext) -> None:
        self.context.set_active(ctx)

    # ── eligibility ─────────────────────────────────────────────────────────

    def _eligible_entry(
        self, story_id: int, *, allowed: tuple[str, ...] = ("qa_passed",)
    ) -> dict:
        index = self.context.story_index()
        entry = index.get(str(story_id)) or {}
        if not entry:
            raise Phase5ValidationError(f"Story {story_id} not found in index.")
        status = entry.get("phase_status", "")
        if status not in allowed:
            raise Phase5ValidationError(
                f"Story {story_id} is not eligible for Phase 5 (status: {status!r})."
            )
        return entry

    def get_eligible_stories(self, ctx: RequestContext) -> list[dict]:
        self.configure_request(ctx)
        index = self.context.story_index()
        stories = []
        for entry in index.values():
            if entry.get("phase_status", "") != "qa_passed":
                continue
            story_id = entry.get("story_id")
            if not story_id:
                continue
            gherkin = self.context.story_gherkin(story_id)
            stories.append({
                "story_id": story_id,
                "title": entry.get("title", ""),
                "epic_title": entry.get("epic_title", ""),
                "gherkin_preview": gherkin[:_PREVIEW_CHARS].strip(),
                "has_infra_delta": entry.get("has_infra_delta", False),
                "has_deploy_pack": entry.get("has_deploy_pack", False),
                "deploy_bypass": entry.get("deploy_bypass", False),
                "fix_bolt_count": entry.get("fix_bolt_count", 0),
            })
        return sorted(stories, key=lambda s: s["story_id"])

    def _is_first_deployment(self, *, exclude_story_id: int | None = None) -> bool:
        """True when no other story has reached the deployed state yet."""
        for entry in self.context.story_index().values():
            if entry.get("story_id") == exclude_story_id:
                continue
            if entry.get("phase_status") == "deployed" or entry.get("deploy_bypass"):
                return False
        return True

    @staticmethod
    def _pipeline_detected(github_context: str) -> bool:
        """True when the synced repo context shows CI/CD, containerisation, or IaC."""
        text = (github_context or "").lower()
        if not text.strip() or text.strip().startswith("<!--"):
            return False
        return any(marker in text for marker in _PIPELINE_MARKERS)

    def get_story_context(self, ctx: RequestContext, story_id: int) -> dict:
        self.configure_request(ctx)
        entry = self._eligible_entry(story_id)
        github_context = self.context.read_context_file("github-context.md")
        synced = bool(github_context.strip()) and not github_context.strip().startswith("<!--")
        return {
            "story_id": story_id,
            "title": entry.get("title", ""),
            "epic_title": entry.get("epic_title", ""),
            "gherkin": self.context.story_gherkin(story_id),
            "technical_spec": self.context.story_technical_spec(story_id),
            "tech_stack": self.context.read_tech_stack(),
            "github_context_synced": synced,
            "is_first_deployment": self._is_first_deployment(exclude_story_id=story_id),
            "pipeline_detected": self._pipeline_detected(github_context),
            "has_bug_report": entry.get("has_bug_report", False),
            "fix_bolt_count": entry.get("fix_bolt_count", 0),
        }

    # ── Step 1: infra delta check ───────────────────────────────────────────

    def generate_infra_delta(self, ctx: RequestContext, story_id: int) -> dict:
        self.configure_request(ctx)
        entry = self._eligible_entry(story_id)
        story_title = entry.get("title", f"Story {story_id}")
        gherkin = self.context.story_gherkin(story_id)
        if not gherkin.strip():
            raise Phase5ValidationError(f"Story {story_id} has no Gherkin content.")
        github_context = self.context.read_context_file("github-context.md")
        return self.ai.generate_infra_delta(
            story_title,
            gherkin,
            self.context.story_technical_spec(story_id),
            tech_stack=self.context.read_tech_stack(),
            github_context=github_context,
            is_first_deployment=self._is_first_deployment(exclude_story_id=story_id),
            pipeline_detected=self._pipeline_detected(github_context),
        )

    def save_infra_delta(self, ctx: RequestContext, story_id: int, delta: dict) -> None:
        self.configure_request(ctx)
        self._eligible_entry(story_id)
        if delta.get("needs_infra_change") and not delta.get("deltas"):
            raise Phase5ValidationError(
                "Infra changes flagged but the delta list is empty — add at least one item."
            )
        self.context.save_infra_delta(story_id, delta)
        _logger.info("Phase 5 infra delta saved for story %s (bypass=%s)",
                     story_id, not delta.get("needs_infra_change"))

    def load_infra_delta(self, ctx: RequestContext, story_id: int) -> dict:
        self.configure_request(ctx)
        delta = self.context.load_infra_delta(story_id)
        if delta is None:
            raise Phase5ValidationError(f"No infra delta saved for story {story_id}.")
        return delta

    # ── Step 2: deploy pack or bypass ───────────────────────────────────────

    def _require_delta_with_changes(self, story_id: int) -> dict:
        delta = self.context.load_infra_delta(story_id)
        if delta is None:
            raise Phase5ValidationError(
                f"Run and save the infra delta check for story {story_id} first."
            )
        if not delta.get("needs_infra_change"):
            raise Phase5ValidationError(
                f"Story {story_id} is a routine deployment (bypass) — no deploy pack needed."
            )
        return delta

    def generate_deploy_pack(self, ctx: RequestContext, story_id: int, options=None) -> str:
        self.configure_request(ctx)
        entry = self._eligible_entry(story_id)
        delta = self._require_delta_with_changes(story_id)
        return self.ai.generate_deploy_pack(
            entry.get("title", f"Story {story_id}"),
            self.context.render_infra_delta_md(story_id, delta),
            self.context.story_technical_spec(story_id),
            tech_stack=self.context.read_tech_stack(),
            github_context=self.context.read_context_file("github-context.md"),
            target_env=getattr(options, "target_env", "") or "",
            iac_format=getattr(options, "iac_format", "") or "",
            emphasis=list(getattr(options, "emphasis", []) or []),
            instructions=getattr(options, "instructions", "") or "",
        )

    def save_deploy_pack(self, ctx: RequestContext, story_id: int, pack_md: str) -> None:
        self.configure_request(ctx)
        self._eligible_entry(story_id)
        self._require_delta_with_changes(story_id)
        self.context.save_deploy_pack(story_id, pack_md)

    def load_deploy_pack(self, ctx: RequestContext, story_id: int) -> str:
        self.configure_request(ctx)
        return self.context.load_deploy_pack(story_id)

    def delete_deploy_pack(self, ctx: RequestContext, story_id: int) -> None:
        self.configure_request(ctx)
        self.context.delete_deploy_pack(story_id)

    def list_all_deploy_packs(self, ctx: RequestContext) -> list[dict]:
        """All saved deploy packs in the project, annotated with story titles."""
        self.configure_request(ctx)
        return self.context.list_all_deploy_packs()

    def revise_deploy_pack(
        self, ctx: RequestContext, story_id: int, pack_md: str, feedback: str,
    ) -> str:
        self.configure_request(ctx)
        self._eligible_entry(story_id)
        delta = self._require_delta_with_changes(story_id)
        return self.ai.revise_deploy_pack(
            pack_md,
            feedback,
            infra_delta_md=self.context.render_infra_delta_md(story_id, delta),
        )

    # ── Verification evidence (traceability matrix, assembled client-side) ──

    def get_qa_results(self, ctx: RequestContext, story_id: int) -> dict | None:
        self.configure_request(ctx)
        return self.context.load_qa_results(story_id)

    def save_verification(self, ctx: RequestContext, story_id: int, matrix: dict) -> None:
        self.configure_request(ctx)
        # Stage D auto-saves can fire on a revisit after the gate has already
        # been passed, so an already-deployed story is still a valid target.
        self._eligible_entry(story_id, allowed=("qa_passed", "deployed"))
        self.context.save_verification(story_id, matrix)

    def load_verification(self, ctx: RequestContext, story_id: int) -> dict | None:
        self.configure_request(ctx)
        return self.context.load_verification(story_id)

    # ── Steps 3-4: the Deployment Gate ──────────────────────────────────────

    def pass_deployment_gate(
        self,
        ctx: RequestContext,
        story_id: int,
        *,
        tech_lead_approved: bool,
        devops_approved: bool,
        notes: str = "",
    ) -> None:
        self.configure_request(ctx)
        entry = self._eligible_entry(story_id)
        if not (tech_lead_approved and devops_approved):
            raise Phase5ValidationError(
                "Both sign-offs (Tech Lead and Security Reviewer) are required to pass the gate."
            )
        delta = self.context.load_infra_delta(story_id)
        if delta is None:
            raise Phase5ValidationError(
                f"Run and save the infra delta check for story {story_id} before the gate."
            )
        bypass = not delta.get("needs_infra_change")
        pack = self.context.load_deploy_pack(story_id)
        if not bypass and not pack.strip():
            raise Phase5ValidationError(
                "A saved deploy pack is required — the delta check flagged infra changes."
            )
        # The matrix is advisory gate evidence — its absence is recorded, never blocking.
        verification = self.context.load_verification(story_id)
        gate_notes = notes.strip()
        if verification is None:
            trace_note = "traceability matrix: not saved"
        else:
            s = verification.get("summary", {})
            trace_note = (
                f"traceability: {s.get('covered', 0)}/{s.get('total', 0)} scenarios covered, "
                f"{s.get('gap_count', 0)} gap(s)"
            )
        gate_notes = f"{gate_notes} · {trace_note}" if gate_notes else trace_note
        self.context.append_deployment_record(
            story_id,
            entry.get("title", f"Story {story_id}"),
            bypass=bypass,
            pack_present=bool(pack.strip()),
            sign_offs=["Tech Lead — pack reviewed", "Security Reviewer — security review passed"],
            notes=gate_notes,
        )
        self.context.upsert_story_index(story_id, phase_status="deployed")
        _logger.info("Phase 5 deployment gate passed for story %s (bypass=%s)", story_id, bypass)
