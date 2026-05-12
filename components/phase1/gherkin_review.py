"""gherkin_review.py — Step 5 & 6: Review Gherkin stories and push to Taiga."""

import reflex as rx
from components.expander import expander
from state.phase1 import Phase1State


def _story_item(story: dict) -> rx.Component:
    """Expander for one Gherkin story.

    story dict has "index", "title", "size", "gherkin_edit" injected by
    stories_with_edits so rx.foreach can access them without enumerate().
    """
    idx = story["index"]
    return expander(
        rx.hstack(
            rx.badge(
                story["size"],
                color_scheme="violet",
                variant="soft",
                size="2",
            ),
            rx.text(story["title"], size="2", weight="medium"),
            rx.spacer(),
            spacing="2",
            align="center",
            width="100%",
        ),
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
                    size="2",
                    variant="outline",
                    color_scheme="violet",
                    on_click=Phase1State.cycle_story_size(idx),
                    disabled=Phase1State.push_done,
                    title="Click to cycle: XS → S → M → L → XL",
                ),
                spacing="2",
                width="100%",
                align="center",
            ),
            rx.text_area(
                value=story["gherkin_edit"],
                on_change=lambda v: Phase1State.set_gherkin_edit(idx, v),
                rows="10",
                width="100%",
                font_family="'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                font_size="12px",
                disabled=Phase1State.push_done,
            ),
            rx.hstack(
                rx.spacer(),
                rx.icon_button(
                    rx.icon("trash-2", size=14),
                    size="2",
                    variant="ghost",
                    color_scheme="red",
                    on_click=Phase1State.delete_story(idx),
                    disabled=Phase1State.push_done,
                    title="Delete story",
                ),
                width="100%",
            ),
            spacing="2",
            width="100%",
        ),
    )


def _validation_section() -> rx.Component:
    return rx.cond(
        Phase1State.validation_errors.length() > 0,
        rx.vstack(
            rx.foreach(
                Phase1State.validation_errors,
                lambda e: rx.callout(e, color="orange", size="1"),
            ),
            spacing="2",
            width="100%",
        ),
        rx.fragment(),
    )


def _push_progress() -> rx.Component:
    """Expander shown while push is in progress."""
    return expander(
        rx.hstack(
            rx.spinner(size="2"),
            rx.text("Pushing stories to Taiga…", size="2", weight="medium"),
            spacing="2",
            align="center",
        ),
        rx.vstack(
            rx.foreach(
                Phase1State.push_log,
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
    )


def _push_success() -> rx.Component:
    """Success panel shown after all stories are pushed."""
    return rx.vstack(
        rx.box(
            rx.hstack(
                rx.icon("circle-check", size=28, color=rx.color("green", 9)),
                rx.vstack(
                    rx.text(
                        Phase1State.push_result.get("count", 0).to_string()
                        + " stor"
                        + rx.cond(
                            Phase1State.push_result.get("count", 0) == 1,
                            "y",
                            "ies",
                        )
                        + " pushed to Taiga successfully!",
                        size="3",
                        weight="bold",
                        color=rx.color("green", 11),
                    ),
                    rx.text(
                        "Stories are now in the Taiga backlog under 'Ready for Discovery'.",
                        size="2",
                        color=rx.color("green", 10),
                    ),
                    spacing="1",
                ),
                spacing="3",
                align="center",
            ),
            background=rx.color("green", 2),
            border=f"1px solid {rx.color('green', 6)}",
            border_radius="var(--radius-3)",
            padding="16px 20px",
            width="100%",
        ),
        rx.cond(
            Phase1State.push_story_urls.length() > 0,
            rx.vstack(
                rx.text("Story links:", size="2", weight="medium", color=rx.color("gray", 11)),
                rx.foreach(
                    Phase1State.push_story_urls,
                    lambda url: rx.hstack(
                        rx.icon("external-link", size=13, color=rx.color("violet", 9)),
                        rx.link(url, href=url, is_external=True, size="2"),
                        spacing="1",
                        align="center",
                    ),
                ),
                spacing="1",
                width="100%",
            ),
            rx.fragment(),
        ),
        rx.hstack(
            rx.button(
                rx.hstack(rx.icon("circle-plus", size=16), rx.text("Start New Epic"), spacing="2"),
                color_scheme="violet",
                variant="soft",
                size="3",
                on_click=Phase1State.start_new_epic,
            ),
            rx.link(
                rx.button(
                    rx.hstack(
                        rx.text("Move to Phase 2 · Design"),
                        rx.icon("arrow-right", size=16),
                        spacing="2",
                    ),
                    color_scheme="green",
                    size="3",
                ),
                href="/phase2",
                text_decoration="none",
            ),
            spacing="3",
            flex_wrap="wrap",
        ),
        spacing="4",
        width="100%",
    )


def gherkin_review_section() -> rx.Component:
    return rx.cond(
        Phase1State.has_compiled,
        rx.vstack(
            rx.hstack(
                rx.heading("Step 5 · Review Gherkin Stories", size="6", class_name="apex-step-heading"),
                rx.spacer(),
                rx.badge(
                    Phase1State.compiled_stories.length().to_string() + " stories",
                    color_scheme="violet",
                    variant="surface",
                    size="2",
                ),
                align="center",
                width="100%",
            ),
            rx.text(
                "Edit story titles, sizes, and Gherkin acceptance criteria. "
                "Each story must have a title and a valid Feature block before pushing.",
                size="2",
                color=rx.color("gray", 10),
            ),
            rx.vstack(
                rx.foreach(Phase1State.stories_with_edits, _story_item),
                spacing="1",
                width="100%",
            ),
            rx.cond(
                ~Phase1State.push_done,
                rx.button(
                    rx.hstack(rx.icon("plus", size=14), rx.text("Add Story"), spacing="1"),
                    variant="ghost",
                    size="2",
                    on_click=Phase1State.add_story,
                    width="100%",
                ),
                rx.fragment(),
            ),
            rx.separator(size="4"),
            _validation_section(),
            # ── Push controls ─────────────────────────────────────────────────
            rx.cond(
                Phase1State.push_done,
                _push_success(),
                rx.cond(
                    Phase1State.pushing,
                    _push_progress(),
                    rx.vstack(
                        rx.cond(
                            Phase1State.push_error != "",
                            rx.callout(Phase1State.push_error, color="red", size="1"),
                            rx.fragment(),
                        ),
                        rx.hstack(
                            rx.button(
                                rx.hstack(
                                    rx.icon("send", size=16),
                                    rx.text("Confirm Push to Taiga"),
                                    spacing="2",
                                ),
                                on_click=Phase1State.run_push,
                                disabled=Phase1State.pushing | ~Phase1State.can_push,
                                color_scheme="violet",
                                size="3",
                            ),
                            rx.button(
                                rx.hstack(
                                    rx.icon("arrow-left", size=14),
                                    rx.text("Back to NL edit"),
                                    spacing="1",
                                ),
                                variant="ghost",
                                color_scheme="gray",
                                size="2",
                                on_click=Phase1State.back_to_nl_edit,
                            ),
                            rx.button(
                                rx.hstack(
                                    rx.icon("rotate-ccw", size=14),
                                    rx.text("Start Over"),
                                    spacing="1",
                                ),
                                variant="ghost",
                                color_scheme="gray",
                                size="2",
                                on_click=Phase1State.reset_all,
                            ),
                            spacing="2",
                            flex_wrap="wrap",
                            align="center",
                        ),
                        spacing="3",
                        width="100%",
                    ),
                ),
            ),
            spacing="4",
            width="100%",
        ),
        rx.fragment(),
    )
