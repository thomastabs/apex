import reflex as rx


def phase3_page() -> rx.Component:
    return rx.box(
        rx.heading("Phase 3 · Implementation", size="6"),
        rx.text("Coming in the next iteration.", color_scheme="gray"),
    )


