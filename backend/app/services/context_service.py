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

    def write_project_design_bundle(
        self,
        wireframes: str,
        user_flow: str,
        component_tree: str,
        tech_spec: str,
    ) -> None:
        context_manager.write_project_design_bundle(wireframes, user_flow, component_tree, tech_spec)

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

