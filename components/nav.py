"""nav.py — SDLC phase navigation with active highlighting and progress badges."""

import reflex as rx
from state.context import ContextState

_PHASES = [
    ("/",       "Phase 1 · Requirements", None),
    ("/phase2", "Phase 2 · Design",          ContextState.phase2_badge),
    ("/phase3", "Phase 3 · Implementation",  ContextState.phase3_badge),
    ("/phase4", "Phase 4 · Testing",         ContextState.phase4_badge),
    ("/phase5", "Phase 5 · Deployment",      ContextState.phase5_badge),
    ("/phase6", "Phase 6 · Maintenance",     None),
]


def _phase_link(route: str, label: str, badge_var) -> rx.Component:
    is_active = rx.State.router.page.path == route

    row = rx.hstack(
        rx.text(
            label,
            size="2",
            weight=rx.cond(is_active, "medium", "regular"),
            color=rx.cond(is_active, rx.color("accent", 12), rx.color("gray", 11)),
        ),
        rx.spacer(),
        *(
            [
                rx.cond(
                    badge_var != "",
                    rx.badge(badge_var, size="1", variant="surface", color_scheme="gray"),
                    rx.fragment(),
                )
            ]
            if badge_var is not None
            else []
        ),
        align="center",
        width="100%",
    )

    return rx.vstack(
        rx.link(
            rx.box(
                row,
                padding="6px 16px",
                border_radius="6px",
                background=rx.cond(is_active, rx.color("accent", 3), "transparent"),
                _hover={"background": rx.color("accent", 2)},
                width="100%",
                transition="background 0.12s",
            ),
            href=route,
            text_decoration="none",
            width="100%",
        ),
        *(
            [
                rx.cond(
                    badge_var != "",
                    rx.text(
                        badge_var,
                        size="1",
                        color=rx.color("gray", 9),
                        padding_left="16px",
                    ),
                    rx.fragment(),
                )
            ]
            if badge_var is not None
            else []
        ),
        spacing="0",
        width="100%",
        align="start",
    )


def phase_nav() -> rx.Component:
    return rx.vstack(
        *[_phase_link(route, label, badge) for route, label, badge in _PHASES],
        spacing="0",
        width="100%",
        align="start",
        padding_bottom="12px",
    )
