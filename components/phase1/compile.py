"""compile.py — Step 4: Compile NL draft to Gherkin."""

import reflex as rx
from components.expander import expander
from state.phase1 import Phase1State


def compile_section() -> rx.Component:
    return rx.cond(
        Phase1State.has_nl_draft & ~Phase1State.has_compiled,
        rx.vstack(
            rx.heading("Step 4 · Compile to Gherkin", size="6", class_name="apex-step-heading"),
            rx.text(
                "Convert the NL draft into formal Gherkin acceptance criteria — AI will structure "
                "each story as a Feature with Scenario blocks.",
                size="2",
                color=rx.color("gray", 10),
            ),
            rx.cond(
                Phase1State.compile_error != "",
                rx.callout(Phase1State.compile_error, color="red", size="1"),
                rx.fragment(),
            ),
            rx.cond(
                Phase1State.compiling,
                expander(
                    rx.hstack(
                        rx.spinner(size="2"),
                        rx.text("Compiling to Gherkin…", size="2", weight="medium"),
                        spacing="2",
                        align="center",
                    ),
                    rx.vstack(
                        rx.foreach(
                            Phase1State.compile_log,
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
                rx.hstack(
                    rx.button(
                        rx.hstack(
                            rx.icon("file-code", size=16),
                            rx.text("Compile to Gherkin"),
                            spacing="2",
                        ),
                        on_click=Phase1State.run_compile,
                        disabled=Phase1State.compiling,
                        color_scheme="violet",
                        size="3",
                    ),
                    rx.button(
                        rx.hstack(rx.icon("rotate-ccw", size=14), rx.text("Start Over"), spacing="1"),
                        variant="ghost",
                        color_scheme="gray",
                        size="2",
                        on_click=Phase1State.reset_all,
                    ),
                    spacing="2",
                    align="center",
                ),
            ),
            spacing="4",
            width="100%",
        ),
        rx.fragment(),
    )
