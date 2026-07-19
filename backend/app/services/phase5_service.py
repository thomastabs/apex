"""Phase 5 Deployment Gate workflow service.

Implements the framework's "Deployment & Release" playbook as a governance
layer: infra delta check → deploy pack or routine bypass → human-gated
deployment decision. The default gate records artifacts and decisions; the
opt-in GitHub Actions path can dispatch an existing workflow and only marks a
story deployed after a matching successful run.
"""

import hashlib
import json
import logging

from backend.app.services.ai_service import AiService
from backend.app.services.ai_grounding import extra_context_block
from backend.app.services.context_service import ContextService
from backend.app.services.github_actions import GithubActionsClient, GithubActionsError, utc_now_iso
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

    def generate_infra_delta(
        self, ctx: RequestContext, story_id: int,
        extra_context_files: list[str] | None = None,
    ) -> dict:
        self.configure_request(ctx)
        entry = self._eligible_entry(story_id)
        story_title = entry.get("title", f"Story {story_id}")
        gherkin = self.context.story_gherkin(story_id)
        if not gherkin.strip():
            raise Phase5ValidationError(f"Story {story_id} has no Gherkin content.")
        github_context = self.context.read_context_file("github-context.md")
        try:
            github_context += extra_context_block(self.context, extra_context_files)
        except ValueError as exc:
            raise Phase5ValidationError(str(exc)) from exc
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

    def generate_deploy_pack(
        self, ctx: RequestContext, story_id: int, options=None,
        extra_context_files: list[str] | None = None,
    ) -> str:
        self.configure_request(ctx)
        entry = self._eligible_entry(story_id)
        delta = self._require_delta_with_changes(story_id)
        github_context = self.context.read_context_file("github-context.md")
        try:
            github_context += extra_context_block(self.context, extra_context_files)
        except ValueError as exc:
            raise Phase5ValidationError(str(exc)) from exc
        return self.ai.generate_deploy_pack(
            entry.get("title", f"Story {story_id}"),
            self.context.render_infra_delta_md(story_id, delta),
            self.context.story_technical_spec(story_id),
            tech_stack=self.context.read_tech_stack(),
            github_context=github_context,
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
        # Backward trace: an uncovered/untested scenario in the matrix points back
        # at its Gherkin (Phase 1). Set/clear the story's trace_flag accordingly.
        from src import ai_engine

        summary = ai_engine.summarize_trace(ai_engine.trace_targets_from_matrix(matrix))
        if summary:
            self.context.set_trace_flag(story_id, summary["phase"], summary["reason"])
        else:
            self.context.clear_trace_flag(story_id)

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

    # ── GitHub Actions deployment automation ────────────────────────────────

    def _github_client(self) -> GithubActionsClient:
        return GithubActionsClient(self.context.github_pat(), self.context.github_repo())

    def _deploy_pack_hash(self, story_id: int) -> str:
        pack = self.context.load_deploy_pack(story_id)
        if pack.strip():
            content = pack
        else:
            delta = self.context.load_infra_delta(story_id) or {}
            content = json.dumps(delta, sort_keys=True)
        return f"sha256:{hashlib.sha256(content.encode('utf-8')).hexdigest()}"

    @staticmethod
    def _deployment_from_entry(entry: dict) -> dict:
        deployment = entry.get("deployment")
        return deployment if isinstance(deployment, dict) else {}

    def save_github_deployment_config(self, ctx: RequestContext, config: dict) -> dict:
        self.configure_request(ctx)
        return self.context.save_deployment_config(config)

    def github_deployment_status(self, ctx: RequestContext, story_id: int | None = None) -> dict:
        self.configure_request(ctx)
        config = self.context.deployment_config()
        repo = self.context.github_repo().strip()
        pat_configured = self.context.has_github_pat()
        workflows: list[dict] = []
        workflow = None
        error = ""
        if repo and pat_configured:
            try:
                client = self._github_client()
                workflows = client.list_workflows()
                if config.get("workflow_id"):
                    workflow = client.workflow(config["workflow_id"])
            except GithubActionsError as exc:
                error = str(exc)
        latest = None
        if story_id is not None:
            entry = (self.context.story_index().get(str(story_id)) or {})
            latest = self._deployment_from_entry(entry) or None
        return {
            "github_connected": bool(repo and pat_configured),
            "repo": repo,
            "config": config,
            "workflow_configured": bool(config.get("workflow_id")),
            "workflow_exists": workflow is not None,
            "workflow": workflow,
            "workflows": workflows,
            "latest_run": latest,
            "error": error,
        }

    def dispatch_github_deployment(self, ctx: RequestContext, story_id: int, *, confirmed: bool) -> dict:
        self.configure_request(ctx)
        if not confirmed:
            raise Phase5ValidationError("Confirm before triggering a real GitHub Actions deployment.")
        entry = self._eligible_entry(story_id)
        delta = self.context.load_infra_delta(story_id)
        if delta is None:
            raise Phase5ValidationError(f"Run and save the infra delta check for story {story_id} before deploying.")
        bypass = not delta.get("needs_infra_change")
        pack = self.context.load_deploy_pack(story_id)
        if not bypass and not pack.strip():
            raise Phase5ValidationError("A saved deploy pack is required before dispatching a deployment workflow.")
        config = self.context.deployment_config()
        workflow_id = str(config.get("workflow_id", "") or "").strip()
        if not workflow_id:
            raise Phase5ValidationError("Configure a GitHub Actions workflow before dispatching deployment.")
        ref = str(config.get("ref", "") or "").strip() or "main"
        environment = str(config.get("environment", "") or "").strip()
        deploy_hash = self._deploy_pack_hash(story_id)
        inputs = dict(config.get("inputs") or {})
        if environment and "environment" not in inputs:
            inputs["environment"] = environment
        if config.get("include_apex_inputs"):
            inputs.update({
                "story_id": str(story_id),
                "apex_project_id": str(ctx.project_id),
                "deploy_pack_hash": deploy_hash,
            })
        client = self._github_client()
        workflow = client.workflow(workflow_id)
        if workflow is None:
            raise Phase5ValidationError("Configured GitHub Actions workflow was not found.")
        dispatched_at = utc_now_iso()
        client.dispatch(workflow_id, ref=ref, inputs=inputs)
        run = self._latest_dispatch_run(client, workflow_id, ref=ref)
        deployment = {
            "status": (run or {}).get("status") or "queued",
            "conclusion": (run or {}).get("conclusion") or "",
            "workflow_id": workflow_id,
            "workflow_name": workflow.get("name") or "",
            "run_id": (run or {}).get("id"),
            "run_url": (run or {}).get("html_url") or "",
            "ref": ref,
            "environment": environment,
            "deploy_pack_hash": deploy_hash,
            "dispatched_at": dispatched_at,
            "completed_at": "",
        }
        self.context.upsert_story_index(story_id, deployment=deployment)
        self.context.append_github_deployment_record(
            story_id,
            entry.get("title", f"Story {story_id}"),
            workflow_id=workflow_id,
            run_id=deployment.get("run_id"),
            run_url=deployment.get("run_url", ""),
            ref=ref,
            environment=environment,
            status=deployment["status"],
            conclusion=deployment["conclusion"],
            deploy_pack_hash=deploy_hash,
            notes="Dispatched from Phase 5 Approve & Deploy.",
        )
        return deployment

    def _latest_dispatch_run(self, client: GithubActionsClient, workflow_id: str, *, ref: str) -> dict | None:
        runs = client.list_runs(workflow_id, branch=ref, event="workflow_dispatch", per_page=10)
        return runs[0] if runs else None

    def sync_github_deployment_run(self, ctx: RequestContext, story_id: int, run_id: int | None = None) -> dict:
        self.configure_request(ctx)
        entry = self.context.story_index().get(str(story_id)) or {}
        deployment = self._deployment_from_entry(entry)
        selected_run_id = run_id or deployment.get("run_id")
        if not selected_run_id:
            config = self.context.deployment_config()
            workflow_id = str(deployment.get("workflow_id") or config.get("workflow_id") or "")
            if not workflow_id:
                raise Phase5ValidationError("No GitHub Actions run is associated with this story.")
            run = self._latest_dispatch_run(self._github_client(), workflow_id, ref=str(deployment.get("ref") or config.get("ref") or "main"))
            if run and run.get("id"):
                deployment = {
                    **deployment,
                    "run_id": run.get("id"),
                    "run_url": run.get("html_url") or deployment.get("run_url", ""),
                    "status": run.get("status") or deployment.get("status") or "",
                    "conclusion": run.get("conclusion") or deployment.get("conclusion") or "",
                }
                self.context.upsert_story_index(story_id, deployment=deployment)
                run = self._github_client().run(run.get("id")) or run
        else:
            run = self._github_client().run(selected_run_id)
        if not run:
            raise Phase5ValidationError("GitHub Actions run was not found.")
        return self.record_github_deployment_run(ctx, run)

    def record_github_deployment_run(self, ctx: RequestContext, run: dict) -> dict:
        self.configure_request(ctx)
        run_id = run.get("id")
        if not run_id:
            raise Phase5ValidationError("GitHub workflow_run payload did not include a run id.")
        index = self.context.story_index()
        matched_story_id = None
        matched_entry: dict = {}
        for raw_id, entry in index.items():
            deployment = self._deployment_from_entry(entry)
            if deployment.get("run_id") and int(deployment.get("run_id")) == int(run_id):
                matched_story_id = int(raw_id)
                matched_entry = entry
                break
        if matched_story_id is None:
            return {"matched": False, "run_id": run_id}
        deployment = dict(self._deployment_from_entry(matched_entry))
        status_value = str(run.get("status") or deployment.get("status") or "")
        conclusion = str(run.get("conclusion") or "")
        deployment.update({
            "status": status_value,
            "conclusion": conclusion,
            "run_id": run_id,
            "run_url": run.get("html_url") or deployment.get("run_url", ""),
            "completed_at": run.get("updated_at") or run.get("run_updated_at") or (utc_now_iso() if status_value == "completed" else ""),
        })
        updates = {"deployment": deployment}
        if status_value == "completed" and conclusion == "success":
            updates["phase_status"] = "deployed"
        self.context.upsert_story_index(matched_story_id, **updates)
        self.context.append_github_deployment_record(
            matched_story_id,
            matched_entry.get("title", f"Story {matched_story_id}"),
            workflow_id=str(deployment.get("workflow_id") or run.get("workflow_id") or ""),
            run_id=int(run_id),
            run_url=deployment.get("run_url", ""),
            ref=deployment.get("ref", ""),
            environment=deployment.get("environment", ""),
            status=status_value,
            conclusion=conclusion,
            deploy_pack_hash=deployment.get("deploy_pack_hash", ""),
            notes="Workflow completion recorded by GitHub webhook." if status_value == "completed" else "Workflow status synced.",
        )
        return {"matched": True, "story_id": matched_story_id, "deployment": deployment}
