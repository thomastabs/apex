"""spec_panel.py — Gate 2: Tech Lead approves OpenAPI + DB schema spec."""

import reflex as rx
from state.phase2 import Phase2State


def spec_panel() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.heading("Gate 2 · Technical Spec", size="5", weight="bold"),
            rx.badge("Tech Lead", color_scheme="blue", size="2"),
            rx.cond(
                Phase2State.gate2_approved,
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
        rx.cond(
            ~Phase2State.gate1_approved,
            rx.callout("Approve Visual Design (Gate 1) before editing the technical spec.",
                       color="blue", size="1"),
            rx.fragment(),
        ),
        rx.cond(
            Phase2State.tech_spec_edit != "",
            rx.vstack(
                rx.text("OpenAPI 3.0 YAML + DB Schema", size="2", weight="medium"),
                rx.text_area(
                    value=Phase2State.tech_spec_edit,
                    on_change=Phase2State.set_tech_spec_edit,
                    placeholder="OpenAPI 3.0 YAML and DB schema DDL will appear here...",
                    rows="20",
                    width="100%",
                    disabled=Phase2State.gate2_approved,
                    font_family="'JetBrains Mono', 'Fira Code', monospace",
                    font_size="12px",
                ),
                rx.cond(
                    ~Phase2State.gate2_approved,
                    rx.button(
                        rx.hstack(
                            rx.icon("check_check", size=16),
                            rx.text("Approve Technical Spec"),
                            spacing="2",
                        ),
                        on_click=Phase2State.approve_gate2,
                        disabled=~Phase2State.can_approve_gate2,
                        color_scheme="green",
                        size="3",
                        width="100%",
                    ),
                    rx.callout(
                        rx.hstack(
                            rx.icon("lock", size=14),
                            rx.text("Technical spec approved — ready to save."),
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
        rx.cond(
            Phase2State.save_error != "",
            rx.callout(Phase2State.save_error, color="red", size="1"),
            rx.fragment(),
        ),
        padding="16px",
        border="1px solid var(--gray-6)",
        border_radius="8px",
        background=rx.color("gray", 1),
        width="100%",
        spacing="4",
    )
