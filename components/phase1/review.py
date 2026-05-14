"""review.py — Step 3: Review and edit the NL draft."""

import reflex as rx
from state.phase1 import Phase1State


def review_section() -> rx.Component:
    return rx.cond(
        Phase1State.has_nl_draft,
        rx.vstack(
            rx.hstack(
                rx.heading("Step 3 · Review NL Draft", size="6", class_name="apex-step-heading"),
                rx.spacer(),
                rx.badge(
                    "Draft ready",
                    color_scheme="green",
                    variant="surface",
                    size="1",
                ),
                align="center",
                width="100%",
            ),
            rx.text(
                "Edit the AI-generated Natural Language draft — add, remove, or rewrite stories "
                "in plain language. When satisfied, click Compile to Gherkin below.",
                size="2",
                color=rx.color("gray", 10),
            ),
            rx.text_area(
                value=Phase1State.nl_editor,
                on_change=Phase1State.set_nl_editor,
                rows="16",
                width="100%",
                font_family="'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                font_size="13px",
            ),
            spacing="3",
            width="100%",
        ),
        rx.fragment(),
    )
