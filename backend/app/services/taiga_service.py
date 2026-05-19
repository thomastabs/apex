"""Taiga operations used by the FastAPI backend."""

from src import taiga_adapter


class TaigaService:
    def login(self, username: str, password: str) -> str:
        taiga_adapter.login(username, password)
        return taiga_adapter.get_current_token()

    def set_token(self, token: str) -> None:
        taiga_adapter.set_token(token)

    def set_context(self, token: str, project_id: int) -> None:
        taiga_adapter.set_token(token)
        taiga_adapter.set_active_project(project_id)

    def get_epics(self) -> list[dict]:
        return taiga_adapter.get_epics()

    def get_projects(self) -> list[dict]:
        return taiga_adapter.get_projects()

    def create_project(self, name: str, description: str) -> dict:
        return taiga_adapter.create_project(name, description)

    def delete_project(self, project_id: int) -> None:
        taiga_adapter.delete_project(project_id)

    def get_me(self) -> dict:
        return taiga_adapter.get_me()

    def get_epic(self, epic_id: int) -> dict:
        return taiga_adapter.get_epic(epic_id)

    def create_epic(self, subject: str, description: str, *, tags: list[str] | None = None) -> dict:
        return taiga_adapter.create_epic(subject, description, tags=tags or [])

    def get_story_statuses(self) -> list[dict]:
        return taiga_adapter.get_story_statuses()

    def delete_epic_with_stories(self, epic_id: int) -> dict:
        return taiga_adapter.delete_epic_with_stories(epic_id)

    def find_ready_status_id(self) -> int | None:
        return taiga_adapter.find_status_id("Ready for Discovery")

    def find_design_locked_status_id(self) -> int | None:
        for fragment in ("design_locked", "Design Locked", "Ready for Implementation"):
            status_id = taiga_adapter.find_status_id(fragment)
            if status_id:
                return status_id
        return None

    def create_story(
        self,
        subject: str,
        description: str,
        *,
        epic_id: int,
        tags: list[str],
        backlog_order: int,
    ) -> dict:
        return taiga_adapter.create_story(
            subject,
            description,
            epic_id=epic_id,
            tags=tags,
            backlog_order=backlog_order,
        )

    def delete_story(self, story_id: int) -> None:
        taiga_adapter.delete_story(story_id)

    def update_story_status(self, story_id: int, status_id: int, version: int) -> dict:
        return taiga_adapter.update_story_status(story_id, status_id, version)

    def update_story_fields(
        self,
        story_id: int,
        version: int,
        *,
        tags: list[str] | None = None,
        status_id: int | None = None,
    ) -> dict:
        return taiga_adapter.update_story(
            story_id,
            version,
            tags=tags,
            status_id=status_id,
        )

    def get_story(self, story_id: int) -> dict:
        return taiga_adapter.get_story(story_id)

    def get_stories_for_epic(self, epic_id: int) -> list[dict]:
        return taiga_adapter.get_stories_for_epic(epic_id)

    def get_memberships(self) -> list[dict]:
        return taiga_adapter.get_memberships()

    def get_roles(self) -> list[dict]:
        return taiga_adapter.get_roles()

    def invite_member(self, username_or_email: str, role_id: int) -> dict:
        return taiga_adapter.invite_member(username_or_email, role_id)

    def get_story_url(self, story_ref: int | None) -> str | None:
        return taiga_adapter.get_story_url(story_ref)

    def update_epic_fields(
        self,
        epic_id: int,
        version: int,
        *,
        subject: str | None = None,
        description: str | None = None,
        tags: list[str] | None = None,
    ) -> dict:
        return taiga_adapter.update_epic(epic_id, version, subject=subject, description=description, tags=tags)

    def update_story_subject(
        self,
        story_id: int,
        version: int,
        *,
        subject: str | None = None,
        description: str | None = None,
        tags: list[str] | None = None,
    ) -> dict:
        return taiga_adapter.update_story(story_id, version, subject=subject, description=description, tags=tags)

    def remove_member(self, membership_id: int) -> None:
        taiga_adapter.delete_membership(membership_id)

    def update_membership_role(self, membership_id: int, role_id: int) -> dict:
        return taiga_adapter.update_membership_role(membership_id, role_id)
