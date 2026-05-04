"""
components/sidebar.py
Shared sidebar — rendered by app.py on every page load.
"""

import os
from pathlib import Path

import streamlit as st

import ai_engine
import context_manager
import taiga_adapter

_PREF_FILE = Path(".streamlit/.theme_pref")


def _theme_button() -> None:
    """Small header button that flips dark/light mode.

    theme_is_dark lives purely in session_state — no widget key attached —
    so no Streamlit widget lifecycle can ever revert it between reruns.
    app.py reads it and re-injects the CSS on every rerun.
    """
    is_dark = st.session_state.get("theme_is_dark", True)
    label = "☀" if is_dark else "☾"
    if st.button(label, key="theme_btn", use_container_width=True):
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


def render_sidebar() -> None:
    with st.sidebar:
        bolt_color = "#7c3aed"
        col_logo, col_theme = st.columns([5, 1], vertical_alignment="center")
        with col_logo:
            st.markdown(
                f'<span style="font-size:1.55rem;font-weight:700;color:{bolt_color};letter-spacing:-0.02em;">bolt</span>'
                '<span style="font-size:13px;color:#888;font-weight:500;margin-left:6px;">· Spec-Anchored Continuity</span>',
                unsafe_allow_html=True,
            )
        with col_theme:
            _theme_button()

        st.divider()

        _phase_nav()

        st.divider()
        _ai_status()
        _taiga_status()
        _taiga_board()
        _stories_board()
        st.divider()
        _memory_bank()


# ── Phase navigation with progress badges ────────────────────────────────────

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


def _taiga_status() -> None:
    if not taiga_adapter.is_configured():
        st.caption("Taiga not configured — set TAIGA_AUTH_TOKEN in .env")
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
    """Inline project picker and creator — lives inside a sidebar expander."""
    if msg := st.session_state.pop("_notify_project", None):
        st.toast(msg)

    if not taiga_adapter.is_configured():
        st.caption("Configure TAIGA_AUTH_TOKEN in .env first.")
        return

    # ── Load projects list ────────────────────────────────────────────────
    if "taiga_projects" not in st.session_state:
        col_load, _ = st.columns([3, 1])
        with col_load:
            if st.button("Load projects", key="taiga_load_proj_btn", use_container_width=True):
                try:
                    with st.spinner("Loading…"):
                        st.session_state["taiga_projects"] = taiga_adapter.get_projects()
                    st.rerun()
                except taiga_adapter.TaigaAPIError as exc:
                    st.error(str(exc))
        return

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
            if st.button("Use this project", key="taiga_use_proj_btn", use_container_width=True):
                chosen = projects[sel]
                if chosen["id"] != taiga_adapter.TAIGA_PROJECT_ID:
                    taiga_adapter.set_active_project(chosen["id"])
                    for k in list(st.session_state.keys()):
                        if k.startswith(("epics_", "_taiga_", "taiga_proj")):
                            del st.session_state[k]
                    st.session_state["_notify_project"] = f"Switched to \"{chosen['name']}\"."
                    st.rerun()
        with col_ref:
            if st.button("↻", key="taiga_refresh_proj_btn", use_container_width=True,
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
        disabled=not can_create, use_container_width=True,
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

    col_label, col_btn = st.columns([6, 1], vertical_alignment="center")
    with col_label:
        st.markdown("**Context**")
    with col_btn:
        if st.button("↻", key="ctx_reload_btn", width="stretch"):
            for key in list(st.session_state.keys()):
                if key.startswith(("mem_bank", "func_spec", "tech_spec", "vaccines")):
                    del st.session_state[key]
            context_manager.rebuild_story_index()
            st.session_state["_notify_context"] = "Context reloaded."
            st.rerun()

    any_exists = any(
        (Path("contextspec") / f).exists()
        for f in ("memory-bank.md", "functional-spec.md", "technical-spec.md", "vaccines.md")
    )
    if not any_exists:
        st.caption("No context files yet.")
        return
    _context_size_indicator()
    _context_file_editor("memory-bank.md",    "mem_bank",  "Memory Bank")
    _context_file_editor("functional-spec.md", "func_spec", "Functional Specification")
    _context_file_editor("technical-spec.md",  "tech_spec", "Technical Specification")
    _context_file_editor("vaccines.md",        "vaccines",  "Vaccine Records")
    _reset_context_button()


def _reset_context_button() -> None:
    confirming = st.session_state.get("ctx_reset_confirming", False)
    if not confirming:
        if st.button("Reset context", key="ctx_reset_btn", width="stretch"):
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
        f'<span style="font-size:11px;color:#555;">context · </span>'
        f'<span style="font-size:11px;color:{color};">{total:,} chars</span>',
        unsafe_allow_html=True,
    )


def _context_file_editor(filename: str, state_key: str, label: str) -> None:
    path = Path("contextspec") / filename
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

    col_info, col_btn = st.columns([4, 1])
    with col_info:
        st.caption(f"{len(epics)} epic(s)" if epics is not None else "Load to view")
    with col_btn:
        if st.button("Load" if epics is None else "↻", key="board_load_btn", use_container_width=True):
            try:
                st.session_state[epics_key] = taiga_adapter.get_epics()
                for k in list(st.session_state):
                    if k.startswith("board_stories_"):
                        del st.session_state[k]
            except taiga_adapter.TaigaAPIError as exc:
                st.error(str(exc))
            st.rerun()

    if epics is None:
        return

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

    col_tog, col_name, col_del = st.columns([1, 6, 1])
    with col_tog:
        expanded = st.session_state.get(exp_key, False)
        if st.button("▼" if expanded else "▶", key=f"board_ep_tog_{epic_id}", use_container_width=True):
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
    with col_del:
        if st.session_state.get(del_key) != epic_id:
            if st.button("✕", key=f"board_ep_del_{epic_id}", use_container_width=True, help="Delete epic"):
                st.session_state[del_key]            = epic_id
                st.session_state["_board_del_epic_name"] = subject
                st.rerun()

    if st.session_state.get(del_key) == epic_id:
        name = st.session_state.get("_board_del_epic_name", "")
        st.warning(f'Delete **"{name}"** and all its stories from Taiga?')
        col_y, col_n = st.columns(2)
        with col_y:
            if st.button("Delete", type="primary", key=f"board_ep_del_ok_{epic_id}", use_container_width=True):
                try:
                    taiga_adapter.delete_epic(epic_id)
                    st.session_state[epics_key] = [
                        e for e in st.session_state[epics_key] if e["id"] != epic_id
                    ]
                    for k in (
                        del_key,
                        "_board_del_epic_name",
                        exp_key,
                        stor_key,
                        "epics_list",
                        "epic_selectbox_idx",
                        "_pending_epic_data",
                        "epics_visible",
                        "epics_load_error",
                        "_taiga_stories",
                    ):
                        st.session_state.pop(k, None)
                    st.session_state["_notify_epics"] = "Epic deleted."
                    st.rerun()
                except taiga_adapter.TaigaAPIError as exc:
                    st.error(str(exc))
        with col_n:
            if st.button("Cancel", key=f"board_ep_del_no_{epic_id}", use_container_width=True):
                st.session_state.pop(del_key, None)
                st.rerun()

    if st.session_state.get(exp_key, False):
        stories = st.session_state.get(stor_key, [])
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

    col_name, col_del = st.columns([7, 1])
    with col_name:
        st.caption(f"  #{ref} {subject}")
    with col_del:
        if st.session_state.get(del_key) != sid:
            if st.button("✕", key=f"board_s_del_{sid}", use_container_width=True, help="Delete story"):
                st.session_state[del_key]               = sid
                st.session_state["_board_del_story_sub"] = subject
                st.session_state["_board_del_story_sk"]  = stories_key
                st.rerun()

    if st.session_state.get(del_key) == sid:
        name = st.session_state.get("_board_del_story_sub", "")
        st.warning(f'Delete **"{name}"** from Taiga?')
        col_y, col_n = st.columns(2)
        with col_y:
            if st.button("Delete", type="primary", key=f"board_s_del_ok_{sid}", use_container_width=True):
                try:
                    taiga_adapter.delete_story(sid)
                    sk = st.session_state.get("_board_del_story_sk", stories_key)
                    st.session_state[sk] = [s for s in st.session_state.get(sk, []) if s.get("id") != sid]
                    if "all_stories" in st.session_state:
                        st.session_state["all_stories"] = [
                            s for s in st.session_state["all_stories"] if s.get("id") != sid
                        ]
                    for k in (del_key, "_board_del_story_sub", "_board_del_story_sk"):
                        st.session_state.pop(k, None)
                    st.session_state["_notify_epics"] = "Story deleted."
                    st.rerun()
                except taiga_adapter.TaigaAPIError as exc:
                    st.error(str(exc))
        with col_n:
            if st.button("Cancel", key=f"board_s_del_no_{sid}", use_container_width=True):
                st.session_state.pop(del_key, None)
                st.rerun()


def _board_create_epic(epics_key: str) -> None:
    st.caption("New epic")
    name = st.text_input("Epic name", key="board_new_epic_name",
                         label_visibility="collapsed", placeholder="Title")
    desc = st.text_input("Epic description", key="board_new_epic_desc",
                         label_visibility="collapsed", placeholder="Description")
    if st.button("Create epic", key="board_create_epic_btn",
                 disabled=not (name or "").strip(), use_container_width=True):
        try:
            with st.spinner("Creating…"):
                epic = taiga_adapter.create_epic(name.strip(), (desc or "").strip())
            st.session_state[epics_key] = st.session_state.get(epics_key, []) + [epic]
            st.session_state["epics_list"] = None
            st.session_state.pop("epics_visible", None)
            st.session_state.pop("epics_load_error", None)
            st.session_state["epic_selectbox_idx"] = 0
            st.session_state.pop("_pending_epic_data", None)
            st.session_state.pop("board_new_epic_name", None)
            st.session_state.pop("board_new_epic_desc", None)
            st.session_state["_notify_epics"] = f'Epic "{epic["subject"]}" created.'
            st.rerun()
        except taiga_adapter.TaigaAPIError as exc:
            st.error(str(exc))


def _board_create_story(epic_id: int, stories_key: str) -> None:
    title_key = f"board_new_story_{epic_id}"
    st.caption("  New story")
    title = st.text_input("Story title", key=title_key,
                          label_visibility="collapsed", placeholder="Title")
    if st.button("Create story", key=f"board_create_story_{epic_id}",
                 disabled=not (title or "").strip(), use_container_width=True):
        try:
            with st.spinner("Creating…"):
                story = taiga_adapter.create_story(title.strip(), "", epic_id=epic_id)
            st.session_state[stories_key] = st.session_state.get(stories_key, []) + [story]
            st.session_state.pop(title_key, None)
            st.session_state["_notify_epics"] = f'Story "{story["subject"]}" created.'
            st.rerun()
        except taiga_adapter.TaigaAPIError as exc:
            st.error(str(exc))


# ── All Stories board ─────────────────────────────────────────────────────────

def _stories_board() -> None:
    if not taiga_adapter.is_configured() or not taiga_adapter.TAIGA_PROJECT_ID:
        return

    with st.expander("Stories", key="taiga_stories_exp"):
        _stories_content()


def _stories_content() -> None:
    if msg := st.session_state.pop("_notify_stories", None):
        st.toast(msg)

    key = "all_stories"
    stories: list[dict] | None = st.session_state.get(key)

    col_info, col_btn = st.columns([4, 1])
    with col_info:
        if stories is None:
            st.caption("Load to view")
        else:
            n = len(stories)
            st.caption(f"{n} {'story' if n == 1 else 'stories'}")
    with col_btn:
        if st.button("Load" if stories is None else "↻", key="all_stories_load_btn",
                     use_container_width=True):
            try:
                st.session_state[key] = taiga_adapter.get_stories()
            except taiga_adapter.TaigaAPIError as exc:
                st.error(str(exc))
            st.rerun()

    if stories is None:
        return

    if not stories:
        st.caption("No stories in this project.")
    else:
        for story in stories:
            _stories_row(story, key)

    st.divider()
    _stories_create(key)


def _stories_row(story: dict, stories_key: str) -> None:
    sid     = story.get("id")
    ref     = story.get("ref", sid)
    subject = story.get("subject", "")
    del_key = "_all_stories_del"

    epic_info = story.get("epic_extra_info") or story.get("epics")
    if isinstance(epic_info, dict) and epic_info.get("subject"):
        epic_label = f"  `{epic_info['subject']}`"
    elif isinstance(epic_info, list) and epic_info:
        epic_label = f"  `{epic_info[0].get('subject', 'epic')}`"
    else:
        epic_label = ""

    col_name, col_del = st.columns([7, 1])
    with col_name:
        st.caption(f"#{ref} {subject}{epic_label}")
    with col_del:
        if st.session_state.get(del_key) != sid:
            if st.button("✕", key=f"all_s_del_{sid}", use_container_width=True,
                         help="Delete story"):
                st.session_state[del_key]              = sid
                st.session_state["_all_stories_del_sub"] = subject
                st.rerun()

    if st.session_state.get(del_key) == sid:
        name = st.session_state.get("_all_stories_del_sub", "")
        st.warning(f'Delete **"{name}"** from Taiga?')
        col_y, col_n = st.columns(2)
        with col_y:
            if st.button("Delete", type="primary", key=f"all_s_del_ok_{sid}",
                         use_container_width=True):
                try:
                    taiga_adapter.delete_story(sid)
                    st.session_state[stories_key] = [
                        s for s in st.session_state.get(stories_key, []) if s.get("id") != sid
                    ]
                    # Keep epic-scoped caches consistent
                    for k in list(st.session_state):
                        if k.startswith("board_stories_"):
                            st.session_state[k] = [
                                s for s in st.session_state[k] if s.get("id") != sid
                            ]
                    for k in (del_key, "_all_stories_del_sub"):
                        st.session_state.pop(k, None)
                    st.session_state["_notify_stories"] = "Story deleted."
                    st.rerun()
                except taiga_adapter.TaigaAPIError as exc:
                    st.error(str(exc))
        with col_n:
            if st.button("Cancel", key=f"all_s_del_no_{sid}", use_container_width=True):
                st.session_state.pop(del_key, None)
                st.rerun()


def _stories_create(stories_key: str) -> None:
    st.caption("New story")
    title = st.text_input(
        "Story title", key="all_new_story_title",
        label_visibility="collapsed", placeholder="Title",
    )

    epics: list[dict] = st.session_state.get("board_epics") or []
    epic_labels = ["(no epic)"] + [
        f"#{e.get('ref', e['id'])} {e.get('subject', '')}" for e in epics
    ]
    epic_sel = st.selectbox(
        "Epic", options=range(len(epic_labels)),
        format_func=lambda i: epic_labels[i],
        key="all_new_story_epic_sel",
        label_visibility="collapsed",
    )

    if st.button("Create story", key="all_create_story_btn",
                 disabled=not (title or "").strip(), use_container_width=True):
        epic_id = None if epic_sel == 0 else epics[epic_sel - 1]["id"]
        try:
            with st.spinner("Creating…"):
                story = taiga_adapter.create_story(title.strip(), "", epic_id=epic_id)
            st.session_state[stories_key] = st.session_state.get(stories_key, []) + [story]
            if "all_stories" in st.session_state:
                st.session_state["all_stories"] = st.session_state.get("all_stories", []) + [story]
            if epic_id and f"board_stories_{epic_id}" in st.session_state:
                st.session_state[f"board_stories_{epic_id}"] = (
                    st.session_state[f"board_stories_{epic_id}"] + [story]
                )
            st.session_state.pop("all_new_story_title", None)
            st.session_state["_notify_stories"] = f'Story "{story["subject"]}" created.'
            st.rerun()
        except taiga_adapter.TaigaAPIError as exc:
            st.error(str(exc))
