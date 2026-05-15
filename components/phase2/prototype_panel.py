"""prototype_panel.py — Gate 1: Design Lead approves wireframes, user flow, component tree."""

import reflex as rx
from components.expander import expander
from state.phase2 import Phase2State


_MERMAID_SCRIPT = """
(function() {
    if (window._apexMermaid) return;
    window._apexMermaid = true;

    function renderAll() {
        if (!window._mermaidReady) return;
        var els = document.querySelectorAll('.apex-mermaid:not([data-mr])');
        if (!els.length) return;
        var dark = document.documentElement.classList.contains('dark');
        try { mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default' }); } catch(e) {}
        els.forEach(function(el) { el.setAttribute('data-mr', '1'); });
        try { mermaid.run({ querySelector: '.apex-mermaid[data-mr]' }); } catch(e) {}
    }

    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
    s.onload = function() { window._mermaidReady = true; renderAll(); };
    document.head.appendChild(s);

    new MutationObserver(function() { renderAll(); })
        .observe(document.body, { childList: true, subtree: true });
})();
"""


def _generation_loader() -> rx.Component:
    return rx.cond(
        Phase2State.generating,
        expander(
            rx.hstack(
                rx.spinner(size="2"),
                rx.text("Generating design bundle...", size="2", weight="medium"),
                spacing="2",
                align="center",
            ),
            rx.vstack(
                rx.foreach(
                    Phase2State.generation_log,
                    lambda msg: rx.hstack(
                        rx.icon("chevron-right", size=13, color=rx.color("accent", 9)),
                        rx.text(msg, size="2", color=rx.color("gray", 11)),
                        spacing="1",
                        align="center",
                    ),
                ),
                spacing="2",
                width="100%",
            ),
            initially_open=True,
        ),
        rx.fragment(),
    )


def _wireframes_section() -> rx.Component:
    return expander(
        rx.text("Wireframes · Screen Mockups", size="2", weight="medium"),
        rx.cond(
            Phase2State.gate1_approved,
            rx.box(
                rx.text(
                    Phase2State.wireframes_edit,
                    white_space="pre",
                    font_family="'JetBrains Mono', 'Fira Code', monospace",
                    font_size="12px",
                    line_height="1.6",
                    color=rx.color("gray", 12),
                ),
                width="100%",
                overflow_x="auto",
                overflow_y="auto",
                max_height="440px",
                padding="14px",
                background=rx.color("gray", 2),
                border_radius="6px",
                border=f"1px solid {rx.color('gray', 4)}",
            ),
            rx.text_area(
                value=Phase2State.wireframes_edit,
                on_change=Phase2State.set_wireframes_edit,
                placeholder="ASCII wireframes will appear here...",
                rows="16",
                width="100%",
                font_family="'JetBrains Mono', 'Fira Code', monospace",
                font_size="12px",
            ),
        ),
        initially_open=True,
    )


def _mermaid_preview_box() -> rx.Component:
    return rx.box(
        rx.html(Phase2State.user_flow_mermaid_html),
        width="100%",
        overflow_x="auto",
        overflow_y="auto",
        padding="14px",
        background=rx.color("gray", 1),
        border_radius="6px",
        border=f"1px solid {rx.color('gray', 4)}",
        min_height="160px",
    )


def _user_flow_section() -> rx.Component:
    return expander(
        rx.text("User Flow · Mermaid Diagram", size="2", weight="medium"),
        rx.cond(
            Phase2State.gate1_approved,
            _mermaid_preview_box(),
            rx.tabs.root(
                rx.tabs.list(
                    rx.tabs.trigger("Code", value="code"),
                    rx.tabs.trigger("Preview", value="preview"),
                    size="1",
                ),
                rx.tabs.content(
                    rx.text_area(
                        value=Phase2State.user_flow_edit,
                        on_change=Phase2State.set_user_flow_edit,
                        placeholder="flowchart TD\n    A[Start] --> B[...]",
                        rows="14",
                        width="100%",
                        font_family="'JetBrains Mono', 'Fira Code', monospace",
                        font_size="12px",
                    ),
                    value="code",
                    padding_top="8px",
                ),
                rx.tabs.content(
                    _mermaid_preview_box(),
                    value="preview",
                    padding_top="8px",
                ),
                default_value="code",
                width="100%",
            ),
        ),
        initially_open=True,
    )


def _component_tree_section() -> rx.Component:
    return expander(
        rx.text("Component Tree", size="2", weight="medium"),
        rx.cond(
            Phase2State.gate1_approved,
            rx.cond(
                Phase2State.component_tree_html != "",
                rx.html(Phase2State.component_tree_html),
                rx.text("No component tree.", size="2", color=rx.color("gray", 9)),
            ),
            rx.tabs.root(
                rx.tabs.list(
                    rx.tabs.trigger("Code", value="code"),
                    rx.tabs.trigger("Preview", value="preview"),
                    size="1",
                ),
                rx.tabs.content(
                    rx.text_area(
                        value=Phase2State.component_tree_edit,
                        on_change=Phase2State.set_component_tree_edit,
                        placeholder="Component hierarchy will appear here...",
                        rows="12",
                        width="100%",
                        font_family="'JetBrains Mono', 'Fira Code', monospace",
                        font_size="12px",
                    ),
                    value="code",
                    padding_top="8px",
                ),
                rx.tabs.content(
                    rx.cond(
                        Phase2State.component_tree_html != "",
                        rx.html(Phase2State.component_tree_html),
                        rx.text("Start typing to see preview.", size="2", color=rx.color("gray", 9), padding="8px"),
                    ),
                    value="preview",
                    padding_top="8px",
                ),
                default_value="code",
                width="100%",
            ),
        ),
        initially_open=True,
    )


def prototype_panel() -> rx.Component:
    return rx.vstack(
        rx.script(_MERMAID_SCRIPT),
        rx.hstack(
            rx.heading("Gate 1 · Visual Design", size="5", weight="bold"),
            rx.badge("Design Lead", color_scheme="violet", size="2"),
            rx.cond(
                Phase2State.gate1_approved,
                rx.badge(
                    rx.hstack(rx.icon("lock", size=12), rx.text("Approved"), spacing="1"),
                    color_scheme="green",
                    size="2",
                ),
                rx.fragment(),
            ),
            spacing="3",
            align="center",
            width="100%",
        ),
        rx.button(
            rx.cond(
                Phase2State.generating,
                rx.hstack(rx.spinner(size="2"), rx.text("Generating..."), spacing="2"),
                rx.hstack(rx.icon("sparkles", size=16), rx.text("Generate Design Bundle"), spacing="2"),
            ),
            on_click=Phase2State.run_generate,
            disabled=Phase2State.generating | ~Phase2State.can_generate,
            color_scheme="violet",
            size="3",
            width="100%",
        ),
        _generation_loader(),
        rx.cond(
            Phase2State.generate_error != "",
            rx.callout(Phase2State.generate_error, color="red", size="1"),
            rx.fragment(),
        ),
        rx.cond(
            Phase2State.wireframes_edit != "",
            rx.vstack(
                _wireframes_section(),
                _user_flow_section(),
                _component_tree_section(),
                rx.cond(
                    ~Phase2State.gate1_approved,
                    rx.button(
                        rx.hstack(
                            rx.icon("check_check", size=16),
                            rx.text("Approve Visual Design"),
                            spacing="2",
                        ),
                        on_click=Phase2State.approve_gate1,
                        disabled=~Phase2State.can_approve_gate1,
                        color_scheme="green",
                        size="3",
                        width="100%",
                    ),
                    rx.callout(
                        rx.hstack(
                            rx.icon("lock", size=14),
                            rx.text("Visual design approved — Gate 2 unlocked."),
                            spacing="2",
                            align="center",
                        ),
                        color="green",
                        size="1",
                    ),
                ),
                spacing="3",
                width="100%",
            ),
            rx.fragment(),
        ),
        padding="16px",
        border="1px solid var(--gray-6)",
        border_radius="8px",
        background=rx.color("gray", 1),
        width="100%",
        spacing="4",
    )
