"""
components/sidebar.py
Shared sidebar — rendered by app.py on every page load.
"""

import html as _html
import os
import re
from pathlib import Path

import streamlit as st

from src import ai_engine
from src import context_manager
from src import taiga_adapter

# Gherkin keyword regex (mirrors ai_engine._GHERKIN_BLOCK_RE / _GHERKIN_STEP_RE)
_GH_BLOCK_RE = re.compile(
    r"^(\s*)(Feature|Background|Scenario Outline|Scenario|Examples):([ \t]*)",
    re.MULTILINE,
)
_GH_STEP_RE = re.compile(
    r"^(\s*)(Given|When|Then|And|But)( )",
    re.MULTILINE,
)
_GH_BOLD_RE = re.compile(r"\*\*([^*]+)\*\*")


def _render_description(text: str, min_height: int = 200) -> None:
    """Render a story/epic description with Gherkin keyword highlighting and scrolling."""
    clean = _GH_BOLD_RE.sub(r"\1", text)
    is_gherkin = bool(_GH_BLOCK_RE.search(clean))

    base = (
        f"min-height:{min_height}px;max-height:500px;overflow-y:auto;"
        f"padding:12px 16px;border-radius:6px;"
    )

    if not is_gherkin:
        st.markdown(
            f'<div style="{base}">{_html.escape(clean)}</div>',
            unsafe_allow_html=True,
        )
        return

    out_lines: list[str] = []
    for line in clean.split("\n"):
        esc = _html.escape(line)
        bm = re.match(
            r"^(\s*)(Feature|Background|Scenario Outline|Scenario|Examples):([ \t]*)(.*)", esc
        )
        if bm:
            ind, kw, sp, rest = bm.group(1), bm.group(2), bm.group(3), bm.group(4)
            out_lines.append(
                f'{ind}<span style="color:#7c3aed;font-weight:700;">{kw}:</span>'
                f'<span style="font-weight:600;">{sp}{rest}</span>'
            )
            continue
        sm = re.match(r"^(\s*)(Given|When|Then|And|But)( )(.*)", esc)
        if sm:
            ind, kw, sp, rest = sm.group(1), sm.group(2), sm.group(3), sm.group(4)
            out_lines.append(
                f'{ind}<span style="color:#1d9bf0;font-weight:600;">{kw}</span>{sp}{rest}'
            )
            continue
        out_lines.append(esc)

    body = "\n".join(out_lines)
    st.markdown(
        f'<div style="'
        f"font-family:ui-monospace,'SFMono-Regular',Menlo,monospace;"
        f"font-size:13px;line-height:1.65;white-space:pre-wrap;"
        f'{base}">{body}</div>',
        unsafe_allow_html=True,
    )

_PREF_FILE = Path(".streamlit/.theme_pref")


def _theme_button() -> None:
    is_dark = st.session_state.get("theme_is_dark", True)
    label = "☀" if is_dark else "☾"
    if st.button(label, key="theme_btn", width='stretch'):
        new_val = not is_dark
        st.session_state["theme_is_dark"] = new_val
        _PREF_FILE.parent.mkdir(exist_ok=True)
        _PREF_FILE.write_text("dark" if new_val else "light")
        st.rerun()


_PHASES = [
    ("views/phase1.py", "Phase 1 · Requirements"),
    ("views/phase2.py", "Phase 2 · Design"),
    ("views/phase3.py", "Phase 3 · Implementation"),
    ("views/phase4.py", "Phase 4 · Testing"),
    ("views/phase5.py", "Phase 5 · Deployment"),
    ("views/phase6.py", "Phase 6 · Maintenance"),
]

_CONTENT_HEIGHT = 260  # px


_SIZE_TAGS = frozenset({"xs", "s", "m", "l", "xl"})


def _render_tags(tags: list[str]) -> None:
    badges = []
    for tag in tags:
        tl = tag.lower()
        if tl in _SIZE_TAGS:
            style = (
                "background:rgba(124,58,237,0.15);color:#7c3aed;"
                "border:1px solid rgba(124,58,237,0.4);"
            )
            label = tag.upper()
        else:
            style = (
                "background:rgba(100,116,139,0.12);color:#64748b;"
                "border:1px solid rgba(100,116,139,0.3);"
            )
            label = tag
        badges.append(
            f'<span style="display:inline-block;padding:2px 9px;margin:2px 3px 2px 0;'
            f'border-radius:999px;font-size:11px;font-weight:600;{style}">'
            f'{_html.escape(label)}</span>'
        )
    if badges:
        st.markdown(" ".join(badges), unsafe_allow_html=True)


@st.dialog("Story Details", width="large")
def _story_details_dialog(story: dict, stories_key: str | None = None) -> None:
    sid     = story.get("id")
    ref     = story.get("ref", "")
    subject = story.get("subject", "")
    version = story.get("version")
    status  = story.get("status")
    tags    = list(story.get("tags") or [])
    desc    = story.get("description", "")

    # Lazy-fetch full story — list endpoint omits description and may omit version/tags.
    if sid and (not desc or version is None):
        with st.spinner("Loading…"):
            try:
                full    = taiga_adapter.get_story(sid)
                desc    = full.get("description", "")
                version = full.get("version", version)
                status  = full.get("status", status)
                tags    = list(full.get("tags") or tags)
                subject = full.get("subject", subject)
            except Exception:
                pass

    st.markdown(f"**#{ref}** &nbsp; {subject}")
    _render_tags(tags)

    st.divider()
    st.markdown("**Edit**")

    new_subject = st.text_input("Title", value=subject, key=f"dlg_subj_{sid}")
    new_tags_str = st.text_input(
        "Tags",
        value=", ".join(tags),
        key=f"dlg_tags_{sid}",
    )

    # Status selectbox
    selected_status_id = status
    try:
        statuses = taiga_adapter.get_story_statuses()
    except Exception:
        statuses = []
    if statuses and status is not None:
        s_ids   = [s["id"]   for s in statuses]
        s_names = [s["name"] for s in statuses]
        try:
            cur_idx = s_ids.index(status)
        except ValueError:
            cur_idx = 0
        sel = st.selectbox(
            "Status",
            options=range(len(statuses)),
            format_func=lambda i: s_names[i],
            index=cur_idx,
            key=f"dlg_status_{sid}",
        )
        selected_status_id = s_ids[sel]

    if st.button("Save changes", type="primary", key=f"dlg_save_{sid}", width='stretch'):
        if version is None:
            st.error("Cannot save: story version unavailable — reload the board and retry.")
        else:
            new_tags = [t.strip() for t in new_tags_str.split(",") if t.strip()]
            try:
                updated = taiga_adapter.update_story(
                    sid, version,
                    subject=new_subject.strip() or subject,
                    tags=new_tags,
                    status_id=selected_status_id,
                )
                if stories_key and stories_key in st.session_state:
                    lst = st.session_state[stories_key]
                    for i, s in enumerate(lst):
                        if s.get("id") == sid:
                            lst[i] = updated
                            break
                st.success("Story updated.")
            except taiga_adapter.TaigaAPIError as exc:
                st.error(str(exc))

    st.divider()
    if desc:
        _render_description(desc)
    else:
        st.caption("No description available.")


@st.dialog("Epic Details", width="large")
def _epic_details_dialog(epic: dict, epics_key: str | None = None) -> None:
    eid     = epic.get("id")
    ref     = epic.get("ref", "")
    subject = epic.get("subject", "")
    version = epic.get("version")
    tags    = list(epic.get("tags") or [])
    desc    = epic.get("description", "")

    # Lazy-fetch full epic — list endpoint may omit description/version/tags.
    if eid and (not desc or version is None):
        with st.spinner("Loading…"):
            try:
                full    = taiga_adapter.get_epic(eid)
                desc    = full.get("description", "")
                version = full.get("version", version)
                tags    = list(full.get("tags") or tags)
                subject = full.get("subject", subject)
            except Exception:
                pass

    st.markdown(f"**#{ref}** &nbsp; {subject}")
    _render_tags(tags)

    st.divider()
    st.markdown("**Edit**")

    new_subject = st.text_input("Title", value=subject, key=f"dlg_ep_subj_{eid}")
    new_tags_str = st.text_input(
        "Tags",
        value=", ".join(tags),
        key=f"dlg_ep_tags_{eid}",
    )

    if st.button("Save changes", type="primary", key=f"dlg_ep_save_{eid}", width='stretch'):
        if version is None:
            st.error("Cannot save: epic version unavailable — reload the board and retry.")
        else:
            new_tags = [t.strip() for t in new_tags_str.split(",") if t.strip()]
            try:
                updated = taiga_adapter.update_epic(
                    eid, version,
                    subject=new_subject.strip() or subject,
                    tags=new_tags,
                )
                if epics_key and epics_key in st.session_state:
                    lst = st.session_state[epics_key]
                    for i, e in enumerate(lst):
                        if e.get("id") == eid:
                            lst[i] = updated
                            break
                st.success("Epic updated.")
            except taiga_adapter.TaigaAPIError as exc:
                st.error(str(exc))

    st.divider()
    if desc:
        _render_description(desc)
    else:
        st.caption("No description available.")


@st.dialog("Switch Account")
def _switch_account_dialog() -> None:
    mode = st.radio("Sign in with", ["Credentials", "Auth token"],
                    horizontal=True, key="sw_dlg_mode")
    if mode == "Credentials":
        uname = st.text_input("Username or email", key="sw_dlg_uname",
                              label_visibility="collapsed", placeholder="Username or email")
        pw    = st.text_input("Password", key="sw_dlg_pw",
                              label_visibility="collapsed", placeholder="Password", type="password")
        if st.button("Sign in", type="primary", key="sw_dlg_cred_btn",
                     disabled=not (uname.strip() and pw.strip()), width='stretch'):
            try:
                with st.spinner("Authenticating…"):
                    taiga_adapter.login(uname.strip(), pw.strip())
                _clear_taiga_caches()
                st.rerun()
            except taiga_adapter.TaigaAPIError as exc:
                msg = str(exc)
                if "401" in msg:
                    st.error("Wrong username or password. Please try again.")
                    st.caption("If your credentials are correct, Taiga Cloud may block API logins — try the Auth token option instead.")
                else:
                    st.error(msg)
    else:
        token = st.text_input("Auth token", key="sw_dlg_token",
                              label_visibility="collapsed", placeholder="Paste your Taiga auth token")
        st.caption("Find it at Taiga → Profile → Edit profile → API token")
        if st.button("Use token", type="primary", key="sw_dlg_token_btn",
                     disabled=not (token or "").strip(), width='stretch'):
            taiga_adapter.set_token(token.strip())
            _clear_taiga_caches()
            st.rerun()


def _clear_taiga_caches() -> None:
    for k in list(st.session_state.keys()):
        if k.startswith(("board_", "epics_", "taiga_", "_taiga_", "umgr_")):
            del st.session_state[k]
    st.session_state.pop("taiga_projects", None)


def render_sidebar() -> None:
    with st.sidebar:
        apex_color = "#7c3aed"
        col_logo, col_theme = st.columns([5, 1], vertical_alignment="center")
        with col_logo:
            st.markdown(
                f'<span style="font-size:1.55rem;font-weight:700;color:{apex_color};letter-spacing:-0.02em;">Apex</span>'
                '<span style="font-size:13px;color:#888;font-weight:500;margin-left:6px;">· Spec-Anchored Continuity</span>',
                unsafe_allow_html=True,
            )
        with col_theme:
            _theme_button()

        _section_header = (
            lambda t: st.markdown(
                f'<p class="apex-zone-header">{t}</p>',
                unsafe_allow_html=True,
            )
        )

        st.divider()
        _section_header("Settings & Connections")
        _ai_status()
        _taiga_user_info()
        _taiga_status()
        _taiga_board()
        _user_management()
        st.divider()
        _section_header("Active Context")
        _memory_bank()
        st.divider()
        _section_header("SDLC Phases")
        _phase_nav()


# ── Phase navigation ──────────────────────────────────────────────────────────

def _phase_nav() -> None:
    index = context_manager.get_story_index()
    total = len(index)
    for i, (path, label) in enumerate(_PHASES, 1):
        st.page_link(path, label=label)
        badge = _phase_badge(index, total, i)
        if badge:
            st.caption(badge)


def _phase_badge(index: dict, total: int, phase: int) -> str:
    if not index:
        return ""
    stories = list(index.values())
    if phase == 1:
        return ""
    if phase == 2:
        n = sum(1 for s in stories if s.get("has_tech_spec"))
        return f"{n} / {total} designed" if n else ""
    if phase == 3:
        n = sum(1 for s in stories if s.get("has_proposal"))
        return f"{n} / {total} proposed" if n else ""
    if phase == 4:
        n = sum(1 for s in stories if s.get("has_bdd"))
        return f"{n} / {total} tested" if n else ""
    if phase == 5:
        n = sum(1 for s in stories if s.get("phase_status") == "deployed")
        return f"{n} / {total} deployed" if n else ""
    return ""


# ── Status indicators ─────────────────────────────────────────────────────────

def _ai_status() -> None:
    try:
        ai_engine.check_api_key()
        st.markdown(f"**Anthropic** &nbsp; `{ai_engine.get_fast_model()}`")
    except EnvironmentError as exc:
        st.error(str(exc))
        st.stop()


def _taiga_user_info() -> None:
    col_info, col_btn = st.columns([6, 1], vertical_alignment="center")
    if not taiga_adapter.is_configured():
        with col_info:
            st.markdown("**Sign in to Taiga** using the ⇄ button to sign in")
        with col_btn:
            if st.button("⇄", key="sw_acct_btn", width='stretch',
                         help="Sign in or switch Taiga account"):
                _switch_account_dialog()
        return
    try:
        me        = taiga_adapter.get_me()
        full_name = (me.get("full_name") or "").strip()
        username  = me.get("username", "").strip()
        email     = me.get("email", "").strip()
        display   = full_name or username
        with col_info:
            st.markdown(
                f"**{display}**" + (f" &nbsp; `{email}`" if email else "")
            )
        with col_btn:
            if st.button("⇄", key="sw_acct_btn", width='stretch',
                         help="Sign in or switch Taiga account"):
                _switch_account_dialog()
    except Exception:
        with col_info:
            st.markdown("**Sign in to Taiga** using the ⇄ button to sign in")
        with col_btn:
            if st.button("⇄", key="sw_acct_btn", width='stretch',
                         help="Sign in or switch Taiga account"):
                _switch_account_dialog()


def _taiga_status() -> None:
    if not taiga_adapter.is_configured():
        st.caption("No Taiga account connected — use the ⇄ button above to sign in to Taiga.")
        with st.expander("Select project", key="taiga_sel_proj_exp"):
            _taiga_project_manager()
        return

    proj_id = taiga_adapter.TAIGA_PROJECT_ID
    if proj_id:
        err = taiga_adapter.validate_project()
        if err:
            st.warning(f"Taiga error: {err}")
        else:
            name = taiga_adapter.get_project().get("name", "")
            st.markdown(f"**Taiga** &nbsp; `{proj_id}`" + (f" · {name}" if name else ""))
    else:
        st.caption("No Taiga project selected")

    with st.expander("Change project", key="taiga_change_proj_exp"):
        _taiga_project_manager()


def _taiga_project_manager() -> None:
    if msg := st.session_state.pop("_notify_project", None):
        st.toast(msg)

    if not taiga_adapter.is_configured():
        st.caption("Sign in to a Taiga account first.")
        return

    if "taiga_projects" not in st.session_state:
        try:
            st.session_state["taiga_projects"] = taiga_adapter.get_projects()
        except taiga_adapter.TaigaAPIError as exc:
            st.error(str(exc))
            return
        st.rerun()

    projects: list[dict] = st.session_state["taiga_projects"]

    if not projects:
        st.caption("No projects found.")
    else:
        current_id = taiga_adapter.TAIGA_PROJECT_ID
        try:
            current_idx = next(i for i, p in enumerate(projects) if p.get("id") == current_id)
        except StopIteration:
            current_idx = 0

        sel = st.selectbox(
            "Project",
            options=range(len(projects)),
            format_func=lambda i: f"#{projects[i]['id']} · {projects[i].get('name', '')}",
            index=current_idx,
            key="taiga_proj_sel",
            label_visibility="collapsed",
        )
        col_use, col_ref = st.columns([3, 1])
        with col_use:
            if st.button("Use this project", key="taiga_use_proj_btn", width='stretch'):
                chosen = projects[sel]
                if chosen["id"] != taiga_adapter.TAIGA_PROJECT_ID:
                    taiga_adapter.set_active_project(chosen["id"])
                    for k in list(st.session_state.keys()):
                        if k.startswith(("epics_", "_taiga_", "taiga_proj")):
                            del st.session_state[k]
                    st.session_state["_notify_project"] = f"Switched to \"{chosen['name']}\"."
                    st.rerun()
        with col_ref:
            if st.button("↻", key="taiga_refresh_proj_btn", width='stretch',
                         help="Refresh project list"):
                del st.session_state["taiga_projects"]
                st.rerun()

    st.divider()
    st.caption("Create new project")
    new_name = st.text_input(
        "Name", key="taiga_new_proj_name",
        label_visibility="collapsed", placeholder="Project name"
    )
    new_desc = st.text_input(
        "Description", key="taiga_new_proj_desc",
        label_visibility="collapsed", placeholder="Description (required by Taiga)"
    )
    can_create = bool((new_name or "").strip() and (new_desc or "").strip())
    if st.button(
        "Create & select", key="taiga_create_proj_btn",
        disabled=not can_create, width='stretch',
    ):
        try:
            with st.spinner("Creating…"):
                proj = taiga_adapter.create_project(new_name.strip(), new_desc.strip())
            taiga_adapter.set_active_project(proj["id"])
            for k in list(st.session_state.keys()):
                if k.startswith(("epics_", "_taiga_", "taiga_")):
                    del st.session_state[k]
            st.session_state["_notify_project"] = f"Project \"{proj['name']}\" created and selected."
            st.rerun()
        except taiga_adapter.TaigaAPIError as exc:
            st.error(str(exc))


# ── Context / Memory Bank ─────────────────────────────────────────────────────

def _memory_bank() -> None:
    if msg := st.session_state.pop("_notify_context", None):
        st.toast(msg)

    if not context_manager.is_project_selected():
        st.caption("Select a project to view context files.")
        return

    context_manager.init_context()

    _context_size_indicator()
    _context_file_editor("memory-bank.md",    "mem_bank",  "Memory Bank")
    _context_file_editor("functional-spec.md", "func_spec", "Functional Specification")

    # Technical Spec and Vaccine Records are only relevant from Phase 2 onward.
    active_phase = st.session_state.get("_active_phase", 1)
    if active_phase != 1:
        _context_file_editor("technical-spec.md", "tech_spec", "Technical Specification")
        _context_file_editor("vaccines.md",        "vaccines",  "Vaccine Records")

    _reset_context_button()


def _reset_context_button() -> None:
    confirming = st.session_state.get("ctx_reset_confirming", False)
    if not confirming:
        col_reload, col_reset = st.columns(2)
        with col_reload:
            if st.button("↻ Reload", key="ctx_reload_btn", width="stretch"):
                for key in list(st.session_state.keys()):
                    if key.startswith(("mem_bank", "func_spec", "tech_spec", "vaccines")):
                        del st.session_state[key]
                context_manager.rebuild_story_index()
                st.session_state["_notify_context"] = "Context reloaded."
                st.rerun()
        with col_reset:
            if st.button("Reset", key="ctx_reset_btn", width="stretch"):
                st.session_state["ctx_reset_confirming"] = True
                st.rerun()
    else:
        st.warning("Erase all context files and start fresh?")
        col_yes, col_no = st.columns(2)
        with col_yes:
            if st.button("Reset", key="ctx_reset_confirm_btn", type="primary", width="stretch"):
                context_manager.reset_context()
                for key in list(st.session_state.keys()):
                    if key.startswith(("mem_bank", "func_spec", "tech_spec", "vaccines")):
                        del st.session_state[key]
                st.session_state["ctx_reset_confirming"] = False
                st.session_state["_notify_context"] = "Context reset to defaults."
                st.rerun()
        with col_no:
            if st.button("Cancel", key="ctx_reset_cancel_btn", width="stretch"):
                st.session_state["ctx_reset_confirming"] = False
                st.rerun()


def _context_size_indicator() -> None:
    sizes = context_manager.get_context_sizes()
    total = sum(sizes.values())
    if total < 30_000:
        color = "#4ade80"
    elif total < 80_000:
        color = "#facc15"
    else:
        color = "#f87171"
    st.markdown(
        f'<span style="font-size:13px;color:#888;">context · </span>'
        f'<span style="font-size:13px;font-weight:600;color:{color};">{total:,} chars</span>',
        unsafe_allow_html=True,
    )


def _context_file_editor(filename: str, state_key: str, label: str) -> None:
    path = context_manager.CONTEXT_DIR / filename
    if not path.exists():
        return

    disk_content = path.read_text(encoding="utf-8")
    disk_key  = f"{state_key}_disk"
    buf_key   = f"{state_key}_buf"
    write_key = f"{state_key}_write"
    mode_key  = f"{state_key}_read_mode"

    if st.session_state.get(disk_key) != disk_content:
        st.session_state[buf_key]  = disk_content
        st.session_state[disk_key] = disk_content
    elif buf_key not in st.session_state:
        st.session_state[buf_key] = disk_content

    if mode_key not in st.session_state:
        st.session_state[mode_key] = True

    is_read = st.session_state[mode_key]

    if not is_read and write_key not in st.session_state:
        st.session_state[write_key] = st.session_state[buf_key]

    with st.expander(label, expanded=False, key=f"{state_key}_exp"):
        col_content, col_btn = st.columns([5, 1])

        with col_btn:
            icon = "✏" if is_read else "👁"
            if st.button(icon, key=f"{state_key}_mode_btn", width="stretch"):
                st.session_state[mode_key] = not is_read
                st.rerun()

        with col_content:
            if is_read:
                with st.container(height=_CONTENT_HEIGHT, border=False):
                    st.markdown(st.session_state[buf_key])
            else:
                st.text_area(
                    label,
                    height=_CONTENT_HEIGHT,
                    label_visibility="collapsed",
                    key=write_key,
                )
                current = st.session_state[write_key]
                if current != st.session_state[disk_key]:
                    path.write_text(current, encoding="utf-8")
                    st.session_state[disk_key] = current
                    st.session_state[buf_key]  = current


# ── Taiga Board ───────────────────────────────────────────────────────────────

def _taiga_board() -> None:
    if not taiga_adapter.is_configured() or not taiga_adapter.TAIGA_PROJECT_ID:
        return

    with st.expander("Epics & Stories", key="taiga_board_epics_exp"):
        _board_content()


def _board_content() -> None:
    if msg := st.session_state.pop("_notify_epics", None):
        st.toast(msg)

    epics_key = "board_epics"
    epics: list[dict] | None = st.session_state.get(epics_key)

    if epics is None:
        try:
            st.session_state[epics_key] = taiga_adapter.get_epics()
            for k in list(st.session_state):
                if k.startswith("board_stories_"):
                    del st.session_state[k]
        except taiga_adapter.TaigaAPIError as exc:
            st.error(str(exc))
            return
        st.rerun()

    col_info, col_btn = st.columns([4, 1])
    with col_info:
        st.caption(f"{len(epics)} epic(s)")
    with col_btn:
        if st.button("↻", key="board_load_btn", width='stretch'):
            del st.session_state[epics_key]
            for k in list(st.session_state):
                if k.startswith("board_stories_"):
                    del st.session_state[k]
            st.rerun()

    if not epics:
        st.caption("No epics in this project.")
    else:
        for epic in epics:
            _board_epic_row(epic, epics_key)

    st.divider()
    _board_create_epic(epics_key)


def _board_epic_row(epic: dict, epics_key: str) -> None:
    epic_id  = epic["id"]
    ref      = epic.get("ref", epic_id)
    subject  = epic.get("subject", "")
    exp_key  = f"board_exp_{epic_id}"
    stor_key = f"board_stories_{epic_id}"
    del_key  = "_board_del_epic"

    col_tog, col_name, col_info, col_del = st.columns([1, 6, 1, 1])
    with col_tog:
        expanded = st.session_state.get(exp_key, False)
        if st.button("▼" if expanded else "▶", key=f"board_ep_tog_{epic_id}", width='stretch'):
            new_exp = not expanded
            st.session_state[exp_key] = new_exp
            if new_exp and stor_key not in st.session_state:
                try:
                    st.session_state[stor_key] = taiga_adapter.get_stories_for_epic(epic_id)
                except taiga_adapter.TaigaAPIError:
                    st.session_state[stor_key] = []
            st.rerun()
    with col_name:
        st.markdown(f"**#{ref}** {subject}")
    with col_info:
        if st.button("ℹ", key=f"epic_info_{epic_id}", width='stretch'):
            _epic_details_dialog(epic, epics_key=epics_key)
    with col_del:
        if st.session_state.get(del_key) != epic_id:
            if st.button("✕", key=f"board_ep_del_{epic_id}", width='stretch'):
                st.session_state[del_key]                = epic_id
                st.session_state["_board_del_epic_name"] = subject
                st.rerun()

    if st.session_state.get(del_key) == epic_id:
        name = st.session_state.get("_board_del_epic_name", "")
        st.warning(f'Delete **"{name}"** and all its stories from Taiga?')
        col_y, col_n = st.columns(2)
        with col_y:
            if st.button("Delete", type="primary", key=f"board_ep_del_ok_{epic_id}", width='stretch'):
                try:
                    with st.spinner("Deleting stories…"):
                        taiga_adapter.delete_epic_with_stories(epic_id)
                    st.session_state[epics_key] = [
                        e for e in st.session_state[epics_key] if e["id"] != epic_id
                    ]
                    for k in (
                        del_key, "_board_del_epic_name", exp_key, stor_key,
                        "epics_list", "_pending_epic_data",
                        "epics_load_error", "_taiga_stories",
                    ):
                        st.session_state.pop(k, None)
                    st.session_state["_notify_epics"] = "Epic and its stories deleted."
                    st.rerun()
                except taiga_adapter.TaigaAPIError as exc:
                    st.error(str(exc))
        with col_n:
            if st.button("Cancel", key=f"board_ep_del_no_{epic_id}", width='stretch'):
                st.session_state.pop(del_key, None)
                st.rerun()

    if st.session_state.get(exp_key, False):
        stories = st.session_state.get(stor_key, [])
        st.markdown(
            '<div style="height:1px;background:rgba(124,58,237,0.35);'
            'margin:4px 0 6px 0;border-radius:1px;"></div>',
            unsafe_allow_html=True,
        )
        if not stories:
            st.caption("  No stories.")
        else:
            for story in stories:
                _board_story_row(story, stor_key)
        _board_create_story(epic_id, stor_key)


def _board_story_row(story: dict, stories_key: str) -> None:
    sid     = story.get("id")
    ref     = story.get("ref", sid)
    subject = story.get("subject", "")
    del_key = "_board_del_story"

    col_info, col_name, col_del = st.columns([1, 7, 1])
    with col_info:
        if st.button("ℹ", key=f"story_info_{sid}", width='stretch'):
            _story_details_dialog(story, stories_key=stories_key)
    with col_name:
        st.markdown(
            f'<span style="color:#7c3aed;font-weight:700;font-size:14px;">▸</span>'
            f'&nbsp;<span style="font-size:14px;font-weight:500;">#{ref}&nbsp;{subject}</span>',
            unsafe_allow_html=True,
        )
    with col_del:
        if st.session_state.get(del_key) != sid:
            if st.button("✕", key=f"board_s_del_{sid}", width='stretch'):
                st.session_state[del_key]                = sid
                st.session_state["_board_del_story_sub"] = subject
                st.session_state["_board_del_story_sk"]  = stories_key
                st.rerun()

    if st.session_state.get(del_key) == sid:
        name = st.session_state.get("_board_del_story_sub", "")
        st.warning(f'Delete **"{name}"** from Taiga?')
        col_y, col_n = st.columns(2)
        with col_y:
            if st.button("Delete", type="primary", key=f"board_s_del_ok_{sid}", width='stretch'):
                try:
                    taiga_adapter.delete_story(sid)
                    sk = st.session_state.get("_board_del_story_sk", stories_key)
                    st.session_state[sk] = [s for s in st.session_state.get(sk, []) if s.get("id") != sid]
                    for k in (del_key, "_board_del_story_sub", "_board_del_story_sk"):
                        st.session_state.pop(k, None)
                    st.session_state["_notify_epics"] = "Story deleted."
                    st.rerun()
                except taiga_adapter.TaigaAPIError as exc:
                    st.error(str(exc))
        with col_n:
            if st.button("Cancel", key=f"board_s_del_no_{sid}", width='stretch'):
                st.session_state.pop(del_key, None)
                st.rerun()


def _board_create_epic(epics_key: str) -> None:
    st.caption("New epic")
    name = st.text_input("Epic name", key="board_new_epic_name",
                         label_visibility="collapsed", placeholder="Title")
    desc = st.text_input("Epic description", key="board_new_epic_desc",
                         label_visibility="collapsed", placeholder="Description")
    if st.button("Create epic", key="board_create_epic_btn",
                 disabled=not (name or "").strip(), width='stretch'):
        try:
            with st.spinner("Creating…"):
                epic = taiga_adapter.create_epic(name.strip(), (desc or "").strip())
            st.session_state[epics_key] = st.session_state.get(epics_key, []) + [epic]
            st.session_state["epics_list"] = None
            st.session_state.pop("epics_load_error", None)
            st.session_state.pop("_pending_epic_data", None)
            st.session_state.pop("board_new_epic_name", None)
            st.session_state.pop("board_new_epic_desc", None)
            st.session_state["_notify_epics"] = f'Epic "{epic["subject"]}" created.'
            st.rerun()
        except taiga_adapter.TaigaAPIError as exc:
            st.error(str(exc))


def _board_create_story(epic_id: int, stories_key: str) -> None:
    title_key = f"board_new_story_{epic_id}"
    desc_key  = f"board_new_story_desc_{epic_id}"
    st.caption("  New story")
    title = st.text_input("Story title", key=title_key,
                          label_visibility="collapsed", placeholder="Title")
    desc  = st.text_area("Story description", key=desc_key,
                         label_visibility="collapsed", placeholder="Description (optional)",
                         height=80)
    if st.button("Create story", key=f"board_create_story_{epic_id}",
                 disabled=not (title or "").strip(), width='stretch'):
        try:
            with st.spinner("Creating…"):
                story = taiga_adapter.create_story(
                    title.strip(), (desc or "").strip(), epic_id=epic_id,
                )
            st.session_state[stories_key] = st.session_state.get(stories_key, []) + [story]
            st.session_state.pop(title_key, None)
            st.session_state.pop(desc_key, None)
            st.session_state["_notify_epics"] = f'Story "{story["subject"]}" created.'
            st.rerun()
        except taiga_adapter.TaigaAPIError as exc:
            st.error(str(exc))


# ── User Management ───────────────────────────────────────────────────────────

def _user_management() -> None:
    if not taiga_adapter.is_configured():
        return

    with st.expander("Users & Roles", key="user_mgmt_exp"):
        _user_mgmt_content()


def _user_mgmt_content() -> None:
    if msg := st.session_state.pop("_notify_users", None):
        st.toast(msg)

    if not taiga_adapter.TAIGA_PROJECT_ID:
        st.caption("No project selected.")
        return

    _project_members_section()


def _project_members_section() -> None:
    members_key = "umgr_members"
    roles_key   = "umgr_roles"

    members: list[dict] | None = st.session_state.get(members_key)

    if members is None:
        try:
            st.session_state[members_key] = taiga_adapter.get_memberships()
            st.session_state[roles_key]   = taiga_adapter.get_roles()
        except taiga_adapter.TaigaAPIError as exc:
            st.error(str(exc))
            return
        st.rerun()

    members  = st.session_state[members_key]
    roles    = st.session_state.get(roles_key, [])
    role_map = {r["id"]: r["name"] for r in roles}

    col_lbl, col_btn = st.columns([5, 1])
    with col_lbl:
        st.markdown(f"**Members** &nbsp; `{len(members)}`")
    with col_btn:
        if st.button("↻", key="umgr_load_btn", width='stretch'):
            st.session_state.pop(members_key, None)
            st.session_state.pop(roles_key, None)
            st.rerun()

    for m in members:
        _member_row(m, roles, role_map, members_key)

    st.divider()
    _invite_member_form(roles)


def _member_row(m: dict, roles: list, role_map: dict, members_key: str) -> None:
    mid       = m.get("id")
    user_info = m.get("user_extra_info") or {}
    full_name = (user_info.get("full_name_display") or m.get("full_name", "")).strip()
    username  = (user_info.get("username") or "").strip()
    email     = m.get("email", "").strip()
    role_id   = m.get("role")
    is_owner  = m.get("is_owner", False)
    role_name = role_map.get(role_id, "")
    display   = full_name or username or "Unknown"
    contact   = email or username
    del_key   = f"_umgr_del_{mid}"

    # ── Info row: name | email | role | delete ────────────────────────────
    col_name, col_email, col_role_lbl, col_del = st.columns([3, 3, 2, 1])
    with col_name:
        st.markdown(f"**{_html.escape(display)}**", unsafe_allow_html=True)
    with col_email:
        st.markdown(
            f'<span style="color:#888;">{_html.escape(contact)}</span>',
            unsafe_allow_html=True,
        )
    with col_role_lbl:
        st.markdown(_html.escape(role_name), unsafe_allow_html=True)
    with col_del:
        if not is_owner:
            if st.button("✕", key=f"umgr_del_{mid}", width='stretch'):
                st.session_state[del_key] = True
                st.rerun()

    # ── Role edit row (non-owners only) ───────────────────────────────────
    if not is_owner and roles:
        role_ids = [r["id"]   for r in roles]
        role_nms = [r["name"] for r in roles]
        try:
            cur = role_ids.index(role_id)
        except ValueError:
            cur = 0
        col_sel, col_save = st.columns([5, 1])
        with col_sel:
            sel = st.selectbox(
                "role", options=range(len(roles)),
                format_func=lambda i: role_nms[i],
                index=cur, key=f"umgr_role_{mid}",
                label_visibility="collapsed",
            )
        with col_save:
            if st.button("✓", key=f"umgr_role_ok_{mid}", width='stretch'):
                new_rid = role_ids[sel]
                if new_rid != role_id:
                    try:
                        taiga_adapter.update_membership_role(mid, new_rid)
                        lst = st.session_state.get(members_key, [])
                        for i, mem in enumerate(lst):
                            if mem.get("id") == mid:
                                lst[i] = {**mem, "role": new_rid}
                                break
                        st.session_state["_notify_users"] = "Role updated."
                        st.rerun()
                    except taiga_adapter.TaigaAPIError as exc:
                        st.error(str(exc))

    # ── Delete confirm ────────────────────────────────────────────────────
    if st.session_state.get(del_key):
        st.warning(f'Remove **{_html.escape(display)}** from project?')
        c1, c2 = st.columns(2)
        with c1:
            if st.button("Remove", key=f"umgr_del_ok_{mid}", type="primary", width='stretch'):
                try:
                    taiga_adapter.delete_membership(mid)
                    st.session_state[members_key] = [
                        mem for mem in st.session_state.get(members_key, [])
                        if mem.get("id") != mid
                    ]
                    st.session_state.pop(del_key, None)
                    st.session_state["_notify_users"] = f"{display} removed."
                    st.rerun()
                except taiga_adapter.TaigaAPIError as exc:
                    st.error(str(exc))
        with c2:
            if st.button("Cancel", key=f"umgr_del_no_{mid}", width='stretch'):
                st.session_state.pop(del_key, None)
                st.rerun()

    st.markdown('<hr style="margin:4px 0;opacity:0.15;">', unsafe_allow_html=True)


def _invite_member_form(roles: list) -> None:
    st.caption("Invite member")
    email = st.text_input(
        "invite_email", key="umgr_invite_email",
        label_visibility="collapsed", placeholder="Username or email",
    )
    if not roles:
        st.caption("Load members first to see available roles.")
        return

    role_ids = [r["id"]   for r in roles]
    role_nms = [r["name"] for r in roles]
    sel = st.selectbox(
        "Role", options=range(len(roles)),
        format_func=lambda i: role_nms[i],
        key="umgr_invite_role",
        label_visibility="collapsed",
    )
    if st.button(
        "Send invite", key="umgr_invite_btn",
        disabled=not (email or "").strip(),
        width='stretch',
    ):
        try:
            with st.spinner("Sending…"):
                taiga_adapter.invite_member(email.strip(), role_ids[sel])
            st.session_state.pop("umgr_members", None)
            st.session_state.pop("umgr_invite_email", None)
            st.session_state["_notify_users"] = f"Invite sent to {email.strip()}."
            st.rerun()
        except taiga_adapter.TaigaAPIError as exc:
            st.error(str(exc))
