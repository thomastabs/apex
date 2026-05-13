"""prototype_panel.py — Gate 1: Design Lead approves wireframes, user flow, component tree."""

import reflex as rx
from components.expander import expander
from state.phase2 import Phase2State


def _generation_loader() -> rx.Component:
    return rx.cond(
        Phase2State.generating,
        expander(
            rx.hstack(
                rx.spinner(size="2"),
                rx.text("Generating design bundle...", size="2", weight="medium"),
                spacing="2",
                align="center",
            ),
            rx.vstack(
                rx.foreach(
                    Phase2State.generation_log,
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


def _section_textarea(
    label: str,
    value_var,
    on_change_handler,
    placeholder: str = "",
    rows: str = "8",
    monospace: bool = True,
) -> rx.Component:
    extra: dict = {}
    if monospace:
        extra["font_family"] = "'JetBrains Mono', 'Fira Code', monospace"
        extra["font_size"] = "12px"
    return expander(
        rx.text(label, size="2", weight="medium"),
        rx.text_area(
            value=value_var,
            on_change=on_change_handler,
            placeholder=placeholder,
            rows=rows,
            width="100%",
            disabled=Phase2State.gate1_approved,
            **extra,
        ),
        initially_open=True,
    )


def prototype_panel() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.heading("Gate 1 · Visual Design", size="5", weight="bold"),
            rx.badge("Design Lead", color_scheme="violet", size="2"),
            rx.cond(
                Phase2State.gate1_approved,
                rx.badge(
                    rx.hstack(rx.icon("lock", size=12), rx.text("Approved"), spacing="1"),
                    color_scheme="green",
                    size="2",
                ),
                rx.fragment(),
            ),
            spacing="3",
            align="center",
            width="100%",
        ),
        rx.button(
            rx.cond(
                Phase2State.generating,
                rx.hstack(rx.spinner(size="2"), rx.text("Generating..."), spacing="2"),
                rx.hstack(rx.icon("sparkles", size=16), rx.text("Generate Design Bundle"), spacing="2"),
            ),
            on_click=Phase2State.run_generate,
            disabled=Phase2State.generating | ~Phase2State.can_generate,
            color_scheme="violet",
            size="3",
            width="100%",
        ),
        _generation_loader(),
        rx.cond(
            Phase2State.generate_error != "",
            rx.callout(Phase2State.generate_error, color="red", size="1"),
            rx.fragment(),
        ),
        rx.cond(
            Phase2State.wireframes_edit != "",
            rx.vstack(
                _section_textarea(
                    "Wireframes (ASCII screen mockups)",
                    Phase2State.wireframes_edit,
                    Phase2State.set_wireframes_edit,
                    placeholder="ASCII wireframes will appear here...",
                    rows="10",
                ),
                _section_textarea(
                    "User Flow (Mermaid flowchart TD syntax)",
                    Phase2State.user_flow_edit,
                    Phase2State.set_user_flow_edit,
                    placeholder="flowchart TD\n    A[Start] --> B[...]",
                    rows="8",
                ),
                _section_textarea(
                    "Component Tree",
                    Phase2State.component_tree_edit,
                    Phase2State.set_component_tree_edit,
                    placeholder="Component hierarchy will appear here...",
                    rows="6",
                    monospace=False,
                ),
                rx.cond(
                    ~Phase2State.gate1_approved,
                    rx.button(
                        rx.hstack(
                            rx.icon("check_check", size=16),
                            rx.text("Approve Visual Design"),
                            spacing="2",
                        ),
                        on_click=Phase2State.approve_gate1,
                        disabled=~Phase2State.can_approve_gate1,
                        color_scheme="green",
                        size="3",
                        width="100%",
                    ),
                    rx.callout(
                        rx.hstack(
                            rx.icon("lock", size=14),
                            rx.text("Visual design approved — Gate 2 unlocked."),
                            spacing="2",
                            align="center",
                        ),
                        color="green",
                        size="1",
                    ),
                ),
                spacing="3",
                width="100%",
            ),
            rx.fragment(),
        ),
        padding="16px",
        border="1px solid var(--gray-6)",
        border_radius="8px",
        background=rx.color("gray", 1),
        width="100%",
        spacing="4",
    )
