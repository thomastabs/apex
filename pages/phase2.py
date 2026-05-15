import reflex as rx
from components.expander import expander
from components.sidebar import sidebar
from components.phase_nav_tabs import phase_nav_tabs
from components.phase2.tech_stack_stage import tech_stack_stage
from components.phase2.epic_selector import epic_selector_section
from components.phase2.prototype_panel import prototype_panel
from components.phase2.spec_panel import spec_panel
from state.phase2 import Phase2State


def _action_bar() -> rx.Component:
    return rx.hstack(
        rx.button(
            rx.cond(
                Phase2State.saving,
                rx.hstack(rx.spinner(size="2"), rx.text("Saving..."), spacing="2"),
                rx.hstack(rx.icon("save", size=16), rx.text("Save & Lock Design"), spacing="2"),
            ),
            on_click=Phase2State.save_design,
            disabled=~Phase2State.can_save | Phase2State.saving,
            color_scheme="green",
            size="3",
        ),
        rx.button(
            rx.hstack(rx.icon("rotate-ccw", size=14), rx.text("Reset"), spacing="1"),
            on_click=Phase2State.reset_story,
            variant="soft",
            color_scheme="red",
            size="2",
            disabled=Phase2State.saving,
        ),
        spacing="3",
        flex_wrap="wrap",
        align="center",
    )



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
                src="/images/design.svg",
                width="100%",
                border_radius="8px",
            ),
            rx.text(
                "Stage A · Confirm Tech Stack  →  Stage B · Select Epic  →  "
                "Generate Design Bundle (wireframes + user flow + component tree + OpenAPI spec)  →  "
                "Gate 1: Design Lead approves  →  Gate 2: Tech Lead approves  →  "
                "Save locks all epic stories to design_locked.",
                size="1",
                color=rx.color("gray", 9),
                line_height="1.7",
            ),
            spacing="3",
            width="100%",
        ),
    )


def _phase2_body() -> rx.Component:
    return rx.vstack(
        rx.vstack(
            rx.heading("Phase 2 · Design", size="8", weight="bold"),
            rx.text(
                "Design Lead + Tech Lead gate: visual prototype and OpenAPI spec per epic.",
                size="3",
                color=rx.color("gray", 10),
            ),
            spacing="1",
            width="100%",
        ),
        _process_diagram(),
        rx.separator(size="4"),
        tech_stack_stage(),
        rx.cond(
            Phase2State.tech_stack_confirmed,
            rx.vstack(
                epic_selector_section(),
                rx.cond(
                    Phase2State.selected_epic_id > 0,
                    rx.vstack(
                        prototype_panel(),
                        spec_panel(),
                        rx.cond(
                            Phase2State.design_complete,
                            rx.callout(
                                rx.hstack(
                                    rx.icon("check_check", size=14),
                                    rx.text("Design locked for all stories in this epic."),
                                    spacing="2",
                                    align="center",
                                ),
                                color="green",
                                size="2",
                            ),
                            _action_bar(),
                        ),
                        spacing="5",
                        width="100%",
                    ),
                    rx.fragment(),
                ),
                spacing="5",
                width="100%",
            ),
            rx.callout(
                "Define and confirm the project tech stack above before designing epics.",
                color="blue",
                size="2",
            ),
        ),
        spacing="5",
        width="100%",
        padding_bottom="48px",
    )


def phase2_content() -> rx.Component:
    return rx.box(
        phase_nav_tabs(),
        rx.box(
            _phase2_body(),
            width="100%",
            padding_x="32px",
            class_name="apex-content-body",
            padding_y="28px",
        ),
        flex="1",
        overflow_y="auto",
        min_height="100vh",
        class_name=rx.cond(
            Phase2State.generating | Phase2State.stack_suggesting | Phase2State.saving,
            "apex-busy",
            "",
        ),
    )


def phase2_page() -> rx.Component:
    return rx.hstack(
        sidebar(),
        phase2_content(),
        spacing="0",
        width="100%",
        align="start",
    )
