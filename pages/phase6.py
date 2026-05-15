import reflex as rx
from components.sidebar import sidebar
from components.phase_nav_tabs import phase_nav_tabs


def phase6_content() -> rx.Component:
    return rx.box(
        phase_nav_tabs(),
        rx.box(
            rx.vstack(
                rx.vstack(
                    rx.heading("Phase 6 · Maintenance", size="8", weight="bold"),
                    rx.text(
                        "Post-release monitoring, retrospectives, and continuous improvement.",
                        size="3",
                        color=rx.color("gray", 10),
                    ),
                    spacing="1",
                    width="100%",
                ),
                rx.separator(size="4"),
                rx.callout(
                    "Phase 6 is coming in the next iteration. Complete Phases 1–5 first.",
                    color="blue",
                    size="2",
                ),
                spacing="5",
                width="100%",
                padding_bottom="48px",
            ),
            width="100%",
            padding_x="32px",
            class_name="apex-content-body",
            padding_y="28px",
        ),
        flex="1",
        overflow_y="auto",
        min_height="100vh",
    )


def phase6_page() -> rx.Component:
    return rx.hstack(
        sidebar(),
        phase6_content(),
        spacing="0",
        width="100%",
        align="start",
    )
