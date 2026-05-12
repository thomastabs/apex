"""project.py — Active Taiga project state."""

import reflex as rx

from src import context_manager, taiga_adapter
from state.auth import AuthState


class ProjectState(AuthState):
    active_project_id: int = 0
    pending_project_id: int = 0
    projects_list: list[dict] = []
    projects_loading: bool = False
    projects_error: str = ""
    project_name: str = ""
    _projects_loaded: bool = False

    @rx.event
    def load_project_config(self):
        """Restore active project from persisted config (called on_load)."""
        if not self.is_authenticated:
            return
        cfg = context_manager.load_config()
        saved_pid = cfg.get("project_id", 0)
        if saved_pid:
            self.active_project_id = saved_pid
            self._sync_token()
            taiga_adapter.set_active_project(saved_pid)
            try:
                p = taiga_adapter.get_project()
                self.project_name = p.get("name", "")
            except Exception:
                self.active_project_id = 0

    @rx.event
    def set_pending_project(self, project_id: int):
        self.pending_project_id = project_id

    @rx.event
    async def login_and_load(self, form_data: dict):
        """Login then immediately populate the projects list."""
        async for _ in AuthState.login.fn(self, form_data):
            yield
        if not self.is_authenticated:
            return
        ProjectState.load_project_config.fn(self)
        self._sync_token()
        self.projects_loading = True
        self.projects_list = []
        self.projects_error = ""
        yield
        try:
            self.projects_list = taiga_adapter.get_projects()
            self._projects_loaded = True
        except taiga_adapter.TaigaAPIError as exc:
            self.projects_error = str(exc)
        finally:
            self.projects_loading = False

    @rx.event
    async def load_projects(self):
        if not self.is_authenticated:
            return
        self._sync_token()
        if not self._projects_loaded:
            self.projects_loading = True
            self.projects_list = []
        self.projects_error = ""
        yield
        try:
            self.projects_list = taiga_adapter.get_projects()
            self._projects_loaded = True
        except taiga_adapter.TaigaAPIError as exc:
            self.projects_error = str(exc)
        finally:
            self.projects_loading = False

    @rx.event
    def select_project(self, project_id: int):
        self._sync_token()
        self.active_project_id = project_id
        taiga_adapter.set_active_project(project_id)
        try:
            p = taiga_adapter.get_project()
            self.project_name = p.get("name", "")
        except Exception:
            self.project_name = ""

    @rx.var
    def has_project(self) -> bool:
        return self.active_project_id > 0
