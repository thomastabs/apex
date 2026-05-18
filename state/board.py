"""board.py — Epics & Stories board state."""

import reflex as rx

from src import context_manager, taiga_adapter
from state.project import ProjectState


class BoardState(ProjectState):
    board_epics: list[dict] = []
    expanded_stories: list[dict] = []  # stories for the currently expanded epic
    expanded_epic_id: int = 0          # 0 = none expanded
    board_loading: bool = False
    board_error: str = ""
    _board_loaded: bool = False        # True after first successful fetch
    _board_project_id: int = 0         # Project ID of last successful fetch

    # Dialog open flags
    epic_details_open: bool = False
    story_details_open: bool = False
    create_epic_open: bool = False
    create_story_open: bool = False
    selected_epic_id: int = 0
    selected_story_id: int = 0
    selected_epic_data: dict = {}
    selected_story_data: dict = {}

    # Editable fields for detail dialogs
    edit_epic_subject: str = ""
    edit_epic_description: str = ""
    edit_epic_tags: str = ""       # comma-separated for simplicity
    edit_story_subject: str = ""
    edit_story_description: str = ""
    edit_story_tags: str = ""
    detail_save_error: str = ""
    detail_save_success: str = ""

    @rx.event
    async def load_epics(self):
        self._sync_token()
        if not self.is_authenticated or not self.has_project:
            return
        # Invalidate if project changed since last fetch
        if self.active_project_id != self._board_project_id:
            self._board_loaded = False
            self.expanded_epic_id = 0
            self.expanded_stories = []
        # First load: show spinner and clear list.
        # Subsequent loads (SPA nav): refresh silently — keep existing list visible.
        if not self._board_loaded:
            self.board_loading = True
            self.board_epics = []
        self.board_error = ""
        yield
        try:
            self.board_epics = taiga_adapter.get_epics()
            self._board_loaded = True
            self._board_project_id = self.active_project_id
        except taiga_adapter.TaigaAPIError as exc:
            self.board_error = str(exc)
        finally:
            self.board_loading = False

    @rx.event
    async def reload_board_manual(self):
        self._sync_token()
        if not self.is_authenticated or not self.has_project:
            return
        self.board_loading = True
        self.board_epics = []
        self.board_error = ""
        yield
        try:
            self.board_epics = taiga_adapter.get_epics()
            self._board_loaded = True
            self._board_project_id = self.active_project_id
            yield rx.toast.info("Board refreshed")
        except taiga_adapter.TaigaAPIError as exc:
            self.board_error = str(exc)
        finally:
            self.board_loading = False

    @rx.event
    def invalidate_board(self):
        """Call when project changes to force a full reload next time."""
        self._board_loaded = False
        self.board_epics = []
        self.expanded_epic_id = 0
        self.expanded_stories = []

    @rx.event
    async def toggle_epic(self, epic_id: int):
        if self.expanded_epic_id == epic_id:
            self.expanded_epic_id = 0
            self.expanded_stories = []
        else:
            self.expanded_epic_id = epic_id
            self.expanded_stories = []
            yield BoardState.load_expanded_stories(epic_id)

    @rx.event
    async def load_expanded_stories(self, epic_id: int):
        self._sync_token()
        yield
        try:
            self.expanded_stories = taiga_adapter.get_stories_for_epic(epic_id)
        except taiga_adapter.TaigaAPIError:
            self.expanded_stories = []

    @rx.event
    def open_epic_details(self, epic_id: int):
        self._sync_token()
        self.selected_epic_id = epic_id
        self.detail_save_error = ""
        self.detail_save_success = ""
        try:
            data = taiga_adapter.get_epic(epic_id)
            self.selected_epic_data = data
            self.edit_epic_subject = data.get("subject", "")
            self.edit_epic_description = data.get("description", "")
            self.edit_epic_tags = ", ".join(data.get("tags", []))
        except Exception:
            self.selected_epic_data = {}
        self.epic_details_open = True

    @rx.event
    def open_story_details(self, story_id: int):
        self._sync_token()
        self.selected_story_id = story_id
        self.detail_save_error = ""
        self.detail_save_success = ""
        try:
            data = taiga_adapter.get_story(story_id)
            self.selected_story_data = data
            self.edit_story_subject = data.get("subject", "")
            self.edit_story_description = data.get("description", "")
            self.edit_story_tags = ", ".join(data.get("tags", []))
        except Exception:
            self.selected_story_data = {}
        self.story_details_open = True

    @rx.event
    def set_edit_epic_subject(self, v: str):
        self.edit_epic_subject = v

    @rx.event
    def set_edit_epic_description(self, v: str):
        self.edit_epic_description = v

    @rx.event
    def set_edit_epic_tags(self, v: str):
        self.edit_epic_tags = v

    @rx.event
    def set_edit_story_subject(self, v: str):
        self.edit_story_subject = v

    @rx.event
    def set_edit_story_description(self, v: str):
        self.edit_story_description = v

    @rx.event
    def set_edit_story_tags(self, v: str):
        self.edit_story_tags = v

    @rx.event
    def save_epic_edits(self):
        self._sync_token()
        self.detail_save_error = ""
        self.detail_save_success = ""
        version = self.selected_epic_data.get("version")
        if not version:
            self.detail_save_error = "Missing version — reload and try again."
            return
        tags = [t.strip() for t in self.edit_epic_tags.split(",") if t.strip()]
        try:
            updated = taiga_adapter.update_epic(
                self.selected_epic_id,
                version,
                subject=self.edit_epic_subject.strip() or None,
                description=self.edit_epic_description,
                tags=tags,
            )
            self.selected_epic_data = updated
            self.detail_save_success = "Saved."
        except Exception as exc:
            self.detail_save_error = str(exc)

    @rx.event
    def save_story_edits(self):
        self._sync_token()
        self.detail_save_error = ""
        self.detail_save_success = ""
        version = self.selected_story_data.get("version")
        if not version:
            self.detail_save_error = "Missing version — reload and try again."
            return
        tags = [t.strip() for t in self.edit_story_tags.split(",") if t.strip()]
        try:
            updated = taiga_adapter.update_story(
                self.selected_story_id,
                version,
                subject=self.edit_story_subject.strip() or None,
                description=self.edit_story_description,
                tags=tags,
            )
            self.selected_story_data = updated
            self.detail_save_success = "Saved."
        except Exception as exc:
            self.detail_save_error = str(exc)

    @rx.event
    def close_epic_details(self):
        self.epic_details_open = False

    @rx.event
    def set_epic_details_open(self, value: bool):
        self.epic_details_open = value

    @rx.event
    def close_story_details(self):
        self.story_details_open = False

    @rx.event
    def set_story_details_open(self, value: bool):
        self.story_details_open = value

    @rx.event
    def open_create_epic(self):
        self.create_epic_open = True

    @rx.event
    def set_create_epic_open(self, value: bool):
        self.create_epic_open = value

    @rx.event
    def set_create_story_open(self, value: bool):
        self.create_story_open = value

    @rx.event
    def open_create_story(self, epic_id: int):
        self.selected_epic_id = epic_id
        self.create_story_open = True

    @rx.event
    async def create_epic(self, form_data: dict):
        self._sync_token()
        subject = (form_data.get("subject") or "").strip()
        description = (form_data.get("description") or "").strip()
        if not subject:
            return
        try:
            taiga_adapter.create_epic(subject, description)
            self.create_epic_open = False
            yield BoardState.load_epics
            yield rx.toast.success(f'Epic "{subject}" created')
        except taiga_adapter.TaigaAPIError:
            pass

    @rx.event
    async def create_story(self, form_data: dict):
        self._sync_token()
        subject = (form_data.get("subject") or "").strip()
        description = (form_data.get("description") or "").strip()
        if not subject:
            return
        try:
            taiga_adapter.create_story(subject, description, epic_id=self.selected_epic_id)
            self.create_story_open = False
            yield BoardState.load_expanded_stories(self.selected_epic_id)
            yield rx.toast.success(f'Story "{subject}" created')
        except taiga_adapter.TaigaAPIError:
            pass

    # ── Delete confirmation ───────────────────────────────────────────────────

    delete_confirm_open: bool = False
    delete_confirm_is_story: bool = False
    _delete_confirm_type: str = ""   # "epic" or "story"
    _delete_confirm_epic_id: int = 0
    _delete_confirm_story_id: int = 0
    _delete_confirm_story_epic_id: int = 0

    @rx.event
    def open_delete_epic_confirm(self, epic_id: int):
        self._delete_confirm_type = "epic"
        self.delete_confirm_is_story = False
        self._delete_confirm_epic_id = epic_id
        self.delete_confirm_open = True

    @rx.event
    def open_delete_story_confirm(self, story_id: int, epic_id: int):
        self._delete_confirm_type = "story"
        self.delete_confirm_is_story = True
        self._delete_confirm_story_id = story_id
        self._delete_confirm_story_epic_id = epic_id
        self.delete_confirm_open = True

    @rx.event
    def set_delete_confirm_open(self, value: bool):
        self.delete_confirm_open = value

    @rx.event
    async def confirm_delete(self):
        self.delete_confirm_open = False
        dtype = self._delete_confirm_type
        self._delete_confirm_type = ""
        self._sync_token()
        try:
            if dtype == "epic":
                epic_id = self._delete_confirm_epic_id
                self._delete_confirm_epic_id = 0
                taiga_adapter.delete_epic_with_stories(epic_id)
                context_manager.remove_epic_from_story_index(epic_id)
                if self.expanded_epic_id == epic_id:
                    self.expanded_epic_id = 0
                    self.expanded_stories = []
                yield BoardState.load_epics
                yield rx.toast.success("Epic deleted")
            elif dtype == "story":
                story_id = self._delete_confirm_story_id
                epic_id = self._delete_confirm_story_epic_id
                self._delete_confirm_story_id = 0
                self._delete_confirm_story_epic_id = 0
                taiga_adapter.delete_story(story_id)
                context_manager.remove_story_index_entries([story_id])
                yield BoardState.load_expanded_stories(epic_id)
                yield rx.toast.success("Story deleted")
        except taiga_adapter.TaigaAPIError:
            pass

    @rx.event
    async def delete_epic(self, epic_id: int):
        self._sync_token()
        try:
            taiga_adapter.delete_epic_with_stories(epic_id)
            context_manager.remove_epic_from_story_index(epic_id)
            if self.expanded_epic_id == epic_id:
                self.expanded_epic_id = 0
                self.expanded_stories = []
            yield BoardState.load_epics
        except taiga_adapter.TaigaAPIError:
            pass

    @rx.event
    async def delete_story(self, story_id: int, epic_id: int):
        self._sync_token()
        try:
            taiga_adapter.delete_story(story_id)
            context_manager.remove_story_index_entries([story_id])
            yield BoardState.load_expanded_stories(epic_id)
        except taiga_adapter.TaigaAPIError:
            pass
