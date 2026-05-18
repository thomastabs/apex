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

    # Create project dialog
    create_project_dialog_open: bool = False
    new_project_title: str = ""
    new_project_desc: str = ""
    creating_project: bool = False
    create_project_error: str = ""
    create_project_success: str = ""

    # Delete project dialog
    delete_project_dialog_open: bool = False
    deleting_project: bool = False
    delete_project_error: str = ""

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
                # Keep project active — transient Taiga error must not eject user from project
                self.project_name = f"Project {saved_pid}"

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

    @rx.event
    def open_create_project_dialog(self):
        self.new_project_title = ""
        self.new_project_desc = ""
        self.create_project_error = ""
        self.create_project_success = ""
        self.create_project_dialog_open = True

    @rx.event
    def set_create_project_dialog_open(self, value: bool):
        self.create_project_dialog_open = value

    @rx.event
    def set_new_project_title(self, value: str):
        self.new_project_title = value
        self.create_project_error = ""
        self.create_project_success = ""

    @rx.event
    def set_new_project_desc(self, value: str):
        self.new_project_desc = value

    @rx.event
    def open_delete_project_dialog(self):
        self.delete_project_error = ""
        self.delete_project_dialog_open = True

    @rx.event
    def set_delete_project_dialog_open(self, value: bool):
        self.delete_project_dialog_open = value

    @rx.event
    async def delete_project(self):
        pid = self.active_project_id
        if not pid:
            return
        self.deleting_project = True
        self.delete_project_error = ""
        self.delete_project_dialog_open = False
        yield
        try:
            self._sync_token()
            taiga_adapter.delete_project(pid)
            self.active_project_id = 0
            self.project_name = ""
            taiga_adapter.set_active_project(0)
            self.projects_list = [p for p in self.projects_list if p.get("id") != pid]
            yield rx.toast.success("Project deleted")
        except taiga_adapter.TaigaAPIError as exc:
            self.delete_project_error = exc.user_message
        finally:
            self.deleting_project = False

    @rx.event
    async def create_project(self):
        title = self.new_project_title.strip()
        desc = self.new_project_desc.strip()
        if not title:
            self.create_project_error = "Project title is required."
            return
        self.creating_project = True
        self.create_project_error = ""
        self.create_project_success = ""
        yield
        try:
            self._sync_token()
            project = taiga_adapter.create_project(title, desc)
            self.create_project_success = f"Project \"{project.get('name', title)}\" created."
            self.new_project_title = ""
            self.new_project_desc = ""
            self.create_project_dialog_open = False
            yield ProjectState.load_projects
        except taiga_adapter.TaigaAPIError as exc:
            self.create_project_error = exc.user_message
        except Exception as exc:
            self.create_project_error = str(exc)
        finally:
            self.creating_project = False

    @rx.var
    def has_project(self) -> bool:
        return self.active_project_id > 0
