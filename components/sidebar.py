"""sidebar.py — App sidebar: logo, theme, nav, context, Taiga status, board, users."""

import reflex as rx

from state.auth import AuthState
from state.board import BoardState
from state.context import ContextState
from state.project import ProjectState
from state.user_mgmt import UserMgmtState
from components.nav import phase_nav
from components.dialogs.switch_account import switch_account_dialog
from components.dialogs.create_epic import create_epic_dialog
from components.dialogs.create_story import create_story_dialog
from components.dialogs.epic_details import epic_details_dialog
from components.dialogs.story_details import story_details_dialog

_PURPLE = "#7c3aed"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _section_label(text: str) -> rx.Component:
    return rx.text(
        text,
        font_size="10px",
        font_weight="700",
        letter_spacing="0.08em",
        color=_PURPLE,
        padding="8px 12px 4px",
        text_transform="uppercase",
    )


def _divider() -> rx.Component:
    return rx.separator(width="100%", margin_y="4px")


# ── Logo + theme ──────────────────────────────────────────────────────────────

def _logo_row() -> rx.Component:
    return rx.hstack(
        rx.heading("Apex", size="5", color=_PURPLE, weight="bold"),
        rx.spacer(),
        rx.button(
            rx.cond(AuthState.theme_is_dark, "☀", "🌙"),
            variant="ghost",
            size="1",
            on_click=AuthState.toggle_theme,
            title="Toggle light/dark",
        ),
        width="100%",
        align="center",
        padding="12px",
    )


# ── Taiga status ──────────────────────────────────────────────────────────────

def _taiga_status() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.cond(
                AuthState.is_authenticated,
                rx.vstack(
                    rx.text(AuthState.taiga_username, size="2", weight="bold"),
                    rx.text(AuthState.taiga_email, size="1", color_scheme="gray"),
                    spacing="0",
                    align="start",
                ),
                rx.text("Not signed in", size="2", color_scheme="gray"),
            ),
            rx.spacer(),
            switch_account_dialog(),
            align="center",
            width="100%",
        ),
        rx.cond(
            ~AuthState.is_authenticated,
            rx.callout(
                "Sign in using the ⇄ button to get started.",
                size="1",
                color="blue",
            ),
            rx.fragment(),
        ),
        spacing="2",
        width="100%",
        padding_x="12px",
    )


# ── Project selector ──────────────────────────────────────────────────────────

def _project_selector() -> rx.Component:
    return rx.cond(
        AuthState.is_authenticated,
        rx.vstack(
            rx.hstack(
                rx.cond(
                    ProjectState.has_project,
                    rx.badge(ProjectState.project_name, color_scheme="violet", variant="soft"),
                    rx.text("No project selected", size="2", color_scheme="gray"),
                ),
                rx.spacer(),
                rx.button(
                    "Change",
                    size="1",
                    variant="ghost",
                    on_click=ProjectState.load_projects,
                ),
                align="center",
                width="100%",
            ),
            rx.cond(
                ProjectState.projects_list.length() > 0,
                rx.select.root(
                    rx.select.trigger(placeholder="Select a project…", width="100%"),
                    rx.select.content(
                        rx.foreach(
                            ProjectState.projects_list,
                            lambda p: rx.select.item(p["name"], value=p["id"].to_string()),
                        ),
                    ),
                    value=ProjectState.active_project_id.to_string(),
                    on_change=lambda v: ProjectState.select_project(v.to(int)),
                    size="1",
                    width="100%",
                ),
                rx.fragment(),
            ),
            spacing="2",
            width="100%",
            padding_x="12px",
        ),
        rx.fragment(),
    )


# ── Active Context editors ────────────────────────────────────────────────────

def _context_file_editor(
    label: str,
    content_var,
    save_event,
    download_event,
    reset_filename: str,
) -> rx.Component:
    """Live-editing accordion item: textarea autosaves on every keystroke."""
    return rx.accordion.item(
        header=rx.hstack(
            rx.text(label, size="2"),
            rx.spacer(),
            rx.text(
                content_var.length().to_string() + " ch",
                size="1",
                color_scheme="gray",
            ),
        ),
        content=rx.vstack(
            rx.text_area(
                value=content_var,
                on_change=save_event,
                rows="10",
                width="100%",
                font_family="monospace",
                font_size="12px",
            ),
            rx.hstack(
                rx.button(
                    "↓ Export",
                    size="1",
                    variant="ghost",
                    on_click=download_event,
                ),
                rx.spacer(),
                rx.button(
                    "↺ Reset",
                    size="1",
                    variant="ghost",
                    color_scheme="red",
                    on_click=lambda: ContextState.reset_context_file(reset_filename),
                ),
                width="100%",
            ),
            spacing="2",
            width="100%",
        ),
        value=label,
    )


def _active_context() -> rx.Component:
    return rx.cond(
        AuthState.is_authenticated,
        rx.vstack(
            _section_label("Active Context"),
            # Context size indicator
            rx.hstack(
                rx.text("context · ", size="1", color_scheme="gray"),
                rx.text(
                    ContextState.context_total_chars.to_string() + " chars",
                    size="1",
                    weight="bold",
                    color=ContextState.context_size_color,
                ),
                spacing="0",
                padding_x="12px",
                padding_bottom="4px",
            ),
            rx.accordion.root(
                _context_file_editor(
                    "Memory Bank",
                    ContextState.mem_bank_content,
                    ContextState.save_mem_bank,
                    ContextState.download_mem_bank,
                    "memory-bank.md",
                ),
                _context_file_editor(
                    "Functional Spec",
                    ContextState.func_spec_content,
                    ContextState.save_func_spec,
                    ContextState.download_func_spec,
                    "functional-spec.md",
                ),
                _context_file_editor(
                    "Technical Spec",
                    ContextState.tech_spec_content,
                    ContextState.save_tech_spec,
                    ContextState.download_tech_spec,
                    "technical-spec.md",
                ),
                _context_file_editor(
                    "Vaccine Records",
                    ContextState.vaccines_content,
                    ContextState.save_vaccines,
                    ContextState.download_vaccines,
                    "vaccines.md",
                ),
                collapsible=True,
                type="multiple",
                width="100%",
            ),
            rx.hstack(
                rx.button(
                    "↻ Reload",
                    size="1",
                    variant="ghost",
                    on_click=ContextState.load_context,
                ),
                rx.button(
                    "↺ Reset all",
                    size="1",
                    variant="ghost",
                    color_scheme="red",
                    on_click=ContextState.reset_context,
                ),
                spacing="2",
                padding_x="12px",
            ),
            spacing="1",
            width="100%",
            padding_x="12px",
        ),
        rx.fragment(),
    )


# ── Epics & Stories board ─────────────────────────────────────────────────────

def _story_row(story: dict) -> rx.Component:
    return rx.hstack(
        rx.text(story["subject"], size="1", flex="1"),
        rx.button(
            "…",
            size="1",
            variant="ghost",
            on_click=BoardState.open_story_details(story["id"]),
        ),
        rx.button(
            "✕",
            size="1",
            variant="ghost",
            color_scheme="red",
            on_click=BoardState.delete_story(story["id"], story["epic_id"]),
        ),
        align="center",
        width="100%",
        padding_left="24px",
    )


def _epic_row(epic: dict) -> rx.Component:
    epic_id = epic["id"]
    is_expanded = BoardState.expanded_epic_id == epic_id

    return rx.vstack(
        rx.hstack(
            rx.button(
                rx.cond(is_expanded, "▼", "▶"),
                size="1",
                variant="ghost",
                on_click=BoardState.toggle_epic(epic_id),
            ),
            rx.text(epic["subject"], size="2", flex="1"),
            rx.button(
                "…",
                size="1",
                variant="ghost",
                on_click=BoardState.open_epic_details(epic_id),
            ),
            rx.button(
                "+ Story",
                size="1",
                variant="ghost",
                on_click=BoardState.open_create_story(epic_id),
            ),
            rx.button(
                "✕",
                size="1",
                variant="ghost",
                color_scheme="red",
                on_click=BoardState.delete_epic(epic_id),
            ),
            align="center",
            width="100%",
        ),
        rx.cond(
            is_expanded,
            rx.vstack(
                rx.foreach(BoardState.expanded_stories, _story_row),
                width="100%",
                spacing="1",
            ),
            rx.fragment(),
        ),
        width="100%",
        spacing="1",
    )


def _board() -> rx.Component:
    return rx.cond(
        AuthState.is_authenticated & ProjectState.has_project,
        rx.vstack(
            _section_label("Epics & Stories"),
            rx.hstack(
                rx.text("Board", size="2", color_scheme="gray"),
                rx.spacer(),
                rx.button(
                    "+ Epic",
                    size="1",
                    variant="ghost",
                    on_click=BoardState.open_create_epic,
                ),
                rx.button(
                    "↺",
                    size="1",
                    variant="ghost",
                    on_click=BoardState.load_epics,
                ),
                align="center",
                width="100%",
                padding_x="12px",
            ),
            rx.cond(
                BoardState.board_loading,
                rx.spinner(size="2"),
                rx.cond(
                    BoardState.board_epics.length() > 0,
                    rx.vstack(
                        rx.foreach(BoardState.board_epics, _epic_row),
                        width="100%",
                        spacing="1",
                        padding_x="12px",
                    ),
                    rx.text("No epics yet.", size="1", color_scheme="gray", padding_x="12px"),
                ),
            ),
            rx.cond(
                BoardState.board_error != "",
                rx.callout(BoardState.board_error, color="red", size="1"),
                rx.fragment(),
            ),
            spacing="2",
            width="100%",
            on_mount=BoardState.load_epics,
        ),
        rx.fragment(),
    )


# ── Users & Roles ─────────────────────────────────────────────────────────────

def _member_row(member: dict) -> rx.Component:
    return rx.hstack(
        rx.vstack(
            rx.text(member.get("full_name", ""), size="2"),
            rx.text(member.get("email", ""), size="1", color_scheme="gray"),
            spacing="0",
            align="start",
        ),
        rx.spacer(),
        rx.button(
            "Remove",
            size="1",
            variant="ghost",
            color_scheme="red",
            on_click=UserMgmtState.remove_member(member["id"]),
        ),
        align="center",
        width="100%",
    )


def _users_section() -> rx.Component:
    return rx.cond(
        AuthState.is_authenticated & ProjectState.has_project,
        rx.accordion.root(
            rx.accordion.item(
                header=rx.text("Users & Roles", size="2"),
                content=rx.vstack(
                    rx.cond(
                        UserMgmtState.members_loading,
                        rx.spinner(size="2"),
                        rx.foreach(UserMgmtState.members, _member_row),
                    ),
                    rx.separator(width="100%"),
                    rx.text("Invite member", size="2", weight="bold"),
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
                ),
                value="users",
            ),
            collapsible=True,
            width="100%",
            padding_x="12px",
            on_mount=UserMgmtState.load_members,
        ),
        rx.fragment(),
    )


# ── Root sidebar ──────────────────────────────────────────────────────────────

def sidebar() -> rx.Component:
    return rx.box(
        rx.vstack(
            _logo_row(),
            _divider(),
            phase_nav(),
            _divider(),
            _taiga_status(),
            _divider(),
            _project_selector(),
            _divider(),
            _active_context(),
            _divider(),
            _board(),
            _divider(),
            _users_section(),
            # ── Dialogs (rendered once, controlled by state) ──────────────
            create_epic_dialog(),
            create_story_dialog(),
            epic_details_dialog(),
            story_details_dialog(),
            spacing="0",
            width="100%",
            align="start",
        ),
        width="280px",
        min_width="280px",
        height="100vh",
        overflow_y="auto",
        background=rx.color("gray", 2),
        border_right=f"1px solid {rx.color('gray', 4)}",
        position="sticky",
        top="0",
    )
