"""epic_selector.py — Stage B: epic dropdown + read-only Gherkin accordion."""

import reflex as rx
from components.expander import expander
from state.phase2 import Phase2State


def _story_gherkin_card(story: dict) -> rx.Component:
    is_locked = story["phase_status"] == "design_locked"
    return expander(
        rx.hstack(
            rx.icon(
                rx.cond(is_locked, "lock", "file-text"),
                size=14,
                color=rx.cond(is_locked, rx.color("green", 9), rx.color("gray", 9)),
            ),
            rx.text(story["title"], size="2", weight="medium"),
            rx.cond(
                is_locked,
                rx.badge("design locked", color_scheme="green", size="1"),
                rx.badge("gherkin locked", color_scheme="violet", size="1"),
            ),
            spacing="2",
            align="center",
        ),
        rx.box(
            rx.text(story["gherkin"], size="1", white_space="pre-wrap",
                    font_family="'JetBrains Mono', 'Fira Code', monospace"),
            padding="10px",
            background=rx.color("gray", 2),
            border_radius="6px",
            width="100%",
        ),
        body_padding="8px 10px 10px",
    )


def epic_selector_section() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.heading("Stage B · Epic Design", size="5", weight="bold"),
            rx.badge("Per-epic", color_scheme="gray", size="2"),
            spacing="3",
            align="center",
            width="100%",
        ),
        rx.vstack(
            rx.text("Select Epic", size="2", weight="medium"),
            rx.select.root(
                rx.select.trigger(placeholder="Choose an epic to design..."),
                rx.select.content(
                    rx.foreach(
                        Phase2State.selectable_epics,
                        lambda e: rx.select.item(
                            rx.hstack(
                                rx.cond(
                                    e["all_locked"],
                                    rx.icon("lock", size=12),
                                    rx.cond(
                                        e["story_count"] == 0,
                                        rx.icon("clock", size=12, color=rx.color("gray", 8)),
                                        rx.fragment(),
                                    ),
                                ),
                                rx.text(e["epic_title"]),
                                rx.cond(
                                    e["story_count"] == 0,
                                    rx.text("· Phase 1 pending", size="1", color=rx.color("gray", 8)),
                                    rx.fragment(),
                                ),
                                spacing="1",
                                align="center",
                            ),
                            value=e["epic_id"].to_string(),
                            disabled=e["story_count"] == 0,
                        ),
                    )
                ),
                on_change=Phase2State.select_epic,
                value=rx.cond(
                    Phase2State.selected_epic_id > 0,
                    Phase2State.selected_epic_id.to_string(),
                    "",
                ),
                width="100%",
            ),
            spacing="2",
            width="100%",
        ),
        rx.cond(
            Phase2State.epics_load_error != "",
            rx.callout(Phase2State.epics_load_error, color="red", size="1"),
            rx.fragment(),
        ),
        rx.cond(
            Phase2State.selected_epic_id > 0,
            rx.vstack(
                rx.text("Locked Stories in this Epic", size="2", weight="medium",
                        color=rx.color("gray", 10)),
                rx.foreach(Phase2State.stories_in_epic, _story_gherkin_card),
                spacing="2",
                width="100%",
            ),
            rx.fragment(),
        ),
        spacing="4",
        width="100%",
    )
