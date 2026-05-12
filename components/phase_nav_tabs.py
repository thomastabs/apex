"""phase_nav_tabs.py — Horizontal phase tab bar shown at top of every phase page."""

import reflex as rx

_PHASES = [
    ("/phase1", "1", "Requirements"),
    ("/phase2", "2", "Design"),
    ("/phase3", "3", "Implementation"),
    ("/phase4", "4", "Testing"),
    ("/phase5", "5", "Deployment"),
    ("/phase6", "6", "Maintenance"),
]


def _tab(route: str, num: str, label: str) -> rx.Component:
    is_active = rx.State.router.page.path == route
    return rx.link(
        rx.vstack(
            rx.text(
                "Phase " + num,
                size="1",
                weight="medium",
                color=rx.cond(is_active, rx.color("accent", 10), rx.color("gray", 9)),
            ),
            rx.text(
                label,
                size="2",
                weight=rx.cond(is_active, "bold", "regular"),
                color=rx.cond(is_active, rx.color("accent", 12), rx.color("gray", 11)),
            ),
            # Bottom indicator bar
            rx.box(
                height="2px",
                width="100%",
                background=rx.cond(is_active, rx.color("accent", 9), "transparent"),
                border_radius="1px 1px 0 0",
            ),
            spacing="0",
            align="center",
            padding_x="14px",
            padding_top="8px",
            padding_bottom="0",
            min_width="80px",
            background=rx.cond(is_active, rx.color("accent", 2), "transparent"),
            _hover={"background": rx.cond(is_active, rx.color("accent", 2), rx.color("gray", 3))},
            transition="background 0.1s",
            cursor="pointer",
        ),
        href=route,
        text_decoration="none",
        height="100%",
    )


def phase_nav_tabs() -> rx.Component:
    return rx.hstack(
        rx.link(
            rx.hstack(
                rx.icon("house", size=15, color=rx.color("gray", 9)),
                align="center",
                padding_x="14px",
                height="100%",
                _hover={"background": rx.color("gray", 3)},
                transition="background 0.1s",
            ),
            href="/",
            text_decoration="none",
            height="100%",
            title="Home",
        ),
        rx.box(width="1px", height="28px", background=rx.color("gray", 5), flex_shrink="0"),
        *[_tab(r, n, l) for r, n, l in _PHASES],
        spacing="0",
        align="stretch",
        width="100%",
        height="52px",
        border_bottom="1px solid var(--gray-4)",
        background="var(--gray-1)",
        overflow_x="auto",
        flex_shrink="0",
    )
