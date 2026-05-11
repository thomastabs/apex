"""board.py — Epics & Stories board state."""

import reflex as rx

from src import taiga_adapter
from apex.state.project import ProjectState


class BoardState(ProjectState):
    board_epics: list[dict] = []
    board_stories: dict = {}  # str(epic_id) → list[dict]
    board_loading: bool = False
    board_error: str = ""
    expanded_epics: list[int] = []

    # Dialog open flags
    epic_details_open: bool = False
    story_details_open: bool = False
    create_epic_open: bool = False
    create_story_open: bool = False
    selected_epic_id: int = 0
    selected_story_id: int = 0
    selected_epic_data: dict = {}
    selected_story_data: dict = {}

    @rx.event
    async def load_epics(self):
        self._sync_token()
        self.board_loading = True
        self.board_error = ""
        yield
        try:
            self.board_epics = taiga_adapter.get_epics()
        except taiga_adapter.TaigaAPIError as exc:
            self.board_error = str(exc)
        finally:
            self.board_loading = False

    @rx.event
    async def load_stories_for_epic(self, epic_id: int):
        self._sync_token()
        yield
        try:
            stories = taiga_adapter.get_stories_for_epic(epic_id)
            self.board_stories[str(epic_id)] = stories
        except taiga_adapter.TaigaAPIError:
            self.board_stories[str(epic_id)] = []

    @rx.event
    def toggle_epic(self, epic_id: int):
        if epic_id in self.expanded_epics:
            self.expanded_epics = [e for e in self.expanded_epics if e != epic_id]
        else:
            self.expanded_epics = self.expanded_epics + [epic_id]

    @rx.event
    def open_epic_details(self, epic_id: int):
        self._sync_token()
        self.selected_epic_id = epic_id
        try:
            self.selected_epic_data = taiga_adapter.get_epic(epic_id)
        except Exception:
            self.selected_epic_data = {}
        self.epic_details_open = True

    @rx.event
    def open_story_details(self, story_id: int):
        self._sync_token()
        self.selected_story_id = story_id
        try:
            self.selected_story_data = taiga_adapter.get_story(story_id)
        except Exception:
            self.selected_story_data = {}
        self.story_details_open = True

    @rx.event
    def close_epic_details(self):
        self.epic_details_open = False

    @rx.event
    def close_story_details(self):
        self.story_details_open = False

    @rx.event
    def open_create_epic(self):
        self.create_epic_open = True

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
            yield BoardState.load_stories_for_epic(self.selected_epic_id)
        except taiga_adapter.TaigaAPIError:
            pass

    @rx.event
    async def delete_epic(self, epic_id: int):
        self._sync_token()
        try:
            taiga_adapter.delete_epic_with_stories(epic_id)
            yield BoardState.load_epics
        except taiga_adapter.TaigaAPIError:
            pass

    @rx.event
    async def delete_story(self, story_id: int, epic_id: int):
        self._sync_token()
        try:
            taiga_adapter.delete_story(story_id)
            yield BoardState.load_stories_for_epic(epic_id)
        except taiga_adapter.TaigaAPIError:
            pass
