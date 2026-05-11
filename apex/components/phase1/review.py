"""review.py — Step 3: Review and edit the NL draft."""

import reflex as rx
from apex.state.phase1 import Phase1State


def review_section() -> rx.Component:
    return rx.cond(
        Phase1State.has_nl_draft,
        rx.vstack(
            rx.heading("Step 3 · Review NL Draft", size="4"),
            rx.text(
                "Review and edit the AI-generated Natural Language draft below. "
                "Edit freely — add, remove, or rewrite stories in plain language. "
                "When satisfied, click Compile to Gherkin below.",
                size="2",
                color_scheme="gray",
            ),
            rx.text_area(
                value=Phase1State.nl_editor,
                on_change=Phase1State.set_nl_editor,
                rows="16",
                width="100%",
                font_family="monospace",
                font_size="13px",
            ),
            spacing="3",
            width="100%",
        ),
        rx.fragment(),
    )
