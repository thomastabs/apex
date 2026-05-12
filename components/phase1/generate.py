"""generate.py — Step 2: Generate Natural Language Stories."""

import reflex as rx
from components.expander import expander
from state.context import ContextState
from state.phase1 import Phase1State


def _generation_loader() -> rx.Component:
    """Streamlit-style status expander shown while stories are being generated."""
    return rx.cond(
        Phase1State.generating,
        expander(
            rx.hstack(
                rx.spinner(size="2"),
                rx.text("Generating user stories…", size="2", weight="medium"),
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
    )


def generate_section() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.heading("Step 2 · Generate User Stories", size="6", class_name="apex-step-heading"),
            rx.spacer(),
            rx.cond(
                Phase1State.has_nl_draft,
                rx.button(
                    rx.hstack(rx.icon("rotate-ccw", size=14), rx.text("Start Over"), spacing="1"),
                    variant="ghost",
                    color_scheme="gray",
                    size="2",
                    on_click=Phase1State.reset_all,
                ),
                rx.fragment(),
            ),
            align="center",
            width="100%",
        ),
        # ── Blockers ──────────────────────────────────────────────────────────
        rx.cond(
            ~Phase1State.is_authenticated,
            rx.callout(
                "Sign in to Taiga using the ⇄ button in the sidebar to generate and push stories.",
                color="blue",
                size="1",
            ),
            rx.fragment(),
        ),
        rx.cond(
            Phase1State.is_authenticated & ~Phase1State.has_project,
            rx.callout(
                "No Taiga project selected — choose one in the sidebar under Change project.",
                color="orange",
                size="1",
            ),
            rx.fragment(),
        ),
        rx.cond(
            Phase1State.is_authenticated & ~ContextState.has_project_concept,
            rx.callout(
                "No Project Concept found in the Memory Bank — add one under "
                "## Project Concept in the sidebar before generating.",
                color="amber",
                size="1",
            ),
            rx.fragment(),
        ),
        # ── Ready hint — violet so it's readable in both dark and light mode ─
        rx.cond(
            Phase1State.is_authenticated
            & Phase1State.has_project
            & ContextState.has_project_concept
            & ~Phase1State.has_nl_draft,
            rx.callout(
                "Fill in your Epic above, then click Generate to create Natural Language user stories.",
                color="violet",
                size="1",
            ),
            rx.fragment(),
        ),
        # ── Generation progress loader ────────────────────────────────────────
        _generation_loader(),
        # ── Controls (only shown when authenticated + project set) ────────────
        rx.cond(
            Phase1State.is_authenticated & Phase1State.has_project,
            rx.vstack(
                rx.vstack(
                    rx.hstack(
                        rx.text("AI Guidance", size="3", weight="medium"),
                        rx.text("Optional", size="2", color=rx.color("gray", 9)),
                        spacing="2",
                        align="center",
                    ),
                    rx.input(
                        value=Phase1State.ai_hint_input,
                        placeholder="e.g. focus on error handling and edge cases",
                        on_change=Phase1State.set_ai_hint,
                        size="3",
                        width="100%",
                    ),
                    spacing="1",
                    width="100%",
                ),
                rx.button(
                    rx.cond(
                        Phase1State.generating,
                        rx.hstack(
                            rx.spinner(size="2"),
                            rx.text("Generating stories…"),
                            spacing="2",
                        ),
                        rx.hstack(
                            rx.icon("sparkles", size=16),
                            rx.text("Generate Stories"),
                            spacing="2",
                        ),
                    ),
                    on_click=Phase1State.run_generate,
                    disabled=Phase1State.generating | ~Phase1State.can_generate,
                    color_scheme="violet",
                    size="3",
                    width="100%",
                ),
                rx.cond(
                    Phase1State.ai_error != "",
                    rx.callout(Phase1State.ai_error, color="red", size="1"),
                    rx.fragment(),
                ),
                spacing="3",
                width="100%",
            ),
            rx.fragment(),
        ),
        spacing="3",
        width="100%",
    )
