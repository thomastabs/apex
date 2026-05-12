"""auth.py — Authentication state: token cookie, login, logout, theme."""

import logging

import reflex as rx

from src import taiga_adapter

_logger = logging.getLogger("apex.state.auth")


class AuthState(rx.State):
    # Persisted in browser cookie (7-day TTL)
    auth_token: str = rx.Cookie("", name="apex_session", max_age=604800)
    # Persisted in localStorage — "dark" | "light"
    theme_pref: str = rx.LocalStorage("dark", name="apex_theme")

    login_error: str = ""
    signing_in: bool = False

    taiga_username: str = ""
    taiga_email: str = ""

    def _sync_token(self) -> None:
        """Sync cookie token to module-level adapter before any API call."""
        taiga_adapter.set_token(self.auth_token)

    @rx.var
    def is_authenticated(self) -> bool:
        return bool(self.auth_token)

    @rx.var
    def theme_is_dark(self) -> bool:
        return self.theme_pref != "light"

    @rx.event
    async def login(self, form_data: dict):
        username = (form_data.get("username") or "").strip()
        password = form_data.get("password") or ""
        token_paste = (form_data.get("token") or "").strip()

        self.login_error = ""
        self.signing_in = True
        yield

        try:
            if token_paste:
                taiga_adapter.set_token(token_paste)
                me = taiga_adapter.get_me()
                self.auth_token = token_paste
            else:
                taiga_adapter.login(username, password)
                token = taiga_adapter.get_current_token()
                self.auth_token = token
                me = taiga_adapter.get_me()

            self.taiga_username = me.get("full_name") or me.get("username", "")
            self.taiga_email = me.get("email", "")
        except taiga_adapter.TaigaAPIError as exc:
            self.login_error = str(exc)
            taiga_adapter.clear_token()
        except Exception as exc:
            self.login_error = f"Unexpected error: {exc}"
            taiga_adapter.clear_token()
        finally:
            self.signing_in = False

    @rx.event
    def logout(self):
        self.auth_token = ""
        self.taiga_username = ""
        self.taiga_email = ""
        taiga_adapter.clear_token()

    @rx.event
    def toggle_theme(self):
        self.theme_pref = "light" if self.theme_pref == "dark" else "dark"

    @rx.event
    def restore_session(self):
        """Called on_load — sync persisted cookie token to adapter. Clear if invalid."""
        if self.auth_token:
            taiga_adapter.set_token(self.auth_token)
            try:
                me = taiga_adapter.get_me()
                self.taiga_username = me.get("full_name") or me.get("username", "")
                self.taiga_email = me.get("email", "")
            except Exception:
                # Token expired or invalid — force sign-out so UI shows sign-in prompt
                self.auth_token = ""
                self.taiga_username = ""
                self.taiga_email = ""
                taiga_adapter.clear_token()
