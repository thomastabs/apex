"""compile.py — Step 4: Compile NL draft to Gherkin."""

import reflex as rx
from apex.state.phase1 import Phase1State


def compile_section() -> rx.Component:
    return rx.cond(
        Phase1State.has_nl_draft & ~Phase1State.has_compiled,
        rx.vstack(
            rx.heading("Step 4 · Compile to Gherkin", size="4"),
            rx.hstack(
                rx.button(
                    rx.cond(
                        Phase1State.compiling,
                        rx.hstack(rx.spinner(size="2"), rx.text("Compiling…"), spacing="2"),
                        rx.text("Compile to Gherkin"),
                    ),
                    on_click=Phase1State.run_compile,
                    disabled=Phase1State.compiling,
                    color_scheme="violet",
                ),
                rx.button(
                    "↺ Start Over",
                    variant="ghost",
                    color_scheme="gray",
                    on_click=Phase1State.reset_all,
                ),
                spacing="2",
            ),
            rx.text(
                "Converts the NL draft into formal Gherkin acceptance criteria.",
                size="2",
                color_scheme="gray",
            ),
            rx.cond(
                Phase1State.compile_error != "",
                rx.callout(Phase1State.compile_error, color="red", size="2"),
                rx.fragment(),
            ),
            spacing="3",
            width="100%",
        ),
        rx.fragment(),
    )
