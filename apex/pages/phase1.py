"""phase1.py — Phase 1 · Requirements page."""

import reflex as rx

from apex.state.auth import AuthState
from apex.state.context import ContextState
from apex.state.phase1 import Phase1State
from apex.state.project import ProjectState
from apex.components.sidebar import sidebar
from apex.components.phase1.step1 import step1
from apex.components.phase1.generate import generate_section
from apex.components.phase1.review import review_section
from apex.components.phase1.compile import compile_section
from apex.components.phase1.gherkin_review import gherkin_review_section


def phase1_content() -> rx.Component:
    return rx.box(
        rx.vstack(
            rx.heading("Phase 1 · Requirements", size="6"),
            rx.text(
                "Mob Elaboration — transform an Epic into formal Gherkin Acceptance Criteria",
                size="2",
                color_scheme="gray",
            ),
            rx.separator(width="100%"),
            step1(),
            rx.separator(width="100%"),
            generate_section(),
            review_section(),
            compile_section(),
            gherkin_review_section(),
            spacing="5",
            width="100%",
            max_width="800px",
        ),
        padding="32px",
        flex="1",
        overflow_y="auto",
    )


def phase1_page() -> rx.Component:
    return rx.hstack(
        sidebar(),
        phase1_content(),
        spacing="0",
        width="100%",
        min_height="100vh",
        align="start",
    )


