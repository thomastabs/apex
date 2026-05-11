"""step1.py — Define Your Epic: New / Load from Taiga / AI Suggests."""

import reflex as rx
from state.phase1 import Phase1State


def _tab_button(label: str, mode: str) -> rx.Component:
    is_active = Phase1State.start_mode == mode
    return rx.button(
        label,
        variant=rx.cond(is_active, "solid", "ghost"),
        color_scheme=rx.cond(is_active, "violet", "gray"),
        size="2",
        on_click=Phase1State.request_mode_switch(mode),
    )


def _new_panel() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.text("Epic Title", size="2", weight="bold"),
            rx.text("*", color="red"),
        ),
        rx.input(
            value=Phase1State.epic_subject_input,
            placeholder="e.g. User Authentication",
            on_change=Phase1State.set_epic_subject,
            width="100%",
        ),
        rx.text("Description", size="2", weight="bold"),
        rx.text_area(
            value=Phase1State.epic_desc_input,
            placeholder="Describe the epic in detail…",
            on_change=Phase1State.set_epic_desc,
            rows="4",
            width="100%",
        ),
        rx.text("Taiga Epic ID (optional)", size="2", weight="bold"),
        rx.input(
            value=Phase1State.epic_id_input,
            placeholder="Leave blank to create a new Epic in Taiga on push",
            on_change=Phase1State.set_epic_id,
            width="100%",
        ),
        spacing="2",
        width="100%",
    )


def _load_panel() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.text("Load from Taiga", size="2", weight="bold"),
            rx.spacer(),
            rx.button(
                "↺ Reload",
                size="1",
                variant="ghost",
                on_click=Phase1State.load_epics,
            ),
            align="center",
            width="100%",
        ),
        rx.cond(
            Phase1State.epics_loading,
            rx.spinner(size="2"),
            rx.cond(
                Phase1State.epics_list.length() > 0,
                rx.vstack(
                    rx.foreach(
                        Phase1State.epics_list,
                        lambda epic: rx.hstack(
                            rx.vstack(
                                rx.hstack(
                                    rx.text(
                                        "#" + epic["ref"].to_string(),
                                        size="1",
                                        color_scheme="violet",
                                        weight="bold",
                                    ),
                                    rx.text(epic["subject"], size="2", weight="bold"),
                                    spacing="2",
                                    align="center",
                                ),
                                rx.text(epic.get("description", ""), size="1", color_scheme="gray",
                                        no_of_lines=2),
                                spacing="0",
                                align="start",
                                flex="1",
                            ),
                            rx.button(
                                "Load",
                                size="1",
                                variant="ghost",
                                color_scheme="violet",
                                on_click=Phase1State.select_epic(epic),
                            ),
                            rx.button(
                                "✕",
                                size="1",
                                variant="ghost",
                                color_scheme="red",
                                on_click=Phase1State.delete_epic_from_load(epic["id"]),
                            ),
                            align="start",
                            width="100%",
                            padding="8px",
                            border=f"1px solid {rx.color('gray', 4)}",
                            border_radius="6px",
                        ),
                    ),
                    spacing="2",
                    width="100%",
                ),
                rx.text("No epics found.", size="2", color_scheme="gray"),
            ),
        ),
        rx.cond(
            Phase1State.epics_load_error != "",
            rx.callout(Phase1State.epics_load_error, color="red", size="1"),
            rx.fragment(),
        ),
        spacing="2",
        width="100%",
        on_mount=Phase1State.load_epics,
    )


def _suggest_panel() -> rx.Component:
    return rx.vstack(
        rx.text("AI guidance (optional)", size="2", weight="bold"),
        rx.input(
            value=Phase1State.ai_hint_input,
            placeholder="e.g. focus on mobile-first flows",
            on_change=Phase1State.set_ai_hint,
            width="100%",
        ),
        rx.button(
            rx.cond(
                Phase1State.suggest_loading,
                rx.hstack(rx.spinner(size="2"), rx.text("Generating…"), spacing="2"),
                rx.text("AI Suggests"),
            ),
            on_click=Phase1State.run_suggest_epics,
            disabled=Phase1State.suggest_loading,
            width="100%",
        ),
        rx.cond(
            Phase1State.suggest_error != "",
            rx.callout(Phase1State.suggest_error, color="red", size="1"),
            rx.fragment(),
        ),
        rx.cond(
            Phase1State.epics_suggested.length() > 0,
            rx.vstack(
                rx.foreach(
                    Phase1State.epics_suggested,
                    lambda epic: rx.box(
                        rx.vstack(
                            rx.text(epic["title"], size="2", weight="bold"),
                            rx.text(epic["description"], size="1", color_scheme="gray"),
                            rx.button(
                                "Use this",
                                size="1",
                                variant="ghost",
                                color_scheme="violet",
                                on_click=Phase1State.select_suggested_epic(epic),
                            ),
                            spacing="2",
                            align="start",
                            width="100%",
                        ),
                        padding="10px",
                        border=f"1px solid {rx.color('gray', 4)}",
                        border_radius="6px",
                        width="100%",
                    ),
                ),
                spacing="2",
                width="100%",
            ),
            rx.fragment(),
        ),
        spacing="2",
        width="100%",
    )


def _discard_dialog() -> rx.Component:
    return rx.dialog.root(
        rx.dialog.content(
            rx.dialog.title("Discard Unsaved Progress?"),
            rx.callout(
                "Switching sources will reset your inputs and any generated User Stories.",
                color="orange",
            ),
            rx.hstack(
                rx.button(
                    "Yes, discard",
                    color_scheme="red",
                    on_click=Phase1State.confirm_mode_switch,
                ),
                rx.dialog.close(
                    rx.button("Cancel", variant="soft", color_scheme="gray",
                              on_click=Phase1State.cancel_mode_switch),
                ),
                spacing="2",
                justify="end",
            ),
            max_width="440px",
        ),
        open=Phase1State.discard_dialog_open,
        on_open_change=Phase1State.set_discard_dialog_open,
    )


def step1() -> rx.Component:
    return rx.vstack(
        rx.heading("Step 1 · Define Your Epic", size="4"),
        rx.hstack(
            _tab_button("Create New", "new"),
            _tab_button("Load from Taiga", "load"),
            _tab_button("AI Suggests", "suggest"),
            spacing="2",
        ),
        rx.cond(Phase1State.start_mode == "new", _new_panel(), rx.fragment()),
        rx.cond(Phase1State.start_mode == "load", _load_panel(), rx.fragment()),
        rx.cond(Phase1State.start_mode == "suggest", _suggest_panel(), rx.fragment()),
        _discard_dialog(),
        spacing="4",
        width="100%",
    )
