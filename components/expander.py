"""expander.py — Streamlit-style collapsible expander via native <details>/<summary>.

Uses no Reflex state — the browser tracks open/close per element natively.
Each expander is independent; multiple can be open simultaneously.
"""

import reflex as rx


def expander(
    summary: str | rx.Component,
    *children: rx.Component,
    initially_open: bool = False,
    body_padding: str = "12px 14px 14px",
    **props,
) -> rx.Component:
    """Return a styled <details> block that looks like st.expander().

    Args:
        summary:        Header text (str) or any rx.Component.
        *children:      Body content shown when expanded.
        initially_open: If True, renders with the `open` attribute set.
        body_padding:   CSS padding for the body area.
        **props:        Extra props forwarded to the <details> element.
    """
    summary_content = (
        rx.text(summary, size="2", weight="medium")
        if isinstance(summary, str)
        else summary
    )

    if initially_open:
        props.setdefault("open", True)

    return rx.el.details(
        rx.el.summary(
            rx.icon("chevron-right", size=14, class_name="apex-chevron"),
            summary_content,
        ),
        rx.box(
            *children,
            class_name="apex-expander-body",
            style={"padding": body_padding},
        ),
        class_name="apex-expander",
        **props,
    )
