"""epic_selector.py — Stage B: epic dropdown + read-only Gherkin accordion."""

import reflex as rx
from components.expander import expander
from state.phase2 import Phase2State


def _story_gherkin_card(story: dict) -> rx.Component:
    is_design_locked = story["phase_status"] == "design_locked"
    is_gherkin_locked = story["phase_status"] == "gherkin_locked"
    has_gherkin = is_design_locked | is_gherkin_locked
    return expander(
        rx.hstack(
            rx.icon(
                rx.cond(is_design_locked, "lock", rx.cond(is_gherkin_locked, "file-text", "circle")),
                size=14,
                color=rx.cond(
                    is_design_locked, rx.color("green", 9),
                    rx.cond(is_gherkin_locked, rx.color("violet", 9), rx.color("gray", 7)),
                ),
            ),
            rx.text(story["title"], size="2", weight="medium"),
            rx.cond(
                is_design_locked,
                rx.badge("design locked", color_scheme="green", size="1"),
                rx.cond(
                    is_gherkin_locked,
                    rx.badge("gherkin locked", color_scheme="violet", size="1"),
                    rx.badge("phase 1 pending", color_scheme="gray", size="1"),
                ),
            ),
            spacing="2",
            align="center",
        ),
        rx.cond(
            has_gherkin,
            rx.box(
                rx.text(story["gherkin"], size="1", white_space="pre-wrap",
                        font_family="'JetBrains Mono', 'Fira Code', monospace"),
                padding="10px",
                background=rx.color("gray", 2),
                border_radius="6px",
                width="100%",
            ),
            rx.text("No Gherkin yet — complete Phase 1 for this story first.",
                    size="1", color=rx.color("gray", 8), padding="8px 10px"),
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
                                    rx.fragment(),
                                ),
                                rx.text(e["epic_title"]),
                                spacing="1",
                                align="center",
                            ),
                            value=e["epic_id"].to_string(),
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
            Phase2State.epic_list_empty,
            rx.callout(
                rx.hstack(
                    rx.icon("info", size=14),
                    rx.vstack(
                        rx.text("No epics found in this project.", size="2", weight="medium"),
                        rx.text(
                            "Create epics and lock at least one story in Phase 1 before using Stage B.",
                            size="2",
                            color=rx.color("gray", 10),
                        ),
                        spacing="1",
                        align="start",
                    ),
                    spacing="2",
                    align="start",
                ),
                color="blue",
                size="1",
                width="100%",
            ),
            rx.fragment(),
        ),
        rx.cond(
            Phase2State.selected_epic_id > 0,
            rx.vstack(
                rx.hstack(
                    rx.text("Stories in this Epic", size="2", weight="medium",
                            color=rx.color("gray", 10)),
                    rx.spacer(),
                    rx.button(
                        rx.icon("refresh-cw", size=13),
                        "Refresh",
                        size="1",
                        variant="soft",
                        color_scheme="gray",
                        on_click=Phase2State.refresh_epic_stories,
                    ),
                    rx.button(
                        rx.icon("trash-2", size=13),
                        "Clear Design",
                        size="1",
                        variant="soft",
                        color_scheme="red",
                        on_click=Phase2State.reset_story,
                    ),
                    align="center",
                    width="100%",
                ),
                rx.foreach(Phase2State.stories_in_epic, _story_gherkin_card),
                rx.cond(
                    Phase2State.selected_epic_no_locked_stories,
                    rx.callout(
                        rx.hstack(
                            rx.icon("info", size=14),
                            rx.vstack(
                                rx.text("No stories ready for design yet.", size="2", weight="medium"),
                                rx.text(
                                    "Complete Phase 1 for at least one story in this epic first.",
                                    size="2",
                                    color=rx.color("gray", 10),
                                ),
                                spacing="1",
                                align="start",
                            ),
                            spacing="2",
                            align="start",
                        ),
                        color="orange",
                        size="1",
                        width="100%",
                    ),
                    rx.fragment(),
                ),
                spacing="2",
                width="100%",
            ),
            rx.fragment(),
        ),
        spacing="4",
        width="100%",
    )
