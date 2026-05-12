import reflex as rx
from components.sidebar import sidebar
from components.phase_nav_tabs import phase_nav_tabs


def phase2_content() -> rx.Component:
    return rx.box(
        phase_nav_tabs(),
        rx.container(
            rx.vstack(
                rx.vstack(
                    rx.heading("Phase 2 · Design", size="8", weight="bold"),
                    rx.text(
                        "Technical design and architecture specifications for each story.",
                        size="3",
                        color=rx.color("gray", 10),
                    ),
                    spacing="1",
                    width="100%",
                ),
                rx.separator(size="4"),
                rx.callout(
                    "Phase 2 is coming in the next iteration. Complete Phase 1 to generate "
                    "Gherkin acceptance criteria first.",
                    color="blue",
                    size="2",
                ),
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
        min_height="100vh",
    )


def phase2_page() -> rx.Component:
    return rx.hstack(
        sidebar(),
        phase2_content(),
        spacing="0",
        width="100%",
        align="start",
    )
