import reflex as rx


def phase5_page() -> rx.Component:
    return rx.box(
        rx.heading("Phase 5 · Deployment", size="6"),
        rx.text("Coming in the next iteration.", color_scheme="gray"),
    )


