"""phase1.py — Phase 1 · Requirements page."""

import reflex as rx

from components.expander import expander
from components.sidebar import sidebar
from components.phase_nav_tabs import phase_nav_tabs
from components.phase1.step1 import step1
from components.phase1.generate import generate_section
from components.phase1.review import review_section
from components.phase1.compile import compile_section
from components.phase1.gherkin_review import gherkin_review_section
from state.phase1 import Phase1State


def _process_diagram() -> rx.Component:
    return expander(
        rx.hstack(
            rx.icon("circle-help", size=14, color=rx.color("gray", 9)),
            rx.text("View Process Diagram (How this works)", size="2", color=rx.color("gray", 10)),
            spacing="2",
            align="center",
        ),
        rx.vstack(
            rx.image(
                src="/images/requirements.svg",
                width="100%",
                max_width="700px",
                border_radius="8px",
            ),
            rx.text(
                "1 · Define your Epic  →  2 · AI drafts Natural Language user stories  "
                "→  3 · Review & edit  →  4 · Compile to Gherkin  →  5 · Review & push to Taiga  "
                "→  Spec saved to contextspec/ for all subsequent phases.",
                size="1",
                color=rx.color("gray", 9),
                line_height="1.7",
            ),
            spacing="3",
            width="100%",
        ),
    )


def phase1_content() -> rx.Component:
    return rx.box(
        rx.container(
            rx.vstack(
                rx.vstack(
                    rx.heading("Phase 1 · Requirements", size="8", weight="bold"),
                    rx.text(
                        "Mob Elaboration — transform an Epic into formal Gherkin Acceptance Criteria",
                        size="3",
                        color=rx.color("gray", 10),
                    ),
                    spacing="1",
                    width="100%",
                ),
                _process_diagram(),
                rx.separator(size="4"),
                step1(),
                rx.separator(size="4"),
                generate_section(),
                review_section(),
                compile_section(),
                gherkin_review_section(),
                spacing="5",
                width="100%",
                padding_bottom="48px",
            ),
            max_width="860px",
            padding_x="32px",
            padding_y="28px",
        ),
        flex="1",
        overflow_y="auto",
        class_name=rx.cond(
            Phase1State.generating | Phase1State.compiling | Phase1State.suggest_loading | Phase1State.pushing,
            "apex-busy",
            "",
        ),
    )


def phase1_page() -> rx.Component:
    return rx.hstack(
        sidebar(),
        rx.vstack(
            phase_nav_tabs(),
            phase1_content(),
            spacing="0",
            flex="1",
            height="100vh",
            overflow="hidden",
            align="start",
        ),
        spacing="0",
        width="100%",
        height="100vh",
        overflow="hidden",
        align="start",
    )
