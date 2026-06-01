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

