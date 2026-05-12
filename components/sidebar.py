"""sidebar.py — Premium sidebar: three distinct zones, collapsible, with expanders."""

import reflex as rx

from state.auth import AuthState
from state.board import BoardState
from state.context import ContextState
from state.project import ProjectState
from state.user_mgmt import UserMgmtState
from components.expander import expander
from components.dialogs.switch_account import switch_account_dialog
from components.dialogs.create_epic import create_epic_dialog
from components.dialogs.create_story import create_story_dialog
from components.dialogs.epic_details import epic_details_dialog
from components.dialogs.story_details import story_details_dialog

# ── Shared helpers ────────────────────────────────────────────────────────────

def _zone_label(text: str) -> rx.Component:
    return rx.text(
        text.upper(),
        size="1",
        weight="bold",
        color=rx.color("accent", 11),
        letter_spacing="0.08em",
        padding="14px 16px 6px",
    )


def _zone_separator() -> rx.Component:
    return rx.separator(size="4", margin_y="4px")


# ── Header ────────────────────────────────────────────────────────────────────

def _header_row() -> rx.Component:
    return rx.hstack(
        rx.hstack(
            rx.text(
                "Apex",
                size="5",
                weight="bold",
                color=rx.color("accent", 11),
            ),
            rx.text(
                "· Spec-Anchored",
                size="2",
                color=rx.color("gray", 9),
            ),
            spacing="1",
            align="center",
            class_name="sidebar-header-title",
        ),
        rx.spacer(),
        rx.color_mode.button(size="2", variant="ghost", class_name="sidebar-header-title"),
        rx.icon_button(
            rx.icon("panel-left-close", size=15, class_name="apex-collapse-icon"),
            id="sidebar-collapse-btn",
            size="2",
            variant="ghost",
            color_scheme="gray",
            title="Collapse sidebar",
        ),
        align="center",
        width="100%",
        padding="13px 10px 11px 16px",
    )


# ── Zone 1 helpers ────────────────────────────────────────────────────────────

def _ai_status_row() -> rx.Component:
    return rx.hstack(
        rx.badge(
            rx.hstack(
                rx.icon("zap", size=11),
                rx.text("Anthropic"),
                spacing="1",
                align="center",
            ),
            color_scheme="green",
            variant="soft",
            size="1",
        ),
        rx.badge(
            "claude-sonnet-4-6",
            color_scheme="indigo",
            variant="soft",
            size="1",
            font_family="'JetBrains Mono', 'Fira Code', monospace",
        ),
        align="center",
        spacing="2",
        padding="4px 16px 8px",
    )


def _taiga_user_row() -> rx.Component:
    return rx.hstack(
        rx.cond(
            AuthState.is_authenticated,
            rx.hstack(
                rx.avatar(
                    fallback=AuthState.taiga_username[:2],
                    size="1",
                    color_scheme="violet",
                    variant="soft",
                ),
                rx.vstack(
                    rx.text(AuthState.taiga_username, size="2", weight="medium"),
                    rx.text(AuthState.taiga_email, size="1", color=rx.color("gray", 9)),
                    spacing="0",
                    align="start",
                ),
                spacing="2",
                align="center",
                flex="1",
            ),
            # Not signed in: descriptive prompt instead of bare "Not signed in"
            rx.vstack(
                rx.text(
                    "Sign in to Taiga using the ⇄ button →",
                    size="2",
                    color=rx.color("gray", 10),
                    flex="1",
                ),
                spacing="0",
                align="start",
                flex="1",
            ),
        ),
        switch_account_dialog(),
        align="center",
        width="100%",
        padding="2px 16px 10px",
    )


def _project_expander() -> rx.Component:
    return expander(
        rx.hstack(
            rx.icon("folder-open", size=14, color=rx.color("accent", 9)),
            rx.cond(
                ProjectState.has_project,
                rx.badge(
                    ProjectState.project_name,
                    color_scheme="violet",
                    variant="soft",
                    size="1",
                ),
                rx.text("No project selected", size="2", color=rx.color("gray", 9)),
            ),
            spacing="2",
            align="center",
        ),
        rx.vstack(
            rx.cond(
                ProjectState.projects_loading,
                rx.hstack(rx.spinner(size="2"), rx.text("Loading…", size="1"), spacing="2"),
                rx.vstack(
                    rx.select.root(
                        rx.select.trigger(placeholder="Select project…", width="100%"),
                        rx.select.content(
                            rx.foreach(
                                ProjectState.projects_list,
                                lambda p: rx.select.item(p["name"], value=p["id"].to_string()),
                            ),
                        ),
                        value=ProjectState.active_project_id.to_string(),
                        on_change=lambda v: ContextState.select_project(v.to(int)),
                        size="1",
                        width="100%",
                    ),
                    rx.button(
                        rx.hstack(rx.icon("refresh-cw", size=12), rx.text("Refresh"), spacing="1"),
                        size="1",
                        variant="ghost",
                        on_click=ProjectState.load_projects,
                    ),
                    spacing="2",
                    width="100%",
                ),
            ),
            rx.cond(
                ProjectState.projects_error != "",
                rx.callout(ProjectState.projects_error, color="red", size="1"),
                rx.fragment(),
            ),
            spacing="2",
            width="100%",
            on_mount=ProjectState.load_projects,
        ),
        body_padding="10px 12px 12px",
    )


def _story_row(story: dict) -> rx.Component:
    return rx.hstack(
        rx.text(
            "#", story["ref"].to_string(), " ", story["subject"],
            size="2",
            flex="1",
            no_of_lines=1,
            color=rx.color("gray", 11),
        ),
        rx.hstack(
            rx.icon_button(
                rx.icon("info", size=14),
                size="2",
                variant="ghost",
                on_click=BoardState.open_story_details(story["id"]),
                title="View / edit story",
            ),
            rx.icon_button(
                rx.icon("trash-2", size=14),
                size="2",
                variant="ghost",
                color_scheme="red",
                on_click=BoardState.delete_story(story["id"], story["epic_id"]),
                title="Delete story",
            ),
            spacing="2",
        ),
        align="center",
        width="100%",
        padding_left="24px",
        padding_y="4px",
    )


def _epic_row(epic: dict) -> rx.Component:
    epic_id = epic["id"]
    is_expanded = BoardState.expanded_epic_id == epic_id

    return rx.vstack(
        rx.hstack(
            rx.icon_button(
                rx.cond(
                    is_expanded,
                    rx.icon("chevron-down", size=14),
                    rx.icon("chevron-right", size=14),
                ),
                size="2",
                variant="ghost",
                on_click=BoardState.toggle_epic(epic_id),
            ),
            rx.text(
                "#", epic["ref"].to_string(), " ", epic["subject"],
                size="2",
                flex="1",
                no_of_lines=1,
                weight="medium",
            ),
            rx.hstack(
                rx.icon_button(
                    rx.icon("info", size=14),
                    size="2",
                    variant="ghost",
                    on_click=BoardState.open_epic_details(epic_id),
                    title="View / edit epic",
                ),
                rx.icon_button(
                    rx.icon("plus", size=14),
                    size="2",
                    variant="ghost",
                    on_click=BoardState.open_create_story(epic_id),
                    title="Add story",
                ),
                rx.icon_button(
                    rx.icon("trash-2", size=14),
                    size="2",
                    variant="ghost",
                    color_scheme="red",
                    on_click=BoardState.delete_epic(epic_id),
                    title="Delete epic",
                ),
                spacing="2",
            ),
            align="center",
            width="100%",
        ),
        rx.cond(
            is_expanded,
            rx.vstack(
                rx.cond(
                    BoardState.expanded_stories.length() > 0,
                    rx.foreach(BoardState.expanded_stories, _story_row),
                    rx.text("  No stories.", size="1", color=rx.color("gray", 9), padding_left="24px"),
                ),
                width="100%",
                spacing="0",
            ),
            rx.fragment(),
        ),
        width="100%",
        spacing="0",
    )


def _board_expander() -> rx.Component:
    return expander(
        rx.hstack(
            rx.icon("layers", size=14, color=rx.color("accent", 9)),
            rx.text("Epics & Stories", size="2", weight="medium"),
            spacing="2",
            align="center",
        ),
        rx.vstack(
            rx.hstack(
                rx.text(
                    BoardState.board_epics.length().to_string() + " epic(s)",
                    size="1",
                    color=rx.color("gray", 9),
                ),
                rx.spacer(),
                rx.button(
                    rx.icon("plus", size=12),
                    "Epic",
                    size="1",
                    variant="ghost",
                    on_click=BoardState.open_create_epic,
                    spacing="1",
                ),
                rx.icon_button(
                    rx.icon("refresh-cw", size=12),
                    size="1",
                    variant="ghost",
                    on_click=BoardState.load_epics,
                ),
                align="center",
                width="100%",
            ),
            rx.cond(
                BoardState.board_loading,
                rx.center(rx.spinner(size="2"), width="100%", padding_y="8px"),
                rx.cond(
                    BoardState.board_epics.length() > 0,
                    rx.vstack(
                        rx.foreach(BoardState.board_epics, _epic_row),
                        spacing="1",
                        width="100%",
                    ),
                    rx.text("No epics yet.", size="1", color=rx.color("gray", 9)),
                ),
            ),
            rx.cond(
                BoardState.board_error != "",
                rx.callout(BoardState.board_error, color="red", size="1"),
                rx.fragment(),
            ),
            spacing="2",
            width="100%",
        ),
        body_padding="10px 12px 12px",
    )


def _member_row(member: dict) -> rx.Component:
    return rx.hstack(
        rx.vstack(
            rx.text(member.get("full_name", ""), size="2", weight="medium"),
            rx.hstack(
                rx.text(member.get("email", ""), size="1", color=rx.color("gray", 9)),
                rx.cond(
                    member.get("role_name", "") != "",
                    rx.badge(
                        member.get("role_name", ""),
                        color_scheme="violet",
                        variant="surface",
                        size="1",
                    ),
                    rx.fragment(),
                ),
                spacing="2",
                align="center",
            ),
            spacing="1",
            align="start",
            flex="1",
        ),
        rx.icon_button(
            rx.icon("user-minus", size=13),
            size="1",
            variant="ghost",
            color_scheme="red",
            on_click=UserMgmtState.remove_member(member["id"]),
        ),
        align="center",
        width="100%",
        padding_y="4px",
    )


def _users_expander() -> rx.Component:
    return expander(
        rx.hstack(
            rx.icon("users", size=14, color=rx.color("accent", 9)),
            rx.text("Users & Roles", size="2", weight="medium"),
            rx.cond(
                UserMgmtState.members.length() > 0,
                rx.badge(
                    UserMgmtState.members.length().to_string() + " members",
                    color_scheme="gray",
                    variant="surface",
                    size="1",
                ),
                rx.fragment(),
            ),
            spacing="2",
            align="center",
        ),
        rx.vstack(
            rx.cond(
                UserMgmtState.members_loading,
                rx.center(rx.spinner(size="2"), width="100%"),
                rx.vstack(
                    rx.foreach(UserMgmtState.members, _member_row),
                    spacing="1",
                    width="100%",
                ),
            ),
            rx.separator(width="100%", my="2"),
            rx.text("Invite member", size="2", weight="medium"),
            rx.form(
                rx.vstack(
                    rx.input(
                        name="username_or_email",
                        placeholder="Username or email",
                        size="1",
                        width="100%",
                    ),
                    rx.select.root(
                        rx.select.trigger(placeholder="Role", width="100%"),
                        rx.select.content(
                            rx.foreach(
                                UserMgmtState.roles,
                                lambda r: rx.select.item(r["name"], value=r["id"].to_string()),
                            ),
                        ),
                        name="role_id",
                        size="1",
                        width="100%",
                    ),
                    rx.button("Send invite", size="1", type="submit", width="100%"),
                    spacing="2",
                ),
                on_submit=UserMgmtState.invite_member,
            ),
            rx.cond(
                UserMgmtState.invite_error != "",
                rx.callout(UserMgmtState.invite_error, color="red", size="1"),
                rx.fragment(),
            ),
            rx.cond(
                UserMgmtState.invite_success != "",
                rx.callout(UserMgmtState.invite_success, color="green", size="1"),
                rx.fragment(),
            ),
            spacing="2",
            width="100%",
            on_mount=UserMgmtState.load_members,
        ),
        body_padding="10px 12px 12px",
    )


# ── Zone 2: Active Context ────────────────────────────────────────────────────

def _context_file_editor(
    label: str,
    content_var,
    save_event,
    download_event,
    reset_filename: str,
    md_var=None,
    toggle_md_event=None,
    html_var=None,
) -> rx.Component:
    """Expander for one context file. md_var=True → Preview mode, False → Edit mode."""
    # Header lives inside <summary> — keep it simple (no buttons) so clicking the
    # header only toggles the expander and doesn't fire competing on_click handlers.
    header = rx.hstack(
        rx.icon("file-text", size=13, color=rx.color("accent", 9)),
        rx.text(label, size="2"),
        rx.spacer(),
        rx.text(
            content_var.length().to_string() + " ch",
            size="1",
            color=rx.color("gray", 9),
        ),
        align="center",
        width="100%",
    )

    action_bar = rx.hstack(
        rx.button(
            rx.hstack(rx.icon("download", size=12), rx.text("Export"), spacing="1"),
            size="1",
            variant="ghost",
            on_click=download_event,
        ),
        rx.spacer(),
        rx.button(
            rx.hstack(rx.icon("rotate-ccw", size=12), rx.text("Reset"), spacing="1"),
            size="1",
            variant="ghost",
            color_scheme="red",
            on_click=lambda: ContextState.reset_context_file(reset_filename),
        ),
        width="100%",
    )

    if md_var is not None and html_var is not None:
        content_area = rx.cond(
            md_var,
            # ── Preview: server-rendered HTML from Python markdown library ──
            rx.scroll_area(
                rx.box(
                    rx.html(html_var),
                    class_name="apex-md-preview",
                    width="100%",
                ),
                type="auto",
                max_height="280px",
                width="100%",
            ),
            # ── Edit: source code textarea ─────────────────────────────────
            rx.text_area(
                value=content_var,
                on_change=save_event,
                rows="10",
                width="100%",
                font_family="monospace",
                font_size="12px",
            ),
        )
        body = rx.vstack(
            # Mode toggle at top of body — outside <summary> to avoid the
            # native details-toggle side effect on click.
            rx.hstack(
                rx.button(
                    rx.cond(
                        md_var,
                        rx.hstack(rx.icon("pencil", size=11), rx.text("Edit"), spacing="1"),
                        rx.hstack(rx.icon("eye", size=11), rx.text("Preview"), spacing="1"),
                    ),
                    size="1",
                    variant="soft",
                    color_scheme="violet",
                    on_click=toggle_md_event,
                ),
                justify="end",
                width="100%",
            ),
            content_area,
            action_bar,
            spacing="2",
            width="100%",
        )
    else:
        body = rx.vstack(
            rx.text_area(
                value=content_var,
                on_change=save_event,
                rows="10",
                width="100%",
                font_family="monospace",
                font_size="12px",
            ),
            action_bar,
            spacing="2",
            width="100%",
        )

    return expander(
        header,
        body,
        body_padding="10px 12px 12px",
    )


def _context_zone() -> rx.Component:
    return rx.cond(
        AuthState.is_authenticated,
        rx.vstack(
            _zone_label("Active Context"),
            rx.hstack(
                rx.text("context · ", size="1", color=rx.color("gray", 9)),
                rx.text(
                    ContextState.context_total_chars.to_string() + " chars",
                    size="1",
                    weight="bold",
                    color=ContextState.context_size_color,
                ),
                spacing="0",
                padding_x="16px",
                padding_bottom="6px",
            ),
            rx.vstack(
                _context_file_editor(
                    "Memory Bank",
                    ContextState.mem_bank_content,
                    ContextState.save_mem_bank,
                    ContextState.download_mem_bank,
                    "memory-bank.md",
                    ContextState.mem_bank_md,
                    ContextState.toggle_mem_bank_md,
                    ContextState.mem_bank_html,
                ),
                _context_file_editor(
                    "Functional Spec",
                    ContextState.func_spec_content,
                    ContextState.save_func_spec,
                    ContextState.download_func_spec,
                    "functional-spec.md",
                    ContextState.func_spec_md,
                    ContextState.toggle_func_spec_md,
                    ContextState.func_spec_html,
                ),
                _context_file_editor(
                    "Technical Spec",
                    ContextState.tech_spec_content,
                    ContextState.save_tech_spec,
                    ContextState.download_tech_spec,
                    "technical-spec.md",
                    ContextState.tech_spec_md,
                    ContextState.toggle_tech_spec_md,
                    ContextState.tech_spec_html,
                ),
                _context_file_editor(
                    "Vaccine Records",
                    ContextState.vaccines_content,
                    ContextState.save_vaccines,
                    ContextState.download_vaccines,
                    "vaccines.md",
                    ContextState.vaccines_md,
                    ContextState.toggle_vaccines_md,
                    ContextState.vaccines_html,
                ),
                spacing="1",
                width="100%",
                padding_x="16px",
            ),
            # ── Reload / Reset — centered, bigger buttons ─────────────────
            rx.hstack(
                rx.button(
                    rx.hstack(rx.icon("refresh-cw", size=13), rx.text("Reload"), spacing="1"),
                    size="2",
                    variant="soft",
                    color_scheme="gray",
                    on_click=ContextState.load_context,
                    flex="1",
                ),
                rx.button(
                    rx.hstack(rx.icon("rotate-ccw", size=13), rx.text("Reset all"), spacing="1"),
                    size="2",
                    variant="soft",
                    color_scheme="red",
                    on_click=ContextState.reset_context,
                    flex="1",
                ),
                spacing="2",
                padding_x="16px",
                padding_top="8px",
                padding_bottom="6px",
                width="100%",
            ),
            spacing="0",
            width="100%",
        ),
        # ── Not signed in: show title + descriptive message only ──────────
        rx.vstack(
            _zone_label("Active Context"),
            rx.text(
                "Sign in and select a project to view and edit the Memory Bank, "
                "Functional Spec, and other context files that anchor AI across the SDLC.",
                size="2",
                color=rx.color("gray", 10),
                padding_x="16px",
                padding_bottom="8px",
                line_height="1.6",
            ),
            spacing="1",
            width="100%",
        ),
    )


# ── Sidebar resize + collapse script ─────────────────────────────────────────

_RESIZE_SCRIPT = """
(function() {
  var KEY = 'apex-sidebar-width', DEF = 280, MIN = 180, MAX = 520;
  var COLLAPSE_KEY = 'apex-sidebar-collapsed';
  var isCollapsed = localStorage.getItem(COLLAPSE_KEY) === '1';

  // Set html attr immediately — applies CSS before any React paint
  document.documentElement.dataset.sc = isCollapsed ? '1' : '0';

  function setW(w) {
    document.documentElement.style.setProperty('--apex-sidebar-width', w + 'px');
  }
  var saved = parseInt(localStorage.getItem(KEY) || '', 10);
  setW(isNaN(saved) ? DEF : Math.min(MAX, Math.max(MIN, saved)));

  function setCollapsed(c) {
    isCollapsed = !!c;
    document.documentElement.dataset.sc = c ? '1' : '0';
    localStorage.setItem(COLLAPSE_KEY, c ? '1' : '0');
    var sidebar = document.getElementById('app-sidebar');
    if (sidebar) sidebar.dataset.collapsed = c ? '1' : '0';
  }

  function initSidebar(s) {
    // Disable transition, apply state, then re-enable after 2 frames
    s.style.transition = 'none';
    s.dataset.collapsed = isCollapsed ? '1' : '0';
    s.dataset.apexInit = '1';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        s.style.transition = '';
      });
    });
  }

  function restoreCollapsed() {
    var s = document.getElementById('app-sidebar');
    if (s) {
      initSidebar(s);
    } else {
      setTimeout(restoreCollapsed, 60);
    }
  }
  restoreCollapsed();

  if (window._apexSidebar) return;
  window._apexSidebar = true;

  document.addEventListener('click', function(e) {
    if (e.target.closest('#sidebar-collapse-btn')) {
      var s = document.getElementById('app-sidebar');
      setCollapsed(!s || s.dataset.collapsed !== '1');
    }
    if (e.target.closest('#sidebar-expand-btn')) {
      setCollapsed(false);
    }
  });

  var dragging = false, startX = 0, startW = DEF;
  document.addEventListener('mousedown', function(e) {
    if (!e.target.closest('#sidebar-resize-handle')) return;
    var s = document.getElementById('app-sidebar');
    if (s && s.dataset.collapsed === '1') return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--apex-sidebar-width'), 10) || DEF;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    var h = document.getElementById('sidebar-resize-handle');
    if (h) h.style.background = 'rgba(139,92,246,0.45)';
  });
  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    setW(Math.min(MAX, Math.max(MIN, startW + e.clientX - startX)));
  });
  document.addEventListener('mouseup', function() {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    var h = document.getElementById('sidebar-resize-handle');
    if (h) h.style.background = '';
    localStorage.setItem(KEY, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--apex-sidebar-width'), 10) || DEF);
  });
  document.addEventListener('dblclick', function(e) {
    if (!e.target.closest('#sidebar-resize-handle')) return;
    e.preventDefault();
    setW(DEF);
    localStorage.setItem(KEY, DEF);
  });

  new MutationObserver(function() {
    var s = document.getElementById('app-sidebar');
    if (s && !s.dataset.apexInit) {
      initSidebar(s);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
"""


# ── Root sidebar ──────────────────────────────────────────────────────────────

def sidebar() -> rx.Component:
    return rx.box(
        rx.script(_RESIZE_SCRIPT),
        # Expand button — lives outside sidebar-main-content so it's reachable when collapsed
        rx.box(
            rx.icon_button(
                rx.icon("panel-left-open", size=16),
                id="sidebar-expand-btn",
                size="2",
                variant="ghost",
                color_scheme="gray",
                title="Expand sidebar",
            ),
            class_name="apex-expand-btn",
        ),
        rx.scroll_area(
            rx.vstack(
                # ── Header ───────────────────────────────────────────────────
                _header_row(),
                rx.separator(size="4"),
                # ── Zone 1: Settings & Connections ───────────────────────────
                _zone_label("Settings & Connections"),
                _ai_status_row(),
                rx.cond(
                    ~AuthState.is_authenticated,
                    rx.callout(
                        "Use the ⇄ button to sign in to Taiga.",
                        color="blue",
                        size="1",
                        margin_x="16px",
                        margin_bottom="4px",
                    ),
                    rx.fragment(),
                ),
                _taiga_user_row(),
                rx.cond(
                    AuthState.is_authenticated,
                    rx.vstack(
                        _project_expander(),
                        _board_expander(),
                        _users_expander(),
                        spacing="1",
                        width="100%",
                        padding_x="16px",
                        padding_bottom="4px",
                    ),
                    rx.fragment(),
                ),
                _zone_separator(),
                # ── Zone 2: Active Context ────────────────────────────────────
                _context_zone(),
                _zone_separator(),
                # Dialogs (mounted once, controlled by state)
                create_epic_dialog(),
                create_story_dialog(),
                epic_details_dialog(),
                story_details_dialog(),
                spacing="0",
                align="start",
                width="100%",
            ),
            type="auto",
            width="100%",
            height="100vh",
            class_name="sidebar-main-content",
        ),
        # ── Drag handle — fixed to right edge of sidebar ─────────────────────
        rx.box(
            id="sidebar-resize-handle",
            position="fixed",
            left="calc(var(--apex-sidebar-width, 280px) - 2px)",
            top="0",
            width="5px",
            height="100vh",
            cursor="col-resize",
            z_index="200",
            background="transparent",
            transition="background 0.12s",
            _hover={"background": rx.color("accent", 4)},
        ),
        id="app-sidebar",
        width="var(--apex-sidebar-width, 280px)",
        min_width="180px",
        height="100vh",
        background=rx.color("gray", 1),
        border_right=f"1px solid {rx.color('gray', 4)}",
        position="sticky",
        top="0",
        flex_shrink="0",
        overflow="hidden",
    )
