"""generate.py — Step 2: Generate Natural Language Stories."""

import reflex as rx
from apex.state.phase1 import Phase1State


def generate_section() -> rx.Component:
    return rx.vstack(
        rx.heading("Step 2 · Generate User Stories", size="4"),
        rx.text(
            "AI will draft Natural Language user stories from your Epic description.",
            size="2",
            color_scheme="gray",
        ),
        rx.cond(
            ~Phase1State.is_authenticated,
            rx.callout(
                "Sign in to Taiga using the ⇄ button in the sidebar to generate stories.",
                color="blue",
                size="2",
            ),
            rx.cond(
                ~Phase1State.has_project,
                rx.callout(
                    "Select a Taiga project in the sidebar to get started.",
                    color="blue",
                    size="2",
                ),
                rx.vstack(
                    rx.text("AI guidance (optional)", size="2", weight="bold"),
                    rx.input(
                        value=Phase1State.ai_hint_input,
                        placeholder="e.g. focus on error handling and edge cases",
                        on_change=Phase1State.set_ai_hint,
                        width="100%",
                    ),
                    rx.hstack(
                        rx.button(
                            rx.cond(
                                Phase1State.generating,
                                rx.hstack(rx.spinner(size="2"), rx.text("Generating…"), spacing="2"),
                                rx.text("Generate Stories"),
                            ),
                            on_click=Phase1State.run_generate,
                            disabled=Phase1State.generating | ~Phase1State.can_generate,
                            color_scheme="violet",
                        ),
                        rx.cond(
                            Phase1State.has_nl_draft,
                            rx.button(
                                "↺ Start Over",
                                variant="ghost",
                                color_scheme="gray",
                                on_click=Phase1State.reset_all,
                            ),
                            rx.fragment(),
                        ),
                        spacing="2",
                    ),
                    rx.cond(
                        Phase1State.ai_error != "",
                        rx.callout(Phase1State.ai_error, color="red", size="2"),
                        rx.fragment(),
                    ),
                    spacing="3",
                    width="100%",
                ),
            ),
        ),
        spacing="3",
        width="100%",
    )
