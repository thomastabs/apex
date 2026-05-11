"""
components/phase1.py
Phase 1 — Mob Elaboration: Discovery & Requirements.

Wizard-like pipeline:
  STEP 1  → define epic (new / load from Taiga / AI-suggested)
  STEP 2  → ai_engine.generate_nl_stories()     → NL draft for human cross-examination
  STEP 3  → human review + ai_engine.compile_gherkin_stories() → formal Gherkin per story
  STEP 4  → Gherkin review + taiga_adapter.create_story() × N  → Taiga + context lock

Session state keys are documented in _STATE_DEFAULTS.
"""

import re
import time

import streamlit as st

from src import ai_engine
from src import context_manager
from src import taiga_adapter
from src.taiga_adapter import TaigaAPIError

_STATE_DEFAULTS: dict = {
    "nl_draft":            "",
    "nl_editor":           "",
    "story_subject":       "",
    "compiled_stories":    None,
    "push_done":           False,
    "push_result":         None,
    "ai_error":            None,
    "compile_error":       None,
    "_draft_loaded":       False,   # guards draft restoration to once per session
    "epics_suggested":     None,
    "suggest_epics_error": None,
    "start_mode":               "new",   # current mode: "new" | "load" | "suggest"
    "_epic_loaded_by":          None,    # "load" | "suggest" | None — tracks which panel loaded an epic
    "_selected_suggest_title":  None,    # title of the currently selected suggested epic
    "_selected_suggest_idx":    None,    # index of the currently selected suggested epic
}


def render_phase1() -> None:
    _init_state()

    st.header("Phase 1 · Requirements")
    st.caption("Mob Elaboration — transform an Epic into formal Gherkin Acceptance Criteria")

    with st.expander("View Process Diagram (How this works)", expanded=False):
        try:
            st.image("images/requirements.svg", width="stretch")
        except Exception:
            pass

    st.divider()
    _section_step1()

    st.divider()
    _section_generate()

    if st.session_state.nl_draft:
        st.divider()
        _section_review()
        if not st.session_state.compiled_stories:
            _section_compile()
        else:
            st.divider()
            _section_gherkin_review()


# ── Session state ─────────────────────────────────────────────────────────────

def _init_state() -> None:
    for key, default in _STATE_DEFAULTS.items():
        if key not in st.session_state:
            st.session_state[key] = default
    # Restore a persisted draft exactly once per browser session.
    if not st.session_state["_draft_loaded"]:
        _restore_draft()
        st.session_state["_draft_loaded"] = True


def _restore_draft() -> None:
    """Load a persisted draft into session state if no live draft already exists."""
    draft = context_manager.load_draft()
    if not draft or st.session_state.get("nl_draft"):
        return
    if draft.get("epic_subject"):
        st.session_state["epic_subject_input"] = draft["epic_subject"]
    if draft.get("epic_id"):
        st.session_state["epic_id_input"] = draft["epic_id"]
        try:
            st.session_state["_source_epic_id"] = int(draft["epic_id"])
        except (ValueError, TypeError):
            pass
    nl = draft.get("nl_draft", "")
    if nl:
        st.session_state["nl_draft"]  = nl
        st.session_state["nl_editor"] = nl
    compiled = draft.get("compiled_stories")
    if compiled:
        st.session_state["compiled_stories"] = compiled
        for i, item in enumerate(compiled):
            st.session_state[f"gherkin_edit_{i}"] = item["gherkin"]


def _save_current_draft() -> None:
    context_manager.save_draft({
        "epic_subject":     st.session_state.get("epic_subject_input", ""),
        "epic_id":          st.session_state.get("epic_id_input", ""),
        "nl_draft":         st.session_state.get("nl_draft", ""),
        "compiled_stories": st.session_state.get("compiled_stories"),
    })


def _clear_story_progress() -> None:
    """Clear NL/Gherkin progress while preserving epic selection and panel caches."""
    _clear_gherkin_editors()
    context_manager.clear_draft()
    for key in ("nl_draft", "nl_editor", "story_subject",
                "compiled_stories", "push_done", "push_result",
                "ai_error", "compile_error"):
        st.session_state.pop(key, None)


# ── Step 1: Define Your Epic ──────────────────────────────────────────────────

def _apply_pending_epic() -> None:
    """Apply staged epic data BEFORE any widget with those keys is rendered."""
    pending: dict | None = st.session_state.pop("_pending_epic_data", None)
    if not pending:
        return
    if "subject" in pending:
        st.session_state["epic_subject_input"] = pending["subject"]
        # Non-widget backup: survives Streamlit GC when the panel isn't rendered
        st.session_state["_epic_subject_bak"] = pending["subject"]
    if "description" in pending:
        st.session_state["epic_desc_input"] = pending["description"]
        st.session_state["_epic_desc_bak"] = pending["description"]
    if "id" in pending:
        st.session_state["epic_id_input"] = pending["id"]
        # Keep a non-widget copy so _run_push can fall back even if the text field is cleared
        st.session_state["_source_epic_id"] = int(pending["id"])
    else:
        # Loaded from Suggest Epics (no existing ID) — clear any stale source
        st.session_state.pop("_source_epic_id", None)


_MODE_LABELS = {
    "new":     "Create New Epic",
    "load":    "Load from Taiga",
    "suggest": "AI Suggests",
}


def _request_mode_change(mode: str) -> None:
    """on_click callback — runs before the script renders, so start_mode is
    correct by the time buttons are drawn on the same rerun."""
    st.session_state["_requested_mode"] = mode


def _has_progress(mode: str) -> bool:
    """True if the active tab or any downstream step has work that would be lost on a tab switch.

    Progress is tab-specific so the guard only fires when the user has actually
    done something meaningful in the current panel:
      "new"     — typed anything into Title or Description
      "load"    — an epic was explicitly selected (list auto-loads; mere presence is not progress)
      "suggest" — AI has returned suggestions
    Plus a global downstream check: Step 2 NL draft or Step 3 Gherkin exist.
    """
    if mode == "new":
        tab_progress = bool(
            st.session_state.get("epic_subject_input", "").strip()
            or st.session_state.get("epic_desc_input", "").strip()
        )
    elif mode == "load":
        tab_progress = st.session_state.get("_epic_loaded_by") == "load"
    else:  # "suggest"
        tab_progress = bool(st.session_state.get("epics_suggested"))

    downstream = bool(
        st.session_state.get("nl_draft")
        or st.session_state.get("compiled_stories")
    )
    return tab_progress or downstream


@st.dialog("Discard Unsaved Progress?")
def _mode_switch_dialog(desired: str) -> None:
    # _dlg_open sentinel: cleared by every explicit exit path (Yes / Cancel).
    # If the dialog is dismissed via X or a click-away, neither button runs and
    # the sentinel is left set.  _section_step1() detects this on the next rerun
    # and treats it as Cancel — no mode change occurs.
    st.warning(
        "You have unsaved progress in the current Epic setup. "
        "Switching sources will reset your inputs and any generated User Stories in Step 2. "
        "Do you want to proceed?"
    )
    col_yes, col_no = st.columns(2)
    with col_yes:
        if st.button("Yes, switch", type="primary", key="_dlg_confirm", width="stretch"):
            st.session_state.pop("_dlg_open", None)
            _reset_state()
            st.session_state["start_mode"] = desired
            st.rerun()
    with col_no:
        if st.button("Cancel", key="_dlg_cancel", width="stretch"):
            st.session_state.pop("_dlg_open", None)
            st.rerun()


def _section_step1() -> None:
    if msg := st.session_state.pop("_notify_phase1", None):
        st.toast(msg)
    _apply_pending_epic()

    st.markdown("### Step 1 · Define Your Epic")

    has_gherkin  = bool(st.session_state.get("compiled_stories"))
    current_mode = st.session_state.get("start_mode", "new")

    # Detect X-button / click-away dismiss of the progress-guard dialog.
    # _dlg_open is set just before the dialog call; Yes/Cancel handlers clear it.
    # If it's still set but no new mode request was queued, the user dismissed the
    # dialog without choosing — treat it the same as Cancel (no mode change).
    if st.session_state.get("_dlg_open") and not st.session_state.get("_requested_mode"):
        st.session_state.pop("_dlg_open", None)

    # In load/suggest modes, epic_subject_input and epic_desc_input are set
    # programmatically by _apply_pending_epic().  Streamlit may GC a widget-keyed
    # entry when no widget claims it in a given run (e.g. the dialog-showing run
    # where _panel_new_epic() didn't render).  The non-widget backup keys survive
    # that GC and allow us to restore the values here on the next rerun.
    if current_mode != "new":
        for w_key, bak_key in (
            ("epic_subject_input", "_epic_subject_bak"),
            ("epic_desc_input",    "_epic_desc_bak"),
        ):
            if not st.session_state.get(w_key) and st.session_state.get(bak_key):
                st.session_state[w_key] = st.session_state[bak_key]

    # ── Consume the on_click request BEFORE buttons render so highlight is right ─
    # _request_mode_change sets _requested_mode in the on_click phase (before rerun),
    # so it is already present when this line executes.
    requested: str | None = st.session_state.pop("_requested_mode", None)
    _show_dialog = False
    if requested and requested != current_mode and not has_gherkin:
        if _has_progress(current_mode):
            _show_dialog = True          # dialog shown after buttons; panel suppressed
        else:
            st.session_state["start_mode"] = requested
            current_mode = requested     # immediate switch — nothing to lose

    # ── Mode selector buttons ─────────────────────────────────────────────
    col1, col2, col3 = st.columns(3)
    with col1:
        st.button(
            _MODE_LABELS["new"],
            type="primary" if current_mode == "new" else "secondary",
            key="mode_btn_new", width="stretch", disabled=has_gherkin,
            on_click=_request_mode_change, args=("new",),
        )
    with col2:
        st.button(
            _MODE_LABELS["load"],
            type="primary" if current_mode == "load" else "secondary",
            key="mode_btn_load", width="stretch", disabled=has_gherkin,
            on_click=_request_mode_change, args=("load",),
        )
    with col3:
        st.button(
            _MODE_LABELS["suggest"],
            type="primary" if current_mode == "suggest" else "secondary",
            key="mode_btn_suggest", width="stretch", disabled=has_gherkin,
            on_click=_request_mode_change, args=("suggest",),
        )

    if has_gherkin:
        st.caption("Epic source is locked once Gherkin is compiled. Use **Start Over** to restart.")
        return

    # ── Open dialog if a mode change was blocked by active progress ───────
    # No early return: the panel renders behind the modal overlay.  This keeps
    # every widget in the DOM so Streamlit does not GC their session-state values
    # between the dialog-showing run and the Cancel rerun.
    if _show_dialog:
        st.session_state["_dlg_open"] = True   # cleared by Yes/Cancel; X-dismiss leaves it set
        _mode_switch_dialog(requested)

    # ── Render panel for current mode ─────────────────────────────────────
    if current_mode == "new":
        _panel_new_epic()
    elif current_mode == "load":
        _panel_load_epic()
    else:
        _panel_suggest_epics()


def _panel_new_epic() -> None:
    col_title, col_id = st.columns([3, 1])
    with col_title:
        st.text_input(
            "Title",
            placeholder="e.g. User Authentication with OAuth2",
            key="epic_subject_input",
        )
    with col_id:
        st.text_input(
            "Taiga Epic ID (optional)",
            placeholder="e.g. 42",
            key="epic_id_input",
        )

    existing_id = st.session_state.get("_source_epic_id") or _parse_epic_id()
    if existing_id:
        st.info(
            f"Stories will be added to existing Taiga Epic **#{existing_id}** — no new epic will be created.",
        )

    st.text_area(
        "Description",
        placeholder="Describe the feature, its goals, and any known constraints...",
        height=120,
        key="epic_desc_input",
    )

    st.text_area(
        "AI Guidance (optional)",
        placeholder=(
            "Steer the output — e.g. 'Focus only on the happy path', "
            "'At most 3 stories', 'Assume a REST API backend', "
            "'Skip mobile for this iteration'..."
        ),
        height=70,
        key="ai_hint_input",
    )


def _delete_epic_action(epic: dict) -> None:
    """Delete-with-confirm control for a single epic."""
    epic_id = epic["id"]
    pending_key = "_del_epic_pending"

    if st.session_state.get(pending_key) == epic_id:
        st.warning(f"Permanently delete **\"{epic['subject']}\"** and all its stories from Taiga?")
        col_yes, col_no = st.columns(2)
        with col_yes:
            if st.button("Delete", type="primary", key="del_epic_confirm_btn", width='stretch'):
                try:
                    with st.spinner("Deleting stories…"):
                        taiga_adapter.delete_epic_with_stories(epic_id)
                    st.session_state.pop(pending_key, None)
                    for k in ("epics_list", "_pending_epic_data",
                              "_taiga_stories", "epics_load_error",
                              "epics_detail_cache"):
                        st.session_state.pop(k, None)
                    st.session_state.pop("board_epics", None)
                    st.session_state.pop(f"board_stories_{epic_id}", None)
                    st.session_state.pop(f"board_exp_{epic_id}", None)
                    st.session_state.pop("all_stories", None)
                    st.session_state["_notify_phase1"] = "Epic deleted from Taiga."
                    st.rerun()
                except TaigaAPIError as exc:
                    st.error(str(exc))
        with col_no:
            if st.button("Cancel", key="del_epic_cancel_btn", width='stretch'):
                st.session_state.pop(pending_key, None)
                st.rerun()
    else:
        if st.button("Delete epic from Taiga", key="del_epic_btn", width="stretch"):
            st.session_state[pending_key] = epic_id
            st.rerun()


# ── Step 2: Generate ──────────────────────────────────────────────────────────

def _generation_overlay() -> None:
    """Block interactive elements and show a wait cursor during AI generation.

    Uses a <style> injection instead of a fixed overlay so scroll events pass through
    normally. Removed on the next rerun (only rendered inside the generation block).
    """
    st.markdown(
        "<style>"
        "* { cursor: wait !important; }"
        "button, a, input, textarea, select, [role='button'],"
        " [data-testid^='stBaseButton'], [data-testid='stTab'] {"
        " pointer-events: none !important; }"
        "</style>",
        unsafe_allow_html=True,
    )


def _section_generate() -> None:
    st.markdown("### Step 2 · Generate User Stories")

    subject     = st.session_state.get("epic_subject_input", "").strip()
    description = st.session_state.get("epic_desc_input", "").strip()
    hint        = st.session_state.get("ai_hint_input", "").strip()

    signed_in       = taiga_adapter.is_configured()
    project_chosen  = bool(taiga_adapter.TAIGA_PROJECT_ID)
    project_concept = context_manager.get_project_concept()

    blockers: list[str] = []
    if not signed_in:
        blockers.append("signed_in")
        st.warning("Not signed in to Taiga — use the **⇄** button in the sidebar to sign in.")
    if not project_chosen:
        blockers.append("project")
        st.warning("No Taiga project selected — choose one in the sidebar under **Project**.")
    if not project_concept:
        blockers.append("concept")
        st.warning(
            "No Project Concept found in the Memory Bank — "
            "add one under **## Project Concept** in the sidebar before generating."
        )

    can_generate = bool(subject and description and not blockers)

    if not blockers:
        st.info("Fill in your Epic above, then click **Generate** to create Natural Language user stories.")

    if st.button(
        "Generate User Stories",
        type="primary",
        disabled=not can_generate,
        key="generate_btn",
        width="stretch",
    ):
        _generation_overlay()
        _run_generation(subject, description, hint, project_concept)

    if not can_generate and not blockers:
        st.caption("Epic title and description are required.")

    if st.session_state.ai_error:
        st.error(st.session_state.ai_error)


def _run_generation(subject: str, description: str, hint: str, project_concept: str = "") -> None:
    with st.status("Generating User Stories...", expanded=True) as status:
        try:
            status.write("Connecting to AI...")

            def _on_story(n: int) -> None:
                status.write(f"Story {n} received...")

            story_list = ai_engine.generate_nl_stories(
                subject, description, hint=hint, project_concept=project_concept,
                on_story=_on_story,
            )
            status.write("Formatting for review...")
            nl_text = ai_engine.format_nl_draft(story_list)
            st.session_state.nl_draft         = nl_text
            st.session_state.nl_editor        = nl_text
            st.session_state.story_subject    = subject
            st.session_state.push_done        = False
            st.session_state.push_result      = None
            st.session_state.ai_error         = None
            st.session_state.compile_error    = None
            _save_current_draft()
            status.update(
                label=f"{len(story_list.stories)} stories ready for review",
                state="complete",
            )
        except Exception as exc:
            st.session_state.ai_error = _classify_ai_error(exc)
            status.update(label="Generation failed", state="error")
    st.rerun()


def _classify_ai_error(exc: Exception) -> str:
    if isinstance(exc, ai_engine.AIRateLimitError):
        return (
            "Rate limit or quota exceeded (HTTP 429). "
            "Check your Anthropic usage at console.anthropic.com, "
            "or verify ANTHROPIC_API_KEY is correct in .env."
        )
    if isinstance(exc, ai_engine.AITimeoutError):
        return "AI request timed out. Please retry."
    msg = str(exc)
    if "429" in msg or "rate_limit" in msg.lower() or "quota" in msg.lower():
        return (
            "Rate limit or quota exceeded (HTTP 429). "
            "Check your Anthropic usage at console.anthropic.com, "
            "or verify ANTHROPIC_API_KEY is correct in .env."
        )
    return msg


# ── Step 3: Review & Edit (Interactive Bridge) ────────────────────────────────

def _section_review() -> None:
    st.markdown("### Step 3 · Review & Edit Natural Language Draft")
    st.info(
        "Review the AI-generated Natural Language draft below. "
        "Edit freely — add, remove, or rewrite stories in plain language. "
        "When satisfied, click **Compile to Gherkin** below to convert the draft into formal acceptance criteria."
    )

    if "nl_editor" not in st.session_state:
        st.session_state.nl_editor = st.session_state.nl_draft

    st.text_area(
        "Natural Language Story Draft",
        key="nl_editor",
        height=400,
    )


# ── Section: Compile ──────────────────────────────────────────────────────────

def _section_compile() -> None:
    col_compile, col_reset = st.columns([2, 1])
    with col_compile:
        compile_clicked = st.button(
            "Compile to Gherkin", type="primary", key="compile_btn", width="stretch",
        )
        st.caption("Convert the NL draft into formal Gherkin acceptance criteria")
    with col_reset:
        if st.button("↺ Start Over", key="reset_btn", width="stretch"):
            _reset_state()
            st.rerun()
        st.caption("Discard all progress and restart from Step 1")

    if compile_clicked:
        _run_compile()

    if st.session_state.get("compile_error"):
        st.error(f"Gherkin compilation failed: {st.session_state.compile_error}")


def _run_compile() -> None:
    nl_text = st.session_state.get("nl_editor", "")
    with st.status("Compiling to Gherkin...", expanded=True) as status:
        try:
            status.write("Connecting to AI...")

            def _on_story(n: int) -> None:
                status.write(f"Story {n} compiled...")

            gherkin_list = ai_engine.compile_gherkin_stories(nl_text, on_story=_on_story)
            status.write("Preparing review...")
            compiled = [
                {
                    "title":   story.title,
                    "size":    story.size,
                    "gherkin": ai_engine.format_gherkin_story(story),
                }
                for story in gherkin_list.stories
            ]
            st.session_state.compiled_stories = compiled
            for i, item in enumerate(compiled):
                st.session_state[f"gherkin_edit_{i}"] = item["gherkin"]
            st.session_state.compile_error = None
            _save_current_draft()
            status.update(
                label=f"{len(compiled)} stories compiled — review before pushing",
                state="complete",
            )
        except Exception as exc:
            st.session_state.compile_error = _classify_ai_error(exc)
            status.update(label="Compilation failed", state="error")
    st.rerun()


# ── Step 4: Review Gherkin + Confirm Push ─────────────────────────────────────

def _validate_compiled_stories(compiled: list[dict]) -> list[str]:
    """Return validation error strings — push is blocked until the list is empty."""
    errors: list[str] = []
    for i, item in enumerate(compiled):
        title   = item.get("title", "").strip()
        # Prefer session state, but fall back to item gherkin if the widget state is empty
        # (can happen when Streamlit resets widget identity after a container key change).
        gherkin = st.session_state.get(f"gherkin_edit_{i}") or item.get("gherkin", "")
        label   = f'"{title}"' if title else f"Story {i + 1}"
        if not title:
            errors.append(f"Story {i + 1} has no title.")
        if not re.search(r"^\s*Feature:", gherkin, re.MULTILINE):
            errors.append(f"{label} is missing a Feature: header.")
        if not re.search(r"^\s*Scenario(?: Outline)?:", gherkin, re.MULTILINE):
            errors.append(f"{label} has no Scenario blocks.")
    return errors


def _sync_editors_to_compiled() -> None:
    for i, item in enumerate(st.session_state.compiled_stories):
        val = st.session_state.get(f"gherkin_edit_{i}")
        if val:  # don't overwrite good gherkin with an empty widget state
            item["gherkin"] = val


def _reseed_editors() -> None:
    _clear_gherkin_editors()
    for i, item in enumerate(st.session_state.compiled_stories):
        st.session_state[f"gherkin_edit_{i}"] = item["gherkin"]


def _delete_story(index: int) -> None:
    _sync_editors_to_compiled()
    del st.session_state.compiled_stories[index]
    for key in [k for k in st.session_state if k.startswith(("rename_mode_", "rename_input_"))]:
        del st.session_state[key]
    _reseed_editors()


def _add_story() -> None:
    _sync_editors_to_compiled()
    new_story = {
        "title":   "New Story",
        "size":    "S",
        "gherkin": "Feature: New Story\n\n  Scenario: \n    Given \n    When \n    Then ",
    }
    st.session_state.compiled_stories.append(new_story)
    idx = len(st.session_state.compiled_stories) - 1
    st.session_state[f"gherkin_edit_{idx}"] = new_story["gherkin"]


def _section_gherkin_review() -> None:
    st.markdown("### Step 4 · Review Gherkin & Push to Taiga")
    st.info("Review the formal Gherkin below. Edit directly in the text boxes, then push to Taiga.")

    compiled: list[dict] = st.session_state.compiled_stories
    push_done = st.session_state.push_done

    for i, item in enumerate(compiled):
        with st.expander(f"[{item['size']}] {item['title']}", expanded=True, key=f"story_exp_{i}"):
            if not push_done:
                is_renaming: bool = st.session_state.get(f"rename_mode_{i}", False)

                col_title_input, col_size, col_ren, col_del = st.columns([7, 1, 1, 1])
                with col_title_input:
                    if is_renaming:
                        st.text_input(
                            "Story title",
                            key=f"rename_input_{i}",
                            label_visibility="collapsed",
                        )
                with col_size:
                    if st.button(item["size"], key=f"size_btn_{i}", width='stretch'):
                        _sync_editors_to_compiled()
                        compiled[i]["size"] = "XS" if item["size"] == "S" else "S"
                        st.rerun()
                with col_ren:
                    if st.button("✓" if is_renaming else "✎", key=f"rename_btn_{i}", width='stretch'):
                        if is_renaming:
                            new_title = st.session_state.get(f"rename_input_{i}", "").strip()
                            if new_title:
                                compiled[i]["title"] = new_title
                            st.session_state[f"rename_mode_{i}"] = False
                        else:
                            st.session_state[f"rename_mode_{i}"] = True
                            st.session_state[f"rename_input_{i}"] = item["title"]
                        st.rerun()
                with col_del:
                    if st.button("✕", key=f"del_story_{i}", width='stretch'):
                        _delete_story(i)
                        st.rerun()

            # Re-seed from compiled gherkin if the widget state was reset to empty
            # (happens when Streamlit reassigns widget identity after an expander key change).
            if not st.session_state.get(f"gherkin_edit_{i}"):
                st.session_state[f"gherkin_edit_{i}"] = item["gherkin"]
            st.text_area(
                "Gherkin",
                key=f"gherkin_edit_{i}",
                height=250,
                label_visibility="collapsed",
                disabled=push_done,
            )

    if not push_done:
        if st.button("+ Add Story", key="add_story_btn", width="stretch"):
            _add_story()
            st.rerun()

    st.divider()

    validation_errors = _validate_compiled_stories(compiled) if not push_done else []
    if validation_errors:
        for err in validation_errors:
            st.caption(f"· {err}")

    col_push, col_back, col_reset = st.columns([3, 2, 2])
    with col_push:
        push_clicked = st.button(
            "Confirm Push to Taiga",
            type="primary",
            disabled=st.session_state.push_done or bool(validation_errors),
            key="push_btn",
            width="stretch",
        )
    with col_back:
        if st.button(
            "← Edit NL Draft",
            key="edit_btn",
            disabled=st.session_state.push_done,
            width="stretch",
        ):
            _clear_gherkin_editors()
            st.session_state.compiled_stories = None
            st.session_state.compile_error    = None
            st.rerun()
        if not push_done:
            st.caption("Return to Step 3 to revise the NL draft")
    with col_reset:
        if st.button(
            "↺ Start Over",
            key="reset_btn_gherkin",
            disabled=st.session_state.push_done,
            width="stretch",
        ):
            _reset_state()
            st.rerun()
        if not push_done:
            st.caption("Discard all progress, restart from Step 1")

    if push_clicked:
        _run_push()

    _render_push_result()


def _run_push() -> None:
    compiled:    list[dict] = st.session_state.compiled_stories
    epic_id_val: int | None = _parse_epic_id()

    # If the text field was cleared, fall back to the ID stored when loading from Load from Taiga
    if epic_id_val is None:
        epic_id_val = st.session_state.get("_source_epic_id")

    # Guard: if no existing Epic ID, require a title to create one.
    if epic_id_val is None and not st.session_state.get("epic_subject_input", "").strip():
        st.session_state.push_result = {
            "ok":    False,
            "error": "Provide an Epic title (or a Taiga Epic ID) before pushing.",
        }
        st.rerun()
        return

    with st.status("Pushing to Taiga...", expanded=True) as push_status:
        context_manager.init_context()
        epic_info: dict | None = None

        # ── Resolve or create the Epic ────────────────────────────────────
        if epic_id_val is None:
            subject     = st.session_state.get("epic_subject_input", "").strip()
            description = st.session_state.get("epic_desc_input", "").strip()
            push_status.write(f'Creating Epic "{subject}"...')
            try:
                epic        = taiga_adapter.create_epic(subject, description)
                epic_id_val = epic["id"]
                epic_info   = {"epic_id": epic_id_val, "title": subject, "created": True}
            except TaigaAPIError as exc:
                push_status.update(label="Push failed", state="error")
                st.session_state.push_result = {"ok": False, "error": str(exc)}
                st.rerun()
                return
        else:
            epic_info = {
                "epic_id": epic_id_val,
                "title":   st.session_state.get("epic_subject_input", "").strip(),
                "created": False,
            }
            push_status.write(f"Using Epic #{epic_id_val}...")

        # ── Resolve "Ready for Discovery" status (non-critical) ───────────
        push_status.write("Resolving board status...")
        ready_status_id: int | None = None
        try:
            ready_status_id = taiga_adapter.find_status_id("Ready for Discovery")
        except TaigaAPIError:
            pass

        # ── Detect existing stories in this epic to skip duplicates ───────
        existing_subjects: set[str] = set()
        if not epic_info.get("created"):
            push_status.write("Checking for duplicates...")
            try:
                existing = taiga_adapter.get_stories_for_epic(epic_id_val)
                existing_subjects = {s["subject"].lower() for s in existing}
            except TaigaAPIError:
                pass

        # ── Push each story ───────────────────────────────────────────────
        created:    list[dict] = []
        skipped:    list[str]  = []
        push_error: str | None = None
        _order_base = int(time.time())
        total_new   = sum(
            1 for item in compiled
            if item["title"].lower() not in existing_subjects
        )

        for i, item in enumerate(compiled):
            if item["title"].lower() in existing_subjects:
                skipped.append(item["title"])
                continue

            gherkin_text = st.session_state.get(f"gherkin_edit_{i}", item["gherkin"])
            size         = item.get("size", "S")
            push_status.write(
                f"Story {len(created) + 1} / {total_new}: {item['title']}..."
            )

            try:
                taiga_story = taiga_adapter.create_story(
                    item["title"],
                    ai_engine.bold_gherkin_keywords(gherkin_text),
                    epic_id=epic_id_val,
                    tags=["apex", size],
                    backlog_order=_order_base + len(created),
                )
                story_id = taiga_story["id"]

                if ready_status_id is not None and taiga_story.get("version") is not None:
                    try:
                        taiga_adapter.update_story_status(
                            story_id, ready_status_id, taiga_story["version"]
                        )
                    except TaigaAPIError:
                        pass

                context_manager.append_gherkin(
                    story_id, item["title"], gherkin_text,
                    epic_id=epic_id_val,
                    epic_title=epic_info["title"] if epic_info else "",
                )

                url = taiga_adapter.get_story_url(taiga_story.get("ref"))
                created.append({
                    "story_id": story_id,
                    "ref":      taiga_story.get("ref"),
                    "title":    item["title"],
                    "url":      url,
                })

            except TaigaAPIError as exc:
                push_error = str(exc)
                break

        if created or skipped:
            noun = "story" if len(created) == 1 else "stories"
            push_status.update(
                label=f"{len(created)} {noun} pushed successfully",
                state="complete",
            )
            st.session_state.push_done   = True
            st.session_state.push_result = {
                "ok":            True,
                "epic":          epic_info,
                "stories":       created,
                "skipped":       skipped,
                "partial":       push_error is not None,
                "partial_error": push_error,
            }
            context_manager.clear_draft()
        else:
            push_status.update(label="Push failed — no stories created", state="error")
            st.session_state.push_result = {
                "ok":    False,
                "error": push_error or "No stories were created.",
            }

    st.rerun()


def _render_push_result() -> None:
    result = st.session_state.push_result
    if not result:
        return

    stories = result.get("stories", [])
    skipped = result.get("skipped", [])

    def _story_line(s: dict) -> str:
        if s.get("url") and s.get("ref"):
            return f"- [#{s['ref']} {s['title']}]({s['url']})"
        return f"- Story #{s['story_id']}: **{s['title']}**"

    story_lines   = "\n".join(_story_line(s) for s in stories)
    skipped_lines = "\n".join(f"- {t} _(already exists — skipped)_" for t in skipped)

    if result["ok"] and not result.get("partial"):
        count = len(stories)
        noun  = "story" if count == 1 else "stories"
        epic  = result.get("epic")
        if epic:
            epic_line = (
                f"Epic #{epic['epic_id']}: **{epic['title']}** created.\n\n"
                if epic.get("created")
                else f"Linked to existing Epic #{epic['epic_id']}: **{epic['title']}**.\n\n"
            )
        else:
            epic_line = ""
        body = (
            f"{epic_line}"
            f"{count} {noun} created in Taiga · "
            f"Gherkin locked to `contextspec/functional-spec.md`.\n\n"
            f"{story_lines}"
        )
        if skipped_lines:
            body += f"\n\n**Skipped (duplicates):**\n{skipped_lines}"
        st.success(body)

    elif result["ok"] and result.get("partial"):
        body = (
            f"{len(stories)} pushed, then stopped — {result['partial_error']}\n\n"
            f"{story_lines}"
        )
        if skipped_lines:
            body += f"\n\n**Skipped (duplicates):**\n{skipped_lines}"
        st.warning(body)

    else:
        st.error(f"Push failed: {result['error']}")

    if result["ok"] and st.button("New Epic", key="new_epic_btn", width="stretch"):
        _reset_state()
        st.rerun()


# ── Panel: Load from Taiga ────────────────────────────────────────────────────

def _fetch_epics_into_cache() -> list[dict]:
    """Fetch all project epics plus their detail, update session state, return the list."""
    fetched = taiga_adapter.get_epics()
    cache: dict = {}
    for epic in fetched:
        try:
            cache[epic["id"]] = taiga_adapter.get_epic(epic["id"])
        except TaigaAPIError:
            cache[epic["id"]] = epic
    st.session_state["epics_list"]         = fetched
    st.session_state["epics_detail_cache"] = cache
    st.session_state.pop("epics_load_error", None)
    return fetched


def _panel_load_epic() -> None:
    signed_in      = taiga_adapter.is_configured()
    project_chosen = bool(taiga_adapter.TAIGA_PROJECT_ID)

    if not signed_in:
        st.warning("Not signed in to Taiga — use the **⇄** button in the sidebar to sign in.")
        return
    if not project_chosen:
        st.warning("No Taiga project selected — choose one in the sidebar under **Project**.")
        return

    epics: list[dict] | None = st.session_state.get("epics_list")

    if epics is None:
        # Auto-fetch on tab switch — no button click required
        if not st.session_state.get("epics_load_error"):
            try:
                with st.spinner("Loading Epics…"):
                    epics = _fetch_epics_into_cache()
            except TaigaAPIError as exc:
                st.session_state["epics_load_error"] = str(exc)
        if st.session_state.get("epics_load_error"):
            st.error(st.session_state["epics_load_error"])
            if st.button("↻ Retry", key="browse_load_btn", width="stretch"):
                st.session_state.pop("epics_load_error", None)
                st.rerun()
            return

    if not epics:
        st.caption("No Epics found in this project.")
    else:
        st.divider()
        st.caption(f"{len(epics)} epic(s) found.")
        loaded_id    = st.session_state.get("_source_epic_id")
        detail_cache = st.session_state.get("epics_detail_cache", {})
        for i, epic in enumerate(epics):
            ref       = epic.get("ref", epic["id"])
            full      = detail_cache.get(epic["id"], epic)
            desc      = (full.get("description") or "").strip()
            is_loaded = (loaded_id == epic["id"])
            label     = f"#{ref} · {epic['subject']}" + (" — selected" if is_loaded else "")

            with st.expander(label, expanded=is_loaded):
                if is_loaded:
                    st.success("This epic is currently selected. Proceed to Step 2 below.")
                if desc:
                    st.markdown(desc)
                else:
                    st.caption("No description.")
                if is_loaded:
                    st.button("Use this Epic", key=f"browse_use_{i}", disabled=True, width="stretch")
                else:
                    if st.button("Use this Epic", key=f"browse_use_{i}", type="primary", width="stretch"):
                        had_stories = bool(
                            st.session_state.get("nl_draft") or st.session_state.get("compiled_stories")
                        )
                        if had_stories:
                            _clear_story_progress()
                        epic_id = epic["id"]
                        cache: dict = st.session_state.setdefault("epics_detail_cache", {})
                        if epic_id not in cache:
                            try:
                                cache[epic_id] = taiga_adapter.get_epic(epic_id)
                            except TaigaAPIError:
                                cache[epic_id] = epic
                        full = cache[epic_id]
                        st.session_state["_pending_epic_data"] = {
                            "subject":     full.get("subject", epic["subject"]),
                            "description": full.get("description", "") or "",
                            "id":          str(epic_id),
                        }
                        st.session_state["_epic_loaded_by"] = "load"
                        if had_stories:
                            st.session_state["_notify_phase1"] = "Epic changed — previous stories cleared."
                        st.rerun()

    col_refresh, _ = st.columns([1, 3])
    with col_refresh:
        if st.button("↻ Refresh", key="browse_load_btn", width="stretch"):
            try:
                with st.spinner("Refreshing Epics…"):
                    _fetch_epics_into_cache()
            except TaigaAPIError as exc:
                st.session_state["epics_load_error"] = str(exc)
            st.rerun()


# ── Panel: AI Suggests ────────────────────────────────────────────────────────

def _panel_suggest_epics() -> None:
    if not taiga_adapter.is_configured():
        st.info("Sign in to Taiga using the ⇄ button in the sidebar to use AI Epic suggestions.")
        return
    if not taiga_adapter.TAIGA_PROJECT_ID:
        st.info("Select a Taiga project in the sidebar before generating Epic suggestions.")
        return

    project_concept = context_manager.get_project_concept()
    if not project_concept:
        st.warning(
            "No Project Concept found in the Memory Bank — "
            "add one under **## Project Concept** in the sidebar before generating."
        )
        return

    hint = st.text_area(
        "Focus / constraints (optional)",
        placeholder=(
            "e.g. 'Focus on MVP features only', "
            "'Exclude admin panel', 'B2C mobile-first'..."
        ),
        height=70,
        key="suggest_epics_hint",
    )

    has_suggestions = bool(st.session_state.get("epics_suggested"))
    _trigger_suggest = False
    col_btn, col_clear = st.columns([2, 1])
    with col_btn:
        if st.button("Suggest Epics", type="primary", key="suggest_epics_btn", width="stretch"):
            if st.session_state.get("_epic_loaded_by") == "suggest":
                for k in ("_epic_loaded_by", "epic_subject_input", "epic_desc_input",
                          "_source_epic_id", "_selected_suggest_title", "_selected_suggest_idx"):
                    st.session_state.pop(k, None)
                _clear_story_progress()
            for k in list(st.session_state.keys()):
                if k.startswith(("suggest_title_", "suggest_desc_")):
                    del st.session_state[k]
            _trigger_suggest = True
    with col_clear:
        if st.button("Clear", key="suggest_epics_clear", disabled=not has_suggestions, width="stretch"):
            for k in list(st.session_state.keys()):
                if k.startswith(("suggest_title_", "suggest_desc_")):
                    del st.session_state[k]
            st.session_state["epics_suggested"]     = None
            st.session_state["suggest_epics_error"] = None
            if st.session_state.get("_epic_loaded_by") == "suggest":
                for k in ("_epic_loaded_by", "epic_subject_input", "epic_desc_input",
                          "_source_epic_id", "_selected_suggest_title", "_selected_suggest_idx"):
                    st.session_state.pop(k, None)
                _clear_story_progress()
                st.session_state["_notify_phase1"] = "Suggestions cleared — epic and progress reset."
            st.rerun()

    if _trigger_suggest:
        _generation_overlay()
        _run_suggest_epics(project_concept, hint)
        st.rerun()

    if st.session_state.get("suggest_epics_error"):
        st.error(st.session_state["suggest_epics_error"])

    suggestions: list[dict] | None = st.session_state.get("epics_suggested")
    if not suggestions:
        return

    st.divider()
    st.caption(f"{len(suggestions)} epic suggestions.")

    selected_idx = (
        st.session_state.get("_selected_suggest_idx")
        if st.session_state.get("_epic_loaded_by") == "suggest"
        else None
    )

    for i, epic in enumerate(suggestions):
        is_selected = (selected_idx == i)
        if is_selected:
            label = st.session_state.get("_selected_suggest_title", epic["title"]) + " — selected"
        else:
            label = st.session_state.get(f"suggest_title_{i}", epic["title"])

        with st.expander(label, expanded=is_selected):
            if is_selected:
                st.success("This epic is currently selected. Proceed to Step 2 below.")
                if epic.get("description"):
                    st.write(epic["description"])
                st.button("Use this Epic", key=f"use_epic_{i}", disabled=True, width="stretch")
            else:
                st.text_input(
                    "Title", value=epic["title"], key=f"suggest_title_{i}",
                    label_visibility="collapsed",
                )
                st.text_area(
                    "Description", value=epic.get("description", ""),
                    key=f"suggest_desc_{i}", height=100, label_visibility="collapsed",
                )
                if st.button("Use this Epic", key=f"use_epic_{i}", type="primary", width="stretch"):
                    had_stories = bool(
                        st.session_state.get("nl_draft") or st.session_state.get("compiled_stories")
                    )
                    if had_stories:
                        _clear_story_progress()
                    title_val = (st.session_state.get(f"suggest_title_{i}") or epic["title"]).strip()
                    desc_val  = (st.session_state.get(f"suggest_desc_{i}")  or "").strip()
                    st.session_state["_pending_epic_data"] = {
                        "subject":     title_val,
                        "description": desc_val,
                    }
                    st.session_state["_epic_loaded_by"]        = "suggest"
                    st.session_state["_selected_suggest_idx"]  = i
                    st.session_state["_selected_suggest_title"] = title_val
                    if had_stories:
                        st.session_state["_notify_phase1"] = "Epic changed — previous stories cleared."
                    st.rerun()


def _run_suggest_epics(project_concept: str, hint: str) -> None:
    with st.status("Generating Epic suggestions...", expanded=True) as status:
        try:
            status.write("Connecting to AI...")
            result = ai_engine.suggest_epics(project_concept, hint=hint)
            st.session_state["epics_suggested"] = [
                {"title": e.title, "description": e.description}
                for e in result.epics
            ]
            st.session_state["suggest_epics_error"] = None
            status.update(
                label=f"{len(result.epics)} Epics suggested",
                state="complete",
            )
        except Exception as exc:
            st.session_state["suggest_epics_error"] = _classify_ai_error(exc)
            status.update(label="Suggestion failed", state="error")


def _parse_epic_id() -> int | None:
    raw = st.session_state.get("epic_id_input", "").strip()
    try:
        return int(raw) if raw else None
    except ValueError:
        return None


def _clear_gherkin_editors() -> None:
    for key in [k for k in st.session_state if k.startswith(
        ("gherkin_edit_", "rename_mode_", "rename_input_")
    )]:
        del st.session_state[key]


def _reset_state() -> None:
    _clear_gherkin_editors()
    context_manager.clear_draft()
    for k in list(st.session_state.keys()):
        if k.startswith(("suggest_title_", "suggest_desc_")):
            del st.session_state[k]
    for key in (
        # Epic inputs + non-widget backups
        "epic_subject_input", "epic_desc_input", "epic_id_input",
        "_epic_subject_bak", "_epic_desc_bak",
        "_source_epic_id", "_epic_loaded_by", "_selected_suggest_title",
        "_selected_suggest_idx",
        # Load-panel cache
        "epics_list", "epics_detail_cache", "epics_load_error",
        # Suggest-panel cache
        "epics_suggested", "suggest_epics_error",
        # Downstream — Steps 2 & 3
        "nl_draft", "nl_editor", "story_subject",
        "compiled_stories", "push_done", "push_result",
        "ai_error", "compile_error",
        # Navigation / legacy keys (start_mode intentionally preserved — keeps active tab)
        "_committed_mode", "_mode_change_pending", "_desired_mode",
    ):
        st.session_state.pop(key, None)
