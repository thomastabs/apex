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

# Active state driven entirely client-side — no server round-trip.
# On each mount updateActiveTabs() reads window.location.pathname and sets
# data-tab-active="1" on the matching tab; CSS drives all visual state.
_TABS_SCRIPT = """
(function() {
  function updateActiveTabs() {
    var path = window.location.pathname;
    document.querySelectorAll('a[data-tab]').forEach(function(el) {
      el.dataset.tabActive = el.getAttribute('data-tab') === path ? '1' : '0';
    });
  }
  updateActiveTabs();
  if (window._apexTabs) return;
  window._apexTabs = true;
  document.addEventListener('click', function(e) {
    var tab = e.target.closest('a[data-tab]');
    if (!tab) return;
    document.querySelectorAll('a[data-tab]').forEach(function(el) {
      el.dataset.tabActive = '0';
    });
    tab.dataset.tabActive = '1';
  });
  window.addEventListener('popstate', function() { updateActiveTabs(); });
  // Re-run whenever React replaces tab DOM nodes after SPA navigation
  new MutationObserver(function() { updateActiveTabs(); })
    .observe(document.body, { childList: true, subtree: true });
})();
"""


def _tab(route: str, num: str, label: str) -> rx.Component:
    return rx.link(
        rx.vstack(
            rx.text("Phase " + num, size="1", weight="medium", class_name="apex-tab-num"),
            rx.text(label, size="2", class_name="apex-tab-label"),
            rx.box(height="2px", width="100%", border_radius="1px 1px 0 0", class_name="apex-tab-bar"),
            spacing="0",
            align="center",
            padding_x="14px",
            padding_top="8px",
            padding_bottom="0",
            min_width="80px",
            class_name="apex-tab-inner",
        ),
        href=route,
        text_decoration="none",
        height="100%",
        data_tab=route,
        class_name="apex-tab",
    )


def phase_nav_tabs() -> rx.Component:
    return rx.hstack(
        rx.script(_TABS_SCRIPT),
        rx.link(
            rx.hstack(
                rx.icon("house", size=15, color=rx.color("gray", 9)),
                align="center",
                padding_x="14px",
                height="100%",
                class_name="apex-tab-home-inner",
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
        position="sticky",
        top="0",
        z_index="100",
        class_name="apex-phase-tabs-bar",
    )
