import reflex as rx


def phase2_page() -> rx.Component:
    return rx.box(
        rx.heading("Phase 2 · Design", size="6"),
        rx.text("Coming in the next iteration.", color_scheme="gray"),
    )


