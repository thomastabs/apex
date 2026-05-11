"""gherkin_review.py — Step 5 & 6: Review Gherkin stories and push to Taiga."""

import reflex as rx
from state.phase1 import Phase1State


def _story_card(story: dict) -> rx.Component:
    """Render one editable story card.

    story dict includes "index" and "gherkin_edit" injected by stories_with_edits
    computed var so we don't need enumerate() (which Reflex list vars don't support).
    """
    idx = story["index"]
    return rx.box(
        rx.vstack(
            rx.hstack(
                rx.input(
                    value=story["title"],
                    on_change=lambda v: Phase1State.set_story_title(idx, v),
                    placeholder="Story title",
                    size="2",
                    flex="1",
                    disabled=Phase1State.push_done,
                ),
                rx.button(
                    story["size"],
                    size="1",
                    variant="soft",
                    color_scheme="gray",
                    on_click=Phase1State.cycle_story_size(idx),
                    disabled=Phase1State.push_done,
                    title="Click to cycle size",
                    min_width="36px",
                ),
                rx.button(
                    "✕",
                    size="1",
                    variant="ghost",
                    color_scheme="red",
                    on_click=Phase1State.delete_story(idx),
                    disabled=Phase1State.push_done,
                ),
                align="center",
                spacing="2",
                width="100%",
            ),
            rx.text_area(
                value=story["gherkin_edit"],
                on_change=lambda v: Phase1State.set_gherkin_edit(idx, v),
                rows="8",
                width="100%",
                font_family="monospace",
                font_size="12px",
                disabled=Phase1State.push_done,
            ),
            spacing="2",
            width="100%",
        ),
        padding="12px",
        border=f"1px solid {rx.color('gray', 4)}",
        border_radius="8px",
        width="100%",
    )


def _validation_errors() -> rx.Component:
    return rx.cond(
        Phase1State.validation_errors.length() > 0,
        rx.vstack(
            rx.foreach(
                Phase1State.validation_errors,
                lambda e: rx.text("· " + e, size="1", color_scheme="red"),
            ),
            spacing="1",
            width="100%",
        ),
        rx.fragment(),
    )


def gherkin_review_section() -> rx.Component:
    return rx.cond(
        Phase1State.has_compiled,
        rx.vstack(
            rx.heading("Step 5 · Review Gherkin Stories", size="4"),
            rx.text(
                "Edit story titles, sizes, and Gherkin acceptance criteria. "
                "Click the size badge to cycle it. Each story must have a title "
                "and a valid Feature block before pushing.",
                size="2",
                color_scheme="gray",
            ),
            rx.foreach(Phase1State.stories_with_edits, _story_card),
            rx.cond(
                ~Phase1State.push_done,
                rx.button(
                    "+ Add Story",
                    variant="ghost",
                    on_click=Phase1State.add_story,
                    width="100%",
                ),
                rx.fragment(),
            ),
            rx.separator(width="100%"),
            # ── Validation errors ──────────────────────────────────────────
            _validation_errors(),
            # ── Push controls ──────────────────────────────────────────────
            rx.cond(
                Phase1State.push_done,
                rx.vstack(
                    rx.callout(
                        Phase1State.push_result.get("count", 0).to_string()
                        + " stories pushed to Taiga successfully.",
                        color="green",
                        size="2",
                    ),
                    rx.foreach(
                        Phase1State.push_story_urls,
                        lambda url: rx.link(url, href=url, is_external=True, size="2"),
                    ),
                    rx.button(
                        "Start New Epic",
                        color_scheme="violet",
                        on_click=Phase1State.start_new_epic,
                    ),
                    spacing="3",
                    width="100%",
                ),
                rx.vstack(
                    rx.cond(
                        Phase1State.push_error != "",
                        rx.callout(Phase1State.push_error, color="red", size="2"),
                        rx.fragment(),
                    ),
                    rx.hstack(
                        rx.button(
                            rx.cond(
                                Phase1State.pushing,
                                rx.hstack(rx.spinner(size="2"), rx.text("Pushing…"), spacing="2"),
                                rx.text("Confirm Push to Taiga"),
                            ),
                            on_click=Phase1State.run_push,
                            disabled=Phase1State.pushing | ~Phase1State.can_push,
                            color_scheme="violet",
                            size="3",
                        ),
                        rx.button(
                            "← Back to NL edit",
                            variant="ghost",
                            color_scheme="gray",
                            on_click=Phase1State.back_to_nl_edit,
                        ),
                        rx.button(
                            "↺ Start Over",
                            variant="ghost",
                            color_scheme="gray",
                            on_click=Phase1State.reset_all,
                        ),
                        spacing="2",
                        flex_wrap="wrap",
                    ),
                    spacing="3",
                    width="100%",
                ),
            ),
            spacing="4",
            width="100%",
        ),
        rx.fragment(),
    )
