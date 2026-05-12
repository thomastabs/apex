"""index.py — Home dashboard at /."""

import reflex as rx

from components.sidebar import sidebar
from components.phase_nav_tabs import phase_nav_tabs
from state.auth import AuthState
from state.project import ProjectState

_PHASES = [
    ("/phase1", "Phase 1", "Requirements",    "Mob Elaboration — transform epics into formal Gherkin acceptance criteria", "file-text"),
    ("/phase2", "Phase 2", "Design",           "Technical architecture & specifications for each user story",               "compass"),
    ("/phase3", "Phase 3", "Implementation",   "AI-assisted development aligned to Gherkin specs and context",             "code"),
    ("/phase4", "Phase 4", "Testing",          "BDD validation, QA coverage tracking and Fix-Apex cycles",                 "circle-check"),
    ("/phase5", "Phase 5", "Deployment",       "Release management, Apex board review and staging sign-off",               "rocket"),
    ("/phase6", "Phase 6", "Maintenance",      "Continuous evolution, bug remediation and knowledge capture",              "wrench"),
]


def _phase_card(route: str, num: str, name: str, desc: str, icon_name: str) -> rx.Component:
    return rx.link(
        rx.box(
            rx.vstack(
                rx.hstack(
                    rx.icon(icon_name, size=18, color=rx.color("accent", 9)),
                    rx.vstack(
                        rx.text(num, size="1", weight="bold", color=rx.color("accent", 10)),
                        rx.text(name, size="3", weight="bold", color=rx.color("gray", 12)),
                        spacing="0",
                    ),
                    spacing="3",
                    align="center",
                ),
                rx.text(desc, size="2", color=rx.color("gray", 10), line_height="1.55"),
                rx.text("Open →", size="2", color=rx.color("accent", 10), weight="medium"),
                spacing="3",
                align="start",
            ),
            padding="20px",
            border_radius="var(--radius-3)",
            background=rx.color("gray", 2),
            border=f"1px solid {rx.color('gray', 4)}",
            _hover={
                "background": rx.color("accent", 2),
                "border_color": rx.color("accent", 6),
                "box_shadow": "0 2px 10px rgba(0,0,0,0.1)",
            },
            transition="all 0.15s",
            cursor="pointer",
            height="100%",
        ),
        href=route,
        text_decoration="none",
        width="100%",
        display="block",
        height="100%",
    )


def index_content() -> rx.Component:
    return rx.box(
        rx.container(
            rx.vstack(
                rx.vstack(
                    rx.heading("Apex", size="9", weight="bold", color=rx.color("accent", 11)),
                    rx.text(
                        "Spec-Anchored Human–AI Collaboration Framework for the SDLC",
                        size="4",
                        color=rx.color("gray", 10),
                    ),
                    rx.cond(
                        AuthState.is_authenticated,
                        rx.hstack(
                            rx.badge(
                                rx.hstack(
                                    rx.icon("check", size=12),
                                    rx.text(AuthState.taiga_username),
                                    spacing="1",
                                    align="center",
                                ),
                                color_scheme="green",
                                size="2",
                            ),
                            rx.cond(
                                ProjectState.has_project,
                                rx.badge(ProjectState.project_name, color_scheme="violet", size="2"),
                                rx.fragment(),
                            ),
                            spacing="2",
                            flex_wrap="wrap",
                        ),
                        rx.callout(
                            "Sign in to Taiga using the ⇄ button in the sidebar to get started.",
                            color="blue",
                            size="2",
                        ),
                    ),
                    spacing="3",
                ),
                rx.separator(size="4"),
                rx.vstack(
                    rx.text(
                        "SDLC PHASES",
                        size="1",
                        weight="bold",
                        color=rx.color("gray", 9),
                        letter_spacing="0.1em",
                    ),
                    rx.grid(
                        *[_phase_card(r, n, name, d, i) for r, n, name, d, i in _PHASES],
                        columns="2",
                        spacing="3",
                        width="100%",
                    ),
                    spacing="3",
                    width="100%",
                ),
                spacing="6",
                width="100%",
                padding_bottom="48px",
            ),
            max_width="860px",
            padding_x="32px",
            padding_y="32px",
        ),
        flex="1",
        overflow_y="auto",
    )


def index_page() -> rx.Component:
    return rx.hstack(
        sidebar(),
        rx.vstack(
            phase_nav_tabs(),
            index_content(),
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
