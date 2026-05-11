import reflex as rx


def phase6_page() -> rx.Component:
    return rx.box(
        rx.heading("Phase 6 · Maintenance", size="6"),
        rx.text("Coming in the next iteration.", color_scheme="gray"),
    )


