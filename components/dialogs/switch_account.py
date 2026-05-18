"""switch_account.py — Sign-in / sign-out dialog."""

import reflex as rx
from state.auth import AuthState
from state.context import ContextState
from state.phase1 import Phase1State


def switch_account_dialog() -> rx.Component:
    return rx.dialog.root(
        rx.dialog.trigger(
            rx.button(
                rx.hstack(rx.text("⇄"), rx.text("Switch Account"), spacing="1"),
                variant="soft",
                color_scheme="gray",
                size="2",
                title="Switch account",
            ),
        ),
        rx.dialog.content(
            rx.dialog.title("Switch Account"),
            rx.cond(
                AuthState.is_authenticated,
                # ── Signed-in view ─────────────────────────────────────────
                rx.vstack(
                    rx.text(
                        AuthState.taiga_username,
                        weight="bold",
                    ),
                    rx.text(AuthState.taiga_email, size="2", color_scheme="gray"),
                    rx.separator(width="100%"),
                    rx.dialog.close(
                        rx.button(
                            "Sign out",
                            color_scheme="red",
                            variant="soft",
                            on_click=Phase1State.request_logout,
                            width="100%",
                        ),
                    ),
                    spacing="3",
                    width="100%",
                ),
                # ── Sign-in form ────────────────────────────────────────────
                rx.vstack(
                    rx.tabs.root(
                        rx.tabs.list(
                            rx.tabs.trigger("Username / Password", value="credentials"),
                            rx.tabs.trigger("Auth Token", value="token"),
                        ),
                        rx.tabs.content(
                            rx.form(
                                rx.vstack(
                                    rx.input(
                                        name="username",
                                        placeholder="Username",
                                        required=True,
                                        width="100%",
                                    ),
                                    rx.input(
                                        name="password",
                                        type="password",
                                        placeholder="Password",
                                        required=True,
                                        width="100%",
                                    ),
                                    rx.button(
                                        rx.cond(
                                            AuthState.signing_in,
                                            rx.hstack(rx.spinner(size="2"), rx.text("Signing in…"), spacing="2"),
                                            rx.hstack(rx.icon("log-in", size=15), rx.text("Sign in"), spacing="2"),
                                        ),
                                        type="submit",
                                        size="2",
                                        variant="soft",
                                        color_scheme="violet",
                                        width="100%",
                                        disabled=AuthState.signing_in,
                                    ),
                                    spacing="3",
                                ),
                                on_submit=ContextState.login_and_load,
                            ),
                            value="credentials",
                            padding_top="12px",
                        ),
                        rx.tabs.content(
                            rx.form(
                                rx.vstack(
                                    rx.text_area(
                                        name="token",
                                        placeholder="Paste your Taiga auth token…",
                                        rows="3",
                                        width="100%",
                                    ),
                                    rx.button(
                                        rx.cond(
                                            AuthState.signing_in,
                                            rx.hstack(rx.spinner(size="2"), rx.text("Signing in…"), spacing="2"),
                                            rx.hstack(rx.icon("key-round", size=15), rx.text("Use token"), spacing="2"),
                                        ),
                                        type="submit",
                                        size="2",
                                        variant="soft",
                                        color_scheme="violet",
                                        width="100%",
                                        disabled=AuthState.signing_in,
                                    ),
                                    spacing="3",
                                ),
                                on_submit=ContextState.login_and_load,
                            ),
                            value="token",
                            padding_top="12px",
                        ),
                        default_value="credentials",
                        width="100%",
                    ),
                    rx.cond(
                        AuthState.login_error != "",
                        rx.callout(
                            AuthState.login_error,
                            color="red",
                            size="1",
                        ),
                        rx.fragment(),
                    ),
                    spacing="3",
                    width="100%",
                ),
            ),
            max_width="420px",
        ),
    )
