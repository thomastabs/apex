"""tech_stack_stage.py — Stage A: tech stack alternatives + Gate 0 (Tech Lead)."""

import reflex as rx
from state.auth import AuthState
from state.phase2 import Phase2State


def _alternative_card(alt: dict, index: int) -> rx.Component:
    is_selected = Phase2State.selected_alternative_index == index
    return rx.box(
        rx.vstack(
            rx.text(alt["name"], size="3", weight="bold"),
            rx.text(alt["description"], size="2", color=rx.color("gray", 11)),
            rx.text(alt["trade_offs"], size="2", color=rx.color("gray", 10)),
            spacing="2",
            align="start",
            width="100%",
        ),
        on_click=Phase2State.select_alternative(index),
        padding="12px",
        border_radius="8px",
        border=rx.cond(
            is_selected,
            "2px solid var(--green-9)",
            "1px solid var(--gray-6)",
        ),
        background=rx.cond(
            is_selected,
            rx.color("green", 2),
            rx.color("gray", 1),
        ),
        cursor="pointer",
        width="100%",
        style={"transition": "border 0.15s, background 0.15s"},
    )


def _alternatives_list() -> rx.Component:
    return rx.cond(
        Phase2State.stack_alternatives.length() > 0,
        rx.vstack(
            rx.text("Select an alternative to pre-fill the editor, or write your own below.",
                    size="2", color=rx.color("gray", 10)),
            rx.foreach(
                Phase2State.stack_alternatives,
                lambda alt, i: _alternative_card(alt, i),
            ),
            spacing="3",
            width="100%",
        ),
        rx.fragment(),
    )


def _stack_editor() -> rx.Component:
    return rx.vstack(
        rx.text("Tech Stack (editable)", size="2", weight="medium"),
        rx.text_area(
            value=Phase2State.tech_stack_edit,
            placeholder="Edit or write the tech stack definition here...",
            on_change=Phase2State.set_tech_stack_edit,
            rows="6",
            width="100%",
            disabled=Phase2State.gate0_approved,
        ),
        rx.button(
            rx.hstack(
                rx.icon("check_check", size=16),
                rx.text("Confirm Tech Stack"),
                spacing="2",
            ),
            on_click=Phase2State.approve_gate0,
            disabled=~Phase2State.can_approve_gate0,
            color_scheme="green",
            size="3",
            width="100%",
        ),
        spacing="2",
        width="100%",
    )


def _locked_display() -> rx.Component:
    return rx.vstack(
        rx.callout(
            rx.hstack(
                rx.icon("lock", size=16),
                rx.text("Tech Stack Locked — Stage B is now available.", weight="medium"),
                spacing="2",
                align="center",
            ),
            color="green",
            size="1",
        ),
        rx.box(
            rx.text(Phase2State.existing_tech_stack, size="2",
                    white_space="pre-wrap", font_family="monospace"),
            padding="12px",
            background=rx.color("green", 2),
            border_radius="6px",
            border="1px solid var(--green-6)",
            width="100%",
        ),
        rx.button(
            rx.hstack(rx.icon("pencil", size=14), rx.text("Re-edit Tech Stack"), spacing="1"),
            on_click=Phase2State.reopen_gate0,
            variant="soft",
            color_scheme="gray",
            size="2",
        ),
        spacing="3",
        width="100%",
    )


def tech_stack_stage() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.heading("Stage A · Tech Stack", size="5", weight="bold"),
            rx.badge("Gate 0 · Tech Lead", color_scheme="blue", size="2"),
            spacing="3",
            align="center",
            width="100%",
        ),
        rx.cond(
            ~AuthState.is_authenticated,
            rx.callout(
                "Sign in to Taiga using the ⇄ button in the sidebar to use Phase 2.",
                color="blue",
                size="1",
            ),
            rx.fragment(),
        ),
        rx.cond(
            AuthState.is_authenticated & ~Phase2State.has_project,
            rx.callout(
                "Select a Taiga project in the sidebar before using Phase 2.",
                color="orange",
                size="1",
            ),
            rx.fragment(),
        ),
        rx.cond(
            Phase2State.tech_stack_confirmed,
            _locked_display(),
            rx.vstack(
                rx.vstack(
                    rx.text("Guidance", size="2", weight="medium"),
                    rx.text(
                        "Optional — constrain or focus the suggestions.",
                        size="2",
                        color=rx.color("gray", 9),
                    ),
                    rx.input(
                        value=Phase2State.stack_hint,
                        placeholder="e.g. must use PostgreSQL, prefer serverless, Python backend only…",
                        on_change=Phase2State.set_stack_hint,
                        size="2",
                        width="100%",
                        disabled=Phase2State.stack_suggesting,
                    ),
                    spacing="1",
                    width="100%",
                ),
                rx.hstack(
                    rx.button(
                        rx.cond(
                            Phase2State.stack_suggesting,
                            rx.hstack(rx.spinner(size="2"), rx.text("Analysing project scope..."), spacing="2"),
                            rx.hstack(rx.icon("sparkles", size=16), rx.text("Suggest Alternatives"), spacing="2"),
                        ),
                        on_click=Phase2State.run_suggest_stack,
                        disabled=Phase2State.stack_suggesting | ~Phase2State.can_suggest_stack,
                        color_scheme="violet",
                        size="3",
                        flex="1",
                    ),
                    rx.cond(
                        Phase2State.stage_a_has_unsaved,
                        rx.button(
                            rx.hstack(rx.icon("x", size=14), rx.text("Clear"), spacing="1"),
                            on_click=Phase2State.clear_stage_a,
                            variant="soft",
                            color_scheme="gray",
                            size="2",
                            disabled=Phase2State.stack_suggesting,
                        ),
                        rx.fragment(),
                    ),
                    spacing="2",
                    width="100%",
                    align="center",
                ),
                rx.cond(
                    Phase2State.stack_suggesting,
                    rx.text("Scanning all locked stories and generating alternatives...",
                            size="2", color=rx.color("gray", 10)),
                    rx.fragment(),
                ),
                _alternatives_list(),
                _stack_editor(),
                rx.cond(
                    Phase2State.stack_error != "",
                    rx.callout(Phase2State.stack_error, color="red", size="1"),
                    rx.fragment(),
                ),
                spacing="4",
                width="100%",
            ),
        ),
        padding="16px",
        border="1px solid var(--gray-6)",
        border_radius="8px",
        background=rx.color("gray", 1),
        width="100%",
        spacing="4",
    )
