"""project.py — Active Taiga project state."""

import reflex as rx

from src import context_manager, taiga_adapter
from state.auth import AuthState


class ProjectState(AuthState):
    active_project_id: int = 0
    projects_list: list[dict] = []
    projects_loading: bool = False
    projects_error: str = ""
    project_name: str = ""
    @rx.event
    def load_project_config(self):
        """Restore active project from persisted config (called on_load)."""
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
                pass

    @rx.event
    async def load_projects(self):
        self._sync_token()
        self.projects_loading = True
        self.projects_error = ""
        yield
        try:
            self.projects_list = taiga_adapter.get_projects()
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
