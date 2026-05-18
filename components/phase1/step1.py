"""step1.py — Define Your Epic: segmented tab control for New / Load / AI Suggests."""

import reflex as rx
from components.expander import expander
from state.context import ContextState
from state.phase1 import Phase1State


# ── Tab panels ────────────────────────────────────────────────────────────────

def _new_panel() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.vstack(
                rx.text("Epic Title", size="3", weight="medium"),
                rx.hstack(rx.text("Required", size="2", color=rx.color("red", 9)), spacing="1"),
                rx.input(
                    value=Phase1State.epic_subject_input,
                    placeholder="e.g. User Authentication",
                    on_change=Phase1State.set_epic_subject,
                    size="3",
                    width="100%",
                ),
                spacing="1",
                flex="3",
            ),
            rx.vstack(
                rx.text("Taiga Epic ID", size="3", weight="medium"),
                rx.text("Optional — leave blank to create new", size="2", color=rx.color("gray", 9)),
                rx.input(
                    value=Phase1State.epic_id_input,
                    placeholder="e.g. 42",
                    on_change=Phase1State.set_epic_id,
                    size="3",
                    width="100%",
                ),
                spacing="1",
                flex="1",
            ),
            spacing="4",
            align="end",
            width="100%",
        ),
        rx.vstack(
            rx.text("Description", size="3", weight="medium"),
            rx.text_area(
                value=Phase1State.epic_desc_input,
                placeholder="Describe the epic in detail — context helps the AI generate better stories…",
                on_change=Phase1State.set_epic_desc,
                rows="5",
                width="100%",
            ),
            spacing="1",
            width="100%",
        ),
        spacing="4",
        width="100%",
    )


def _load_epic_item(epic: dict) -> rx.Component:
    """Expander row for one epic in the Load from Taiga panel."""
    is_selected = Phase1State.loaded_epic_id == epic["id"].to_string()
    return expander(
        rx.hstack(
            rx.badge(
                "#" + epic["ref"].to_string(),
                color_scheme=rx.cond(is_selected, "green", "violet"),
                variant="surface",
                size="2",
            ),
            rx.text(epic["subject"], size="2", weight="medium", flex="1"),
            rx.cond(
                is_selected,
                rx.badge(
                    rx.hstack(
                        rx.icon("check", size=11),
                        rx.text("Using this epic"),
                        spacing="1",
                        align="center",
                    ),
                    color_scheme="green",
                    variant="soft",
                    size="1",
                ),
                rx.fragment(),
            ),
            spacing="2",
            align="center",
            width="100%",
        ),
        rx.vstack(
            rx.cond(
                epic["description"] != "",
                rx.text(epic["description"], size="2", color=rx.color("gray", 11)),
                rx.text("No description provided.", size="2", color=rx.color("gray", 9), font_style="italic"),
            ),
            rx.cond(
                is_selected,
                rx.hstack(
                    rx.icon("circle-check", size=15, color=rx.color("green", 9)),
                    rx.text(
                        "Selected — generated user stories will be added to this epic.",
                        size="2",
                        color=rx.color("green", 11),
                    ),
                    spacing="2",
                    align="center",
                    padding_top="4px",
                ),
                rx.button(
                    rx.hstack(rx.icon("check", size=15), rx.text("Use Epic"), spacing="2"),
                    size="2",
                    color_scheme="violet",
                    variant="soft",
                    on_click=Phase1State.select_epic(epic),
                ),
            ),
            spacing="3",
            width="100%",
        ),
        style=rx.cond(
            is_selected,
            {"border_color": "var(--green-9)", "border_width": "2px"},
            {},
        ),
    )


def _load_panel() -> rx.Component:
    return rx.vstack(
        rx.cond(
            ~Phase1State.is_authenticated,
            rx.callout(
                "Sign in via the ⇄ button in the sidebar to load epics from Taiga.",
                color="blue",
                size="1",
            ),
            rx.fragment(),
        ),
        rx.hstack(
            rx.cond(
                Phase1State.epics_loading,
                rx.hstack(rx.spinner(size="2"), rx.text("Loading…", size="2"), spacing="2"),
                rx.text(
                    Phase1State.epics_list.length().to_string() + " epic(s) in this project",
                    size="2",
                    color=rx.color("gray", 10),
                ),
            ),
            rx.spacer(),
            rx.button(
                rx.hstack(rx.icon("refresh-cw", size=13), rx.text("Refresh"), spacing="1"),
                size="2",
                variant="ghost",
                on_click=Phase1State.load_epics,
            ),
            align="center",
            width="100%",
        ),
        rx.cond(
            Phase1State.epics_load_error != "",
            rx.callout(Phase1State.epics_load_error, color="red", size="1"),
            rx.fragment(),
        ),
        rx.cond(
            Phase1State.epics_list.length() > 0,
            rx.vstack(
                rx.foreach(Phase1State.epics_list, _load_epic_item),
                spacing="2",
                width="100%",
            ),
            rx.cond(
                ~Phase1State.epics_loading,
                rx.callout(
                    "No epics found in this project. Create one in Taiga or use the "
                    "\"Create New\" tab.",
                    color="gray",
                    size="1",
                ),
                rx.fragment(),
            ),
        ),
        spacing="3",
        width="100%",
    )


def _suggest_item(s: dict) -> rx.Component:
    """Expander row for one AI-suggested epic."""
    is_selected = Phase1State.selected_suggestion_index == s["index"]
    return expander(
        rx.hstack(
            rx.icon("sparkles", size=14, color=rx.cond(is_selected, rx.color("green", 9), rx.color("violet", 9))),
            rx.text(s["title"], size="2", weight="medium", flex="1"),
            rx.cond(
                is_selected,
                rx.badge(
                    rx.hstack(
                        rx.icon("check", size=11),
                        rx.text("Using this suggestion"),
                        spacing="1",
                        align="center",
                    ),
                    color_scheme="green",
                    variant="soft",
                    size="1",
                ),
                rx.fragment(),
            ),
            spacing="2",
            align="center",
            width="100%",
        ),
        rx.vstack(
            rx.text_area(
                value=s["desc_edit"],
                on_change=lambda v: Phase1State.set_suggestion_desc_edit(s["index"], v),
                rows="3",
                width="100%",
                size="2",
                placeholder="Edit description before using…",
            ),
            rx.cond(
                is_selected,
                rx.hstack(
                    rx.icon("circle-check", size=15, color=rx.color("green", 9)),
                    rx.text(
                        "Selected — a new epic will be created with this title and description.",
                        size="2",
                        color=rx.color("green", 11),
                    ),
                    spacing="2",
                    align="center",
                    padding_top="4px",
                ),
                rx.button(
                    rx.hstack(rx.icon("sparkles", size=15), rx.text("Use Suggestion"), spacing="2"),
                    size="2",
                    color_scheme="violet",
                    variant="soft",
                    on_click=Phase1State.select_suggested_epic_by_index(s["index"]),
                ),
            ),
            spacing="3",
            width="100%",
        ),
        style=rx.cond(
            is_selected,
            {"border_color": "var(--green-9)", "border_width": "2px"},
            {},
        ),
    )


def _suggest_panel() -> rx.Component:
    return rx.vstack(
        rx.cond(
            ~Phase1State.is_authenticated,
            rx.callout(
                "Sign in to Taiga using the ⇄ button in the sidebar to use AI Suggests.",
                color="blue",
                size="1",
            ),
            rx.fragment(),
        ),
        rx.cond(
            Phase1State.is_authenticated & ~Phase1State.has_project,
            rx.callout(
                "Select a Taiga project in the sidebar before using AI Suggests.",
                color="orange",
                size="1",
            ),
            rx.fragment(),
        ),
        rx.cond(
            Phase1State.is_authenticated & Phase1State.has_project & ~ContextState.has_project_concept,
            rx.callout(
                "Add a Project Concept to the Memory Bank (sidebar) before using AI Suggests.",
                color="amber",
                size="1",
            ),
            rx.fragment(),
        ),
        rx.vstack(
            rx.text("AI Guidance", size="3", weight="medium"),
            rx.text(
                "Optional — focus or constrain the epic suggestions.",
                size="2",
                color=rx.color("gray", 9),
            ),
            rx.input(
                value=Phase1State.ai_hint_input,
                placeholder="e.g. focus on mobile-first flows, B2B enterprise context…",
                on_change=Phase1State.set_ai_hint,
                size="3",
                width="100%",
            ),
            spacing="1",
            width="100%",
        ),
        rx.button(
            rx.hstack(rx.icon("sparkles", size=16), rx.text("AI Suggests"), spacing="2"),
            size="3",
            color_scheme="violet",
            width="100%",
            on_click=Phase1State.run_suggest_epics,
            disabled=Phase1State.suggest_loading | ~Phase1State.is_authenticated | ~Phase1State.has_project | ~ContextState.has_project_concept,
        ),
        rx.cond(
            Phase1State.suggest_loading,
            expander(
                rx.hstack(
                    rx.spinner(size="2"),
                    rx.text("Generating epic suggestions…", size="2", weight="medium"),
                    spacing="2",
                    align="center",
                ),
                rx.vstack(
                    rx.foreach(
                        Phase1State.generation_log,
                        lambda msg: rx.hstack(
                            rx.icon("chevron-right", size=13, color=rx.color("accent", 9)),
                            rx.text(msg, size="2", color=rx.color("gray", 11)),
                            spacing="1",
                            align="center",
                        ),
                    ),
                    spacing="2",
                    width="100%",
                ),
                initially_open=True,
            ),
            rx.fragment(),
        ),
        rx.cond(
            Phase1State.suggest_error != "",
            rx.callout(Phase1State.suggest_error, color="red", size="1"),
            rx.fragment(),
        ),
        rx.cond(
            Phase1State.suggestions_with_edits.length() > 0,
            rx.vstack(
                rx.hstack(
                    rx.text(
                        Phase1State.suggestions_with_edits.length().to_string() + " suggestions",
                        size="2",
                        color=rx.color("gray", 9),
                    ),
                    rx.spacer(),
                    rx.button(
                        rx.hstack(rx.icon("x", size=13), rx.text("Clear"), spacing="1"),
                        size="2",
                        variant="soft",
                        color_scheme="gray",
                        on_click=Phase1State.clear_suggestions,
                    ),
                    align="center",
                    width="100%",
                ),
                rx.foreach(Phase1State.suggestions_with_edits, _suggest_item),
                spacing="2",
                width="100%",
            ),
            rx.fragment(),
        ),
        spacing="3",
        width="100%",
    )


def _discard_dialog() -> rx.Component:
    return rx.dialog.root(
        rx.dialog.content(
            rx.dialog.title("Discard Unsaved Progress?"),
            rx.dialog.description("Confirm discarding unsaved inputs and generated user stories.", class_name="sr-only"),
            rx.callout(
                "Switching sources will reset your inputs and any generated User Stories.",
                color="orange",
                size="2",
            ),
            rx.hstack(
                rx.button(
                    "Yes, discard",
                    color_scheme="red",
                    size="2",
                    on_click=Phase1State.confirm_mode_switch,
                ),
                rx.dialog.close(
                    rx.button(
                        "Cancel",
                        variant="soft",
                        color_scheme="gray",
                        size="2",
                        on_click=Phase1State.cancel_mode_switch,
                    ),
                ),
                spacing="2",
                justify="end",
                margin_top="16px",
            ),
            max_width="440px",
        ),
        open=Phase1State.discard_dialog_open,
        on_open_change=Phase1State.set_discard_dialog_open,
    )


# ── Step 1 root ───────────────────────────────────────────────────────────────

def step1() -> rx.Component:
    return rx.vstack(
        rx.heading("Step 1 · Define Your Epic", size="6", class_name="apex-step-heading"),
        rx.tabs.root(
            rx.tabs.list(
                rx.tabs.trigger(
                    rx.hstack(rx.icon("file-plus", size=15), rx.text("Create New"), spacing="2"),
                    value="new",
                ),
                rx.tabs.trigger(
                    rx.hstack(rx.icon("download", size=15), rx.text("Load from Taiga"), spacing="2"),
                    value="load",
                ),
                rx.tabs.trigger(
                    rx.hstack(rx.icon("sparkles", size=15), rx.text("AI Suggests"), spacing="2"),
                    value="suggest",
                ),
                size="2",
            ),
            rx.tabs.content(_new_panel(), value="new", padding_top="16px"),
            rx.tabs.content(_load_panel(), value="load", padding_top="16px"),
            rx.tabs.content(_suggest_panel(), value="suggest", padding_top="16px"),
            value=Phase1State.start_mode,
            on_change=Phase1State.request_mode_switch,
            width="100%",
        ),
        _discard_dialog(),
        spacing="4",
        width="100%",
    )
