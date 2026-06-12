"""Context-file operations used by the FastAPI backend."""

from src import context_manager


class ContextService:
    def set_project(self, project_id: int) -> None:
        context_manager.set_active_project(project_id)

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

    def context_sizes(self) -> dict[str, int]:
        return context_manager.get_context_sizes()

    def write_tech_stack(self, tech_stack: str) -> None:
        context_manager.write_tech_stack(tech_stack)

    def story_index(self) -> dict[str, dict]:
        return context_manager.get_story_index()

    def story_gherkin(self, story_id: int) -> str:
        return context_manager.get_story_gherkin(story_id)

    def write_project_design_bundle(self, ux_brief: str, endpoints: str, data_model: str) -> None:
        context_manager.write_project_design_bundle(ux_brief, endpoints, data_model)

    def write_project_technical_spec(self, story_ids: list[int], spec: str) -> None:
        context_manager.write_project_technical_spec(story_ids, spec)

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

    def save_infra_delta(self, story_id: int, delta: dict) -> None:
        context_manager.save_infra_delta(story_id, delta)

    def load_infra_delta(self, story_id: int) -> dict | None:
        return context_manager.load_infra_delta(story_id)

    def save_deploy_pack(self, story_id: int, pack_md: str) -> None:
        context_manager.save_deploy_pack(story_id, pack_md)

    def load_deploy_pack(self, story_id: int) -> str:
        return context_manager.load_deploy_pack(story_id)

    def load_qa_results(self, story_id: int) -> dict | None:
        return context_manager.load_qa_results(story_id)

    def save_verification(self, story_id: int, data: dict) -> None:
        context_manager.save_verification(story_id, data)

    def load_verification(self, story_id: int) -> dict | None:
        return context_manager.load_verification(story_id)

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

