"""nav.py — Phase navigation links with active-state highlighting and progress badges."""

import reflex as rx
from state.context import ContextState

_PHASES = [
    ("/",       "Phase 1 · Requirements", None),
    ("/phase2", "Phase 2 · Design",           ContextState.phase2_badge),
    ("/phase3", "Phase 3 · Implementation",   ContextState.phase3_badge),
    ("/phase4", "Phase 4 · Testing",          ContextState.phase4_badge),
    ("/phase5", "Phase 5 · Deployment",       ContextState.phase5_badge),
    ("/phase6", "Phase 6 · Maintenance",      None),
]


def _phase_link(route: str, label: str, badge_var) -> rx.Component:
    is_active = rx.State.router.page.path == route
    link_box = rx.box(
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
    )

    badge_row = rx.fragment()
    if badge_var is not None:
        badge_row = rx.cond(
            badge_var != "",
            rx.text(
                badge_var,
                size="1",
                color_scheme="gray",
                padding_left="12px",
                padding_bottom="2px",
            ),
            rx.fragment(),
        )

    return rx.vstack(
        rx.link(link_box, href=route, text_decoration="none", width="100%"),
        badge_row,
        spacing="0",
        width="100%",
        align="start",
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
        *[_phase_link(route, label, badge) for route, label, badge in _PHASES],
        spacing="1",
        width="100%",
        align="start",
    )
