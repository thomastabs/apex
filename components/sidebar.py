"""sidebar.py — Premium sidebar: three distinct zones, collapsible, with expanders."""

import reflex as rx

from state.auth import AuthState
from state.board import BoardState
from state.context import ContextState
from state.phase1 import Phase1State
from state.phase2 import Phase2State
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
        size="2",
        weight="bold",
        color=rx.color("accent", 11),
        letter_spacing="0.08em",
        padding="18px 16px 12px",
    )


def _zone_separator() -> rx.Component:
    return rx.separator(size="4", margin_y="10px")


# ── Header ────────────────────────────────────────────────────────────────────

def _header_row() -> rx.Component:
    return rx.hstack(
        rx.hstack(
            rx.text(
                "Apex",
                size="6",
                weight="bold",
                color=rx.color("accent", 11),
            ),
            rx.text(
                "· Spec-Anchored",
                size="3",
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
        padding="2px 16px 12px",
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
        padding="2px 16px 14px",
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
                        value=rx.cond(
                            ProjectState.pending_project_id > 0,
                            ProjectState.pending_project_id.to_string(),
                            ProjectState.active_project_id.to_string(),
                        ),
                        on_change=lambda v: ProjectState.set_pending_project(v.to(int)),
                        size="1",
                        width="100%",
                    ),
                    rx.hstack(
                        rx.button(
                            rx.hstack(rx.icon("check", size=12), rx.text("Select Project"), spacing="1"),
                            size="2",
                            variant="soft",
                            color_scheme="violet",
                            on_click=Phase1State.request_project_switch,
                            disabled=ProjectState.pending_project_id == 0,
                        ),
                        rx.spacer(),
                        rx.button(
                            rx.hstack(rx.icon("refresh-cw", size=12), rx.text("Refresh"), spacing="1"),
                            size="2",
                            variant="soft",
                            color_scheme="gray",
                            on_click=ProjectState.load_projects,
                        ),
                        rx.button(
                            rx.hstack(rx.icon("plus", size=12), rx.text("Create New"), spacing="1"),
                            size="2",
                            variant="soft",
                            color_scheme="violet",
                            on_click=ProjectState.open_create_project_dialog,
                        ),
                        width="100%",
                    ),
                    rx.cond(
                        ProjectState.has_project,
                        rx.button(
                            rx.hstack(rx.icon("trash-2", size=12), rx.text("Delete Project"), spacing="1"),
                            size="2",
                            variant="soft",
                            color_scheme="red",
                            on_click=ProjectState.open_delete_project_dialog,
                            width="100%",
                        ),
                        rx.fragment(),
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
                rx.icon("info", size=13),
                size="1",
                variant="ghost",
                on_click=BoardState.open_story_details(story["id"]),
                title="View / edit story",
            ),
            rx.icon_button(
                rx.icon("trash-2", size=13),
                size="1",
                variant="ghost",
                color_scheme="red",
                on_click=BoardState.open_delete_story_confirm(story["id"], story["epic_id"]),
                title="Delete story",
            ),
            spacing="3",
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
                    rx.icon("info", size=13),
                    size="1",
                    variant="ghost",
                    on_click=BoardState.open_epic_details(epic_id),
                    title="View / edit epic",
                ),
                rx.icon_button(
                    rx.icon("plus", size=13),
                    size="1",
                    variant="ghost",
                    on_click=BoardState.open_create_story(epic_id),
                    title="Add story",
                ),
                rx.icon_button(
                    rx.icon("trash-2", size=13),
                    size="1",
                    variant="ghost",
                    color_scheme="red",
                    on_click=BoardState.open_delete_epic_confirm(epic_id),
                    title="Delete epic",
                ),
                spacing="3",
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
                    rx.hstack(rx.icon("plus", size=12), rx.text("Create New Epic"), spacing="1"),
                    size="2",
                    variant="soft",
                    color_scheme="violet",
                    on_click=BoardState.open_create_epic,
                ),
                rx.button(
                    rx.hstack(rx.icon("refresh-cw", size=12), rx.text("Refresh"), spacing="1"),
                    size="2",
                    variant="soft",
                    color_scheme="gray",
                    on_click=BoardState.reload_board_manual,
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
            rx.text(member["full_name"], size="2", weight="medium"),
            rx.hstack(
                rx.text(member["email"], size="1", color=rx.color("gray", 9)),
                rx.cond(
                    member["role_name"] != "",
                    rx.badge(
                        member["role_name"],
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
        rx.cond(
            member["is_owner"],
            rx.fragment(),
            rx.icon_button(
                rx.icon("user-minus", size=13),
                size="1",
                variant="ghost",
                color_scheme="red",
                on_click=UserMgmtState.remove_member(member["id"]),
                title="Remove member",
            ),
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
            size="2",
            variant="soft",
            color_scheme="gray",
            on_click=download_event,
        ),
        rx.spacer(),
        rx.button(
            rx.hstack(rx.icon("rotate-ccw", size=12), rx.text("Reset"), spacing="1"),
            size="2",
            variant="soft",
            color_scheme="red",
            on_click=lambda: ContextState.open_reset_file_confirm(reset_filename),
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
                    size="2",
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
                rx.text("context · ", size="2", color=rx.color("gray", 9)),
                rx.text(
                    ContextState.context_total_chars.to_string() + " chars",
                    size="2",
                    weight="bold",
                    color=ContextState.context_size_color,
                ),
                rx.spacer(),
                rx.tooltip(
                    rx.icon_button(
                        rx.icon("refresh-cw", size=12),
                        size="1",
                        variant="ghost",
                        color_scheme="gray",
                        on_click=ContextState.rebuild_index,
                    ),
                    content="Rebuild story index from spec files",
                ),
                spacing="0",
                align="center",
                padding_x="16px",
                padding_top="2px",
                padding_bottom="8px",
                width="100%",
            ),
            rx.cond(
                rx.State.router.page.path == "/phase1",
                # Phase 1: Memory Bank + Functional Spec only
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
                    spacing="2",
                    width="100%",
                    padding_x="16px",
                ),
                rx.cond(
                    rx.State.router.page.path == "/phase2",
                    # Phase 2: Memory Bank + Functional Spec + Technical Spec + Design Bundle
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
                            "Design Bundle",
                            ContextState.design_bundle_content,
                            ContextState.save_design_bundle,
                            ContextState.download_design_bundle,
                            "design-bundle.md",
                            ContextState.design_bundle_md,
                            ContextState.toggle_design_bundle_md,
                            ContextState.design_bundle_html,
                        ),
                        spacing="2",
                        width="100%",
                        padding_x="16px",
                    ),
                    # All other pages: Memory Bank + Functional Spec + Technical Spec + Vaccine Records
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
                        spacing="2",
                        width="100%",
                        padding_x="16px",
                    ),
                ),
            ),
            # ── Reload / Reset — centered, bigger buttons ─────────────────
            rx.hstack(
                rx.button(
                    rx.hstack(rx.icon("refresh-cw", size=13), rx.text("Reload"), spacing="1"),
                    size="2",
                    variant="soft",
                    color_scheme="gray",
                    on_click=ContextState.reload_context_manual,
                    flex="1",
                ),
                rx.button(
                    rx.hstack(rx.icon("rotate-ccw", size=13), rx.text("Reset all"), spacing="1"),
                    size="2",
                    variant="soft",
                    color_scheme="red",
                    on_click=ContextState.open_reset_all_confirm,
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
  var KEY = 'apex-sidebar-width', DEF = 450, MIN = 450;
  var COLLAPSE_KEY = 'apex-sidebar-collapsed';
  var isCollapsed = localStorage.getItem(COLLAPSE_KEY) === '1';

  // Set html attr immediately — applies CSS before any React paint
  document.documentElement.dataset.sc = isCollapsed ? '1' : '0';

  function setW(w) {
    document.documentElement.style.setProperty('--apex-sidebar-width', w + 'px');
  }
  var saved = parseInt(localStorage.getItem(KEY) || '', 10);
  setW(isNaN(saved) ? DEF : Math.max(MIN, saved));

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
    setW(Math.max(MIN, startW + e.clientX - startX));
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


def _reset_confirm_dialog() -> rx.Component:
    return rx.dialog.root(
        rx.dialog.content(
            rx.dialog.title("Reset Context File?"),
            rx.callout(
                "This will overwrite the file with its default template. Any custom content will be lost.",
                color="red",
                size="2",
            ),
            rx.hstack(
                rx.button(
                    "Yes, reset",
                    color_scheme="red",
                    size="2",
                    on_click=ContextState.confirm_reset,
                ),
                rx.dialog.close(
                    rx.button(
                        "Cancel",
                        variant="soft",
                        color_scheme="gray",
                        size="2",
                        on_click=lambda: ContextState.set_reset_confirm_open(False),
                    ),
                ),
                spacing="2",
                justify="end",
                margin_top="16px",
            ),
            max_width="420px",
        ),
        open=ContextState.reset_confirm_open,
        on_open_change=ContextState.set_reset_confirm_open,
    )


def _delete_confirm_dialog() -> rx.Component:
    return rx.dialog.root(
        rx.dialog.content(
            rx.dialog.title("Delete Permanently?"),
            rx.callout(
                "This action cannot be undone. The epic and all its stories will be permanently deleted from Taiga.",
                color="red",
                size="2",
            ),
            rx.hstack(
                rx.button(
                    "Yes, delete",
                    color_scheme="red",
                    size="2",
                    on_click=BoardState.confirm_delete,
                ),
                rx.dialog.close(
                    rx.button(
                        "Cancel",
                        variant="soft",
                        color_scheme="gray",
                        size="2",
                        on_click=lambda: BoardState.set_delete_confirm_open(False),
                    ),
                ),
                spacing="2",
                justify="end",
                margin_top="16px",
            ),
            max_width="420px",
        ),
        open=BoardState.delete_confirm_open,
        on_open_change=BoardState.set_delete_confirm_open,
    )


def _create_project_dialog() -> rx.Component:
    return rx.dialog.root(
        rx.dialog.content(
            rx.dialog.title("Create New Project"),
            rx.vstack(
                rx.vstack(
                    rx.hstack(
                        rx.text("Title", size="2", weight="medium"),
                        rx.text("*", size="2", color=rx.color("red", 9)),
                        spacing="1",
                    ),
                    rx.input(
                        value=ProjectState.new_project_title,
                        placeholder="Project title",
                        on_change=ProjectState.set_new_project_title,
                        size="2",
                        width="100%",
                    ),
                    spacing="1",
                    width="100%",
                ),
                rx.vstack(
                    rx.text("Description", size="2", weight="medium"),
                    rx.text_area(
                        value=ProjectState.new_project_desc,
                        placeholder="Brief project description…",
                        on_change=ProjectState.set_new_project_desc,
                        rows="4",
                        size="2",
                        width="100%",
                    ),
                    spacing="1",
                    width="100%",
                ),
                rx.cond(
                    ProjectState.create_project_error != "",
                    rx.callout(ProjectState.create_project_error, color="red", size="1"),
                    rx.fragment(),
                ),
                rx.hstack(
                    rx.button(
                        rx.cond(
                            ProjectState.creating_project,
                            rx.hstack(rx.spinner(size="2"), rx.text("Creating…"), spacing="2"),
                            rx.hstack(rx.icon("plus", size=14), rx.text("Create Project"), spacing="2"),
                        ),
                        on_click=ProjectState.create_project,
                        disabled=ProjectState.creating_project | (ProjectState.new_project_title == ""),
                        color_scheme="violet",
                        size="2",
                    ),
                    rx.dialog.close(
                        rx.button(
                            "Cancel",
                            variant="soft",
                            color_scheme="gray",
                            size="2",
                            on_click=lambda: ProjectState.set_create_project_dialog_open(False),
                        ),
                    ),
                    spacing="2",
                    justify="end",
                    margin_top="8px",
                    width="100%",
                ),
                spacing="3",
                width="100%",
            ),
            max_width="440px",
        ),
        open=ProjectState.create_project_dialog_open,
        on_open_change=ProjectState.set_create_project_dialog_open,
    )


def _delete_project_dialog() -> rx.Component:
    return rx.dialog.root(
        rx.dialog.content(
            rx.dialog.title("Delete Project Permanently?"),
            rx.callout(
                rx.vstack(
                    rx.text(
                        "This will permanently delete ",
                        rx.text.strong(ProjectState.project_name),
                        " and ALL its data from Taiga. This action cannot be undone.",
                    ),
                    rx.text(
                        "Your local context files will not be deleted but will become stale.",
                        size="1",
                        color=rx.color("gray", 10),
                    ),
                    spacing="1",
                    align="start",
                ),
                color="red",
                size="2",
            ),
            rx.cond(
                ProjectState.delete_project_error != "",
                rx.callout(ProjectState.delete_project_error, color="red", size="1", margin_top="8px"),
                rx.fragment(),
            ),
            rx.hstack(
                rx.button(
                    rx.cond(
                        ProjectState.deleting_project,
                        rx.hstack(rx.spinner(size="2"), rx.text("Deleting…"), spacing="2"),
                        rx.hstack(rx.icon("trash-2", size=14), rx.text("Yes, delete permanently"), spacing="2"),
                    ),
                    color_scheme="red",
                    size="2",
                    on_click=ProjectState.delete_project,
                    disabled=ProjectState.deleting_project,
                ),
                rx.dialog.close(
                    rx.button(
                        "Cancel",
                        variant="soft",
                        color_scheme="gray",
                        size="2",
                        on_click=lambda: ProjectState.set_delete_project_dialog_open(False),
                    ),
                ),
                spacing="2",
                justify="end",
                margin_top="16px",
            ),
            max_width="460px",
        ),
        open=ProjectState.delete_project_dialog_open,
        on_open_change=ProjectState.set_delete_project_dialog_open,
    )


def _phase1_discard_dialog() -> rx.Component:
    return rx.dialog.root(
        rx.dialog.content(
            rx.dialog.title("Discard Phase 1 Progress?"),
            rx.callout(
                "You have unsaved Phase 1 work (NL draft or compiled stories). Switching project or signing out will permanently discard it.",
                color="orange",
                size="2",
            ),
            rx.hstack(
                rx.button(
                    "Yes, discard",
                    color_scheme="red",
                    size="2",
                    on_click=Phase1State.confirm_phase1_discard,
                ),
                rx.dialog.close(
                    rx.button(
                        "Cancel",
                        variant="soft",
                        color_scheme="gray",
                        size="2",
                        on_click=lambda: Phase1State.set_phase1_discard_dialog_open(False),
                    ),
                ),
                spacing="2",
                justify="end",
                margin_top="16px",
            ),
            max_width="440px",
        ),
        open=Phase1State.phase1_discard_dialog_open,
        on_open_change=Phase1State.set_phase1_discard_dialog_open,
    )


def _stage_a_discard_dialog() -> rx.Component:
    return rx.dialog.root(
        rx.dialog.content(
            rx.dialog.title("Discard Stage A Progress?"),
            rx.callout(
                "You have unsaved Tech Stack suggestions. Switching project or signing out will permanently discard them.",
                color="orange",
                size="2",
            ),
            rx.hstack(
                rx.button(
                    "Yes, discard",
                    color_scheme="red",
                    size="2",
                    on_click=Phase2State.confirm_stage_a_discard,
                ),
                rx.dialog.close(
                    rx.button(
                        "Cancel",
                        variant="soft",
                        color_scheme="gray",
                        size="2",
                        on_click=lambda: Phase2State.set_stage_a_discard_dialog_open(False),
                    ),
                ),
                spacing="2",
                justify="end",
                margin_top="16px",
            ),
            max_width="440px",
        ),
        open=Phase2State.stage_a_discard_dialog_open,
        on_open_change=Phase2State.set_stage_a_discard_dialog_open,
    )


# ── Root sidebar ──────────────────────────────────────────────────────────────

def sidebar() -> rx.Component:
    return rx.box(
        rx.connection_banner(),
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
                        spacing="3",
                        width="100%",
                        padding_x="16px",
                        padding_bottom="10px",
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
                _reset_confirm_dialog(),
                _delete_confirm_dialog(),
                _create_project_dialog(),
                _delete_project_dialog(),
                _phase1_discard_dialog(),
                _stage_a_discard_dialog(),
                rx.toast.provider(),
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
            left="calc(var(--apex-sidebar-width, 450px) - 2px)",
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
        width="var(--apex-sidebar-width, 450px)",
        min_width="450px",
        height="100vh",
        background=rx.color("gray", 1),
        border_right=f"1px solid {rx.color('gray', 4)}",
        position="sticky",
        top="0",
        flex_shrink="0",
        overflow="hidden",
    )
