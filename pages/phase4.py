import reflex as rx


def phase4_page() -> rx.Component:
    return rx.box(
        rx.heading("Phase 4 · Testing", size="6"),
        rx.text("Coming in the next iteration.", color_scheme="gray"),
    )


