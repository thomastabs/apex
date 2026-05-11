"""nav.py — Phase navigation links with active-state highlighting."""

import reflex as rx
from state.auth import AuthState

_PHASES = [
    ("/",       "Phase 1 · Requirements"),
    ("/phase2", "Phase 2 · Design"),
    ("/phase3", "Phase 3 · Implementation"),
    ("/phase4", "Phase 4 · Testing"),
    ("/phase5", "Phase 5 · Deployment"),
    ("/phase6", "Phase 6 · Maintenance"),
]


def _phase_link(route: str, label: str) -> rx.Component:
    is_active = rx.State.router.page.path == route
    return rx.link(
        rx.box(
            label,
            padding="6px 12px",
            border_radius="6px",
            font_size="13px",
            font_weight=rx.cond(is_active, "600", "400"),
            background=rx.cond(is_active, rx.color("accent", 3), "transparent"),
            color=rx.cond(is_active, rx.color("accent", 11), rx.color("gray", 11)),
            _hover={"background": rx.color("accent", 2), "color": rx.color("accent", 11)},
            width="100%",
            transition="all 0.15s",
        ),
        href=route,
        text_decoration="none",
        width="100%",
    )


def phase_nav() -> rx.Component:
    return rx.vstack(
        rx.text(
            "SDLC PHASES",
            font_size="10px",
            font_weight="700",
            letter_spacing="0.08em",
            color=rx.color("accent", 9),
            padding="4px 12px",
        ),
        *[_phase_link(route, label) for route, label in _PHASES],
        spacing="1",
        width="100%",
        align="start",
    )
