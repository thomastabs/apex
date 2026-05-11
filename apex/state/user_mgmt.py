"""user_mgmt.py — Users & Roles management state."""

import reflex as rx

from src import taiga_adapter
from apex.state.project import ProjectState


class UserMgmtState(ProjectState):
    members: list[dict] = []
    roles: list[dict] = []
    members_loading: bool = False
    members_error: str = ""
    invite_error: str = ""
    invite_success: str = ""

    @rx.event
    async def load_members(self):
        self._sync_token()
        self.members_loading = True
        self.members_error = ""
        yield
        try:
            self.members = taiga_adapter.get_memberships()
            self.roles = taiga_adapter.get_roles()
        except taiga_adapter.TaigaAPIError as exc:
            self.members_error = str(exc)
        finally:
            self.members_loading = False

    @rx.event
    async def update_role(self, membership_id: int, role_id: int):
        self._sync_token()
        try:
            taiga_adapter.update_membership_role(membership_id, role_id)
            yield UserMgmtState.load_members
        except taiga_adapter.TaigaAPIError as exc:
            self.members_error = str(exc)

    @rx.event
    async def remove_member(self, membership_id: int):
        self._sync_token()
        try:
            taiga_adapter.delete_membership(membership_id)
            yield UserMgmtState.load_members
        except taiga_adapter.TaigaAPIError as exc:
            self.members_error = str(exc)

    @rx.event
    async def invite_member(self, form_data: dict):
        self._sync_token()
        username_or_email = (form_data.get("username_or_email") or "").strip()
        role_id = int(form_data.get("role_id") or 0)
        self.invite_error = ""
        self.invite_success = ""
        if not username_or_email or not role_id:
            self.invite_error = "Username/email and role are required."
            return
        try:
            taiga_adapter.invite_member(username_or_email, role_id)
            self.invite_success = f"Invited {username_or_email}."
            yield UserMgmtState.load_members
        except taiga_adapter.TaigaAPIError as exc:
            self.invite_error = str(exc)
