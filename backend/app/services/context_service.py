"""Context-file operations used by the FastAPI backend."""

from src import context_manager


class ContextService:
    def set_project(self, project_id: int) -> None:
        context_manager.set_active_project(project_id)

    def set_active_instance(self, instance_id: str) -> None:
        context_manager.set_active_instance(instance_id)

    def active_instance_id(self) -> str:
        return context_manager.get_active_instance_id()

    def active_project_id(self) -> int | None:
        return context_manager.get_active_project_id()

    def append_usage_event(self, event: dict) -> None:
        context_manager.append_usage_event(event)

    def spec_version(self, filename: str) -> str:
        return context_manager.get_spec_version(filename)

    def github_webhook_secret(self) -> str:
        return context_manager.get_or_create_instance_github_webhook_secret()

    def github_repo(self) -> str:
        return context_manager.get_project_github_repo()

    def save_github_repo(self, repo: str | None) -> None:
        context_manager.save_project_github_repo(repo)

    def save_github_pat(self, pat: str | None) -> None:
        context_manager.save_project_github_pat(pat)

    def github_pat(self) -> str:
        return context_manager.get_project_github_pat()

    def has_github_pat(self) -> bool:
        return context_manager.has_project_github_pat()

    def github_pack_config(self) -> dict:
        return context_manager.get_project_github_pack_config()

    def save_github_pack_config(
        self,
        *,
        pack_detail_mode: str | None = None,
        pack_max_tokens: int | None = None,
        pack_extra_ignore: str | None = None,
    ) -> None:
        context_manager.save_project_github_pack_config(
            pack_detail_mode=pack_detail_mode,
            pack_max_tokens=pack_max_tokens,
            pack_extra_ignore=pack_extra_ignore,
        )

    def save_figma_token(self, token: str | None) -> None:
        context_manager.save_instance_figma_token(token)

    def figma_token(self) -> str:
        return context_manager.get_instance_figma_token()

    def has_figma_token(self) -> bool:
        return context_manager.has_instance_figma_token()

    def record_github_push(self) -> None:
        context_manager.record_github_push()

    def last_github_push(self) -> str | None:
        return context_manager.get_last_github_push()

    def load_usage_events(self, days: int = 30) -> list[dict]:
        return context_manager.load_usage_events(days)

    def set_active(self, ctx) -> None:
        """Set both the PM-instance namespace and the project from a RequestContext.

        Storage is scoped to contextspec/<instance_id>/<project_id>/, so every
        request-handling path must set the instance before touching files."""
        context_manager.set_active_instance(getattr(ctx, "instance_id", "default") or "default")
        context_manager.set_active_project(ctx.project_id)

    def project_concept(self) -> str:
        return context_manager.get_project_concept()

    def init_context(self) -> None:
        context_manager.init_context()

    def read_project_concept(self) -> str:
        return context_manager.get_project_concept()

    def read_tech_stack(self) -> str:
        return context_manager.get_tech_stack_content()

    def read_context_file(self, filename: str) -> str:
        return context_manager.read_context_file(filename)

    def write_context_file(self, filename: str, content: str) -> None:
        context_manager.write_context_file(filename, content)

    def reset_context_file(self, filename: str) -> None:
        context_manager.reset_context_file(filename)

    def amend_locked_spec(self, filename: str, note: str = "") -> dict:
        return context_manager.amend_locked_spec(filename, note)

    def clear_spec_drift(self, story_id: int) -> None:
        context_manager.clear_spec_drift(story_id)

    def set_conformance_regressed(self, story_id: int, reason: str = "") -> None:
        context_manager.set_conformance_regressed(story_id, reason)

    def clear_conformance_regressed(self, story_id: int) -> None:
        context_manager.clear_conformance_regressed(story_id)

    def set_trace_flag(self, story_id: int, phase: str, reason: str = "") -> None:
        context_manager.set_trace_flag(story_id, phase, reason)

    def clear_trace_flag(self, story_id: int) -> None:
        context_manager.clear_trace_flag(story_id)

    def set_story_figma_link(
        self, story_id: int, figma_node_id: str, figma_modified: str = "",
        figma_file_key: str = "",
    ) -> None:
        context_manager.set_story_figma_link(
            story_id, figma_node_id, figma_modified, figma_file_key
        )

    def scan_figma_changes(self, current_modified: str) -> list[int]:
        return context_manager.scan_figma_changes(current_modified)

    def scan_figma_changes_multi(self, modified_by_file: dict[str, str]) -> list[int]:
        return context_manager.scan_figma_changes_multi(modified_by_file)

    def acknowledge_figma_change(
        self, story_id: int, current_modified: str = "", figma_file_key: str = "",
    ) -> None:
        context_manager.acknowledge_figma_change(
            story_id, current_modified, figma_file_key
        )

    def load_all_proposals(self) -> list[dict]:
        return context_manager.load_all_proposals()

    def append_decision_record(self, scope: str, summary: str, reason: str = "") -> None:
        context_manager.append_decision_record(scope, summary, reason)

    def get_amendments(self) -> str:
        return context_manager.get_amendments()

    # ── Phase 6 maintenance items ───────────────────────────────────────────

    def load_maintenance_items(self) -> list[dict]:
        return context_manager.load_maintenance_items()

    def get_maintenance_item(self, item_id: int) -> dict | None:
        return context_manager.get_maintenance_item(item_id)

    def create_maintenance_item(self, **kwargs) -> dict:
        return context_manager.create_maintenance_item(**kwargs)

    def update_maintenance_item(self, item_id: int, **updates) -> dict | None:
        return context_manager.update_maintenance_item(item_id, **updates)

    def delete_maintenance_item(self, item_id: int) -> bool:
        return context_manager.delete_maintenance_item(item_id)

    def append_maintenance_log(self, item_id: int, subject: str, event: str, detail: str = "") -> None:
        context_manager.append_maintenance_log(item_id, subject, event, detail)

    def get_maintenance_log(self) -> str:
        return context_manager.get_maintenance_log()

    def context_sizes(self) -> dict[str, int]:
        return context_manager.get_context_sizes()

    def write_tech_stack(self, tech_stack: str) -> None:
        context_manager.write_tech_stack(tech_stack)

    def story_index(self) -> dict[str, dict]:
        return context_manager.get_story_index()

    def save_autopilot_job(self, snapshot: dict) -> None:
        context_manager.save_autopilot_job(snapshot)

    def load_autopilot_job(self) -> dict | None:
        return context_manager.load_autopilot_job()

    def delete_autopilot_job(self) -> None:
        context_manager.delete_autopilot_job()

    def load_autopilot_job_history(self) -> list[dict]:
        return context_manager.load_autopilot_job_history()

    def story_gherkin(self, story_id: int) -> str:
        return context_manager.get_story_gherkin(story_id)

    def write_project_design_bundle(self, ux_brief: str) -> None:
        context_manager.write_project_design_bundle(ux_brief)

    def read_project_design_bundle(self) -> dict[str, str]:
        return context_manager.read_project_design_bundle()

    def write_project_technical_spec(self, story_ids: list[int], endpoints: str, data_model: str) -> None:
        context_manager.write_project_technical_spec(story_ids, endpoints, data_model)

    def append_design_delta(
        self,
        story_ids: list[int],
        ux_brief_addendum: str,
        endpoints_delta: str,
        data_model_delta: str,
    ) -> dict:
        return context_manager.append_design_delta(
            story_ids, ux_brief_addendum, endpoints_delta, data_model_delta,
        )

    def record_amendment(self, filename: str, note: str, story_ids: list[int]) -> None:
        context_manager.record_amendment(filename, note, story_ids)

    def affected_stories_for_spec(self, filename: str) -> list[int]:
        return context_manager.affected_stories_for_spec(filename)

    def append_gherkin(
        self,
        story_id: int,
        story_title: str,
        gherkin: str,
        *,
        epic_id: int,
        epic_title: str,
    ) -> None:
        context_manager.append_gherkin(
            story_id,
            story_title,
            gherkin,
            epic_id=epic_id,
            epic_title=epic_title,
        )

    def append_epic_technical_spec(
        self,
        epic_id: int,
        epic_title: str,
        story_ids: list[int],
        spec: str,
    ) -> None:
        context_manager.append_epic_technical_spec(epic_id, epic_title, story_ids, spec)

    def story_technical_spec(self, story_id: int) -> str:
        return context_manager.get_story_technical_spec(story_id)

    def story_design_bundle(self, story_id: int) -> str:
        return context_manager.get_story_design_bundle(story_id)

    def save_proposal(self, story_id: int, task_id: int, proposal_md: str) -> None:
        context_manager.save_proposal(story_id, task_id, proposal_md)

    def proposal_exists(self, story_id: int, task_id: int) -> bool:
        return context_manager.proposal_exists(story_id, task_id)

    def load_proposals(self, story_id: int) -> list[dict]:
        return context_manager.load_proposals(story_id)

    def save_er_diagram(self, diagram: dict) -> None:
        context_manager.save_er_diagram(diagram)

    def load_er_diagram(self) -> dict | None:
        return context_manager.load_er_diagram()

    def save_trace_layout(self, layout: dict) -> None:
        context_manager.save_trace_layout(layout)

    def load_trace_layout(self) -> dict:
        return context_manager.load_trace_layout()

    def save_screen_flow(self, diagram: dict) -> None:
        context_manager.save_screen_flow(diagram)

    def load_screen_flow(self) -> dict | None:
        return context_manager.load_screen_flow()

    def upsert_story_index(self, story_id: int, **updates) -> None:
        context_manager.upsert_story_index(story_id, **updates)

    def load_bdd_tests(self, story_id: int) -> str:
        return context_manager.load_bdd_tests(story_id)

    def delete_bdd_tests(self, story_id: int) -> None:
        context_manager.delete_bdd_tests(story_id)

    def delete_proposal(self, story_id: int, task_id: int) -> None:
        context_manager.delete_proposal(story_id, task_id)

    def list_all_proposals(self) -> list[dict]:
        return context_manager.list_all_proposals()

    def save_bug_report(self, story_id: int, bug_md: str) -> None:
        context_manager.save_bug_report(story_id, bug_md)

    def load_bug_report(self, story_id: int) -> str:
        return context_manager.load_bug_report(story_id)

    def delete_bug_report(self, story_id: int) -> None:
        context_manager.delete_bug_report(story_id)

    def list_all_bug_reports(self) -> list[dict]:
        return context_manager.list_all_bug_reports()

    def get_fix_log(self) -> str:
        return context_manager.get_fix_log()

    def save_infra_delta(self, story_id: int, delta: dict) -> None:
        context_manager.save_infra_delta(story_id, delta)

    def load_infra_delta(self, story_id: int) -> dict | None:
        return context_manager.load_infra_delta(story_id)

    def save_deploy_pack(self, story_id: int, pack_md: str) -> None:
        context_manager.save_deploy_pack(story_id, pack_md)

    def load_deploy_pack(self, story_id: int) -> str:
        return context_manager.load_deploy_pack(story_id)

    def delete_deploy_pack(self, story_id: int) -> None:
        context_manager.delete_deploy_pack(story_id)

    def list_all_deploy_packs(self) -> list[dict]:
        return context_manager.list_all_deploy_packs()

    def load_qa_results(self, story_id: int) -> dict | None:
        return context_manager.load_qa_results(story_id)

    def save_verification(self, story_id: int, data: dict) -> None:
        context_manager.save_verification(story_id, data)

    def load_verification(self, story_id: int) -> dict | None:
        return context_manager.load_verification(story_id)

    def save_conformance(self, story_id: int, data: dict) -> None:
        context_manager.save_conformance(story_id, data)

    def load_conformance(self, story_id: int) -> dict | None:
        return context_manager.load_conformance(story_id)

    def append_deployment_record(
        self,
        story_id: int,
        title: str,
        *,
        bypass: bool,
        pack_present: bool,
        sign_offs: list[str],
        notes: str = "",
    ) -> None:
        context_manager.append_deployment_record(
            story_id, title,
            bypass=bypass, pack_present=pack_present,
            sign_offs=sign_offs, notes=notes,
        )

    def append_epic_design_bundle(
        self,
        epic_id: int,
        epic_title: str,
        wireframes: str,
        user_flow: str,
        component_tree: str,
        tech_spec: str,
    ) -> None:
        context_manager.append_epic_design_bundle(
            epic_id,
            epic_title,
            wireframes,
            user_flow,
            component_tree,
            tech_spec,
        )

    # ── Phase 4/5 artifacts ─────────────────────────────────────────────────

    def save_bdd_tests(self, story_id: int, test_script: str) -> None:
        context_manager.save_bdd_tests(story_id, test_script)

    def save_qa_results(self, story_id: int, gate: str, results: list[dict]) -> None:
        context_manager.save_qa_results(story_id, gate, results)

    def increment_story_counter(self, story_id: int, field: str = "fix_bolt_count") -> int:
        return context_manager.increment_story_counter(story_id, field)

    def append_fix_log_record(
        self, issue_id: int, root_cause: str, resolution_summary: str
    ) -> None:
        context_manager.append_fix_log_record(issue_id, root_cause, resolution_summary)

    def render_infra_delta_md(self, story_id: int, delta: dict) -> str:
        return context_manager.render_infra_delta_md(story_id, delta)

    # ── Story index maintenance ─────────────────────────────────────────────

    def rebuild_story_index(self) -> None:
        context_manager.rebuild_story_index()

    def remove_epic_from_story_index(self, epic_id: int) -> None:
        context_manager.remove_epic_from_story_index(epic_id)

    def remove_story_index_entries(self, story_ids: list[int]) -> None:
        context_manager.remove_story_index_entries(story_ids)

    def clear_story_index(self) -> None:
        context_manager.clear_story_index()

    def file_path(self, filename: str):
        return context_manager.get_file_path(filename)

    def reset_cache(self) -> None:
        context_manager.reset_cache()

