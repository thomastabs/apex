"""
components/phase1.py
Phase 1 — Mob Elaboration: Discovery & Requirements.

Three-step pipeline:
  GENERATE     → ai_engine.generate_nl_stories()     → NL draft for human cross-examination
  COMPILE      → ai_engine.compile_gherkin_stories()  → formal Gherkin per story, human review
  CONFIRM PUSH → taiga_adapter.create_story() × N     → Taiga + context lock

Changes vs initial version:
  - Epic linking handled inside taiga_adapter.create_story() — no separate call needed
  - Stories tagged with ["bolt", size] and moved to "Ready for Discovery" status on push
  - Duplicate detection: existing stories in the epic are skipped (not re-created)
  - Gherkin validation gates the push button (each story needs ≥1 Scenario block)
  - Success message shows clickable Taiga links (story ref → web URL)
  - st.status() replaces spinners for generation and compilation steps
  - Draft state (NL + compiled) is persisted to contextspec/.bolt-draft.json so it
    survives a page refresh or Streamlit server restart

Session state keys are documented in _STATE_DEFAULTS.
"""

import re
import time

import streamlit as st

import ai_engine
import context_manager
import taiga_adapter
from taiga_adapter import TaigaAPIError

_STATE_DEFAULTS: dict = {
    "nl_draft":         "",
    "nl_editor":        "",
    "story_subject":    "",
    "compiled_stories": None,
    "push_done":        False,
    "push_result":      None,
    "ai_error":         None,
    "compile_error":    None,
    "_draft_loaded":    False,  # guards draft restoration to once per session
}


def render_phase1() -> None:
    _init_state()

    st.header("Phase 1 · Requirements")
    st.caption("Mob Elaboration — transform an Epic into formal Gherkin Acceptance Criteria")
    try:
        st.image("requirements.svg", use_container_width=True)
    except Exception:
        pass
    st.divider()

    _section_epic()
    st.divider()
    _section_generate()
    st.divider()

    if st.session_state.nl_draft:
        _section_review()
        st.divider()
        if not st.session_state.compiled_stories:
            _section_compile()
        else:
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


# ── Section: Epic input ───────────────────────────────────────────────────────

def _apply_epic_selection() -> None:
    """on_change callback — stages the selected epic for application on next render."""
    idx: int = st.session_state.get("epic_selectbox_idx", 0)
    epics: list[dict] = st.session_state.get("epics_list") or []
    if idx > 0 and epics:
        chosen  = epics[idx - 1]
        epic_id = chosen["id"]
        cache: dict = st.session_state.setdefault("epics_detail_cache", {})
        if epic_id not in cache:
            try:
                cache[epic_id] = taiga_adapter.get_epic(epic_id)
            except TaigaAPIError:
                cache[epic_id] = chosen
        full = cache[epic_id]
        st.session_state["_pending_epic_data"] = {
            "subject":     full.get("subject", chosen.get("subject", "")),
            "description": full.get("description", "") or "",
            "id":          str(epic_id),
        }


def _apply_pending_epic() -> None:
    """Apply staged epic data BEFORE any widget with those keys is rendered."""
    pending: dict | None = st.session_state.pop("_pending_epic_data", None)
    if not pending:
        return
    if "subject" in pending:
        st.session_state["epic_subject_input"] = pending["subject"]
    if "description" in pending:
        st.session_state["epic_desc_input"] = pending["description"]
    if "id" in pending:
        st.session_state["epic_id_input"] = pending["id"]


def _section_epic() -> None:
    if msg := st.session_state.pop("_notify_phase1", None):
        st.toast(msg)
    _apply_pending_epic()
    st.markdown("##### EPIC")
    _epic_browser()

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


def _epic_browser() -> None:
    is_open: bool = st.session_state.get("epics_visible", False)

    if st.button("Browse Epics", key="browse_epics_btn"):
        if st.session_state.get("epics_list") is None:
            try:
                with st.spinner("Loading Epics..."):
                    epics = taiga_adapter.get_epics()
                st.session_state["epics_list"] = epics
                st.session_state.pop("epics_load_error", None)
            except TaigaAPIError as exc:
                st.session_state["epics_load_error"] = str(exc)
            st.session_state["epics_visible"] = True
        else:
            st.session_state["epics_visible"] = not is_open
        st.rerun()

    if not st.session_state.get("epics_visible"):
        return

    if st.session_state.get("epics_load_error"):
        st.error(st.session_state["epics_load_error"])
        return

    epics: list[dict] | None = st.session_state.get("epics_list")
    if epics is None:
        return
    if not epics:
        st.caption("No Epics found in this project.")
        return

    labels = ["— select an existing Epic —"] + [
        f"#{e.get('ref', e['id'])} · {e['subject']}" for e in epics
    ]
    st.selectbox(
        "Existing Epics",
        options=range(len(labels)),
        format_func=lambda i: labels[i],
        key="epic_selectbox_idx",
        on_change=_apply_epic_selection,
        label_visibility="collapsed",
    )


def _delete_epic_action(epic: dict) -> None:
    """Delete-with-confirm control for a single epic."""
    epic_id = epic["id"]
    pending_key = "_del_epic_pending"

    if st.session_state.get(pending_key) == epic_id:
        st.warning(f"Permanently delete **\"{epic['subject']}\"** and all its stories from Taiga?")
        col_yes, col_no = st.columns(2)
        with col_yes:
            if st.button("Delete", type="primary", key="del_epic_confirm_btn", use_container_width=True):
                try:
                    taiga_adapter.delete_epic(epic_id)
                    st.session_state.pop(pending_key, None)
                    # Phase-1 epic picker caches
                    for k in ("epics_list", "epic_selectbox_idx", "_pending_epic_data",
                              "_taiga_stories", "epics_visible", "epics_load_error",
                              "epics_detail_cache"):
                        st.session_state.pop(k, None)
                    # Sidebar board caches — keep the sidebar consistent
                    st.session_state.pop("board_epics", None)
                    st.session_state.pop(f"board_stories_{epic_id}", None)
                    st.session_state.pop(f"board_exp_{epic_id}", None)
                    st.session_state.pop("all_stories", None)
                    st.session_state["_notify_phase1"] = "Epic deleted from Taiga."
                    st.rerun()
                except TaigaAPIError as exc:
                    st.error(str(exc))
        with col_no:
            if st.button("Cancel", key="del_epic_cancel_btn", use_container_width=True):
                st.session_state.pop(pending_key, None)
                st.rerun()
    else:
        if st.button("Delete epic from Taiga", key="del_epic_btn"):
            st.session_state[pending_key] = epic_id
            st.rerun()


# ── Section: Generate ─────────────────────────────────────────────────────────

def _section_generate() -> None:
    st.markdown("##### GENERATE")

    subject     = st.session_state.get("epic_subject_input", "").strip()
    description = st.session_state.get("epic_desc_input", "").strip()
    hint        = st.session_state.get("ai_hint_input", "").strip()

    project_concept = context_manager.get_project_concept()
    can_generate = bool(subject and description and project_concept)

    if not project_concept:
        st.warning(
            "No Project Concept found in the Memory Bank — "
            "add one under **## Project Concept** in the sidebar before generating."
        )

    if st.button(
        "Generate stories",
        type="primary",
        disabled=not can_generate,
        key="generate_btn",
    ):
        _run_generation(subject, description, hint, project_concept)

    if not can_generate:
        if project_concept:
            st.caption("Epic title and description are required.")
        elif subject and description:
            st.caption("Project Concept is required (see warning above).")

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


# ── Section: Review & Edit (Interactive Bridge) ───────────────────────────────

def _section_review() -> None:
    st.markdown("##### REVIEW AND EDIT")
    st.caption(
        "Review the Natural Language draft. Edit freely — "
        "this will be compiled to formal Gherkin on approval."
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
    st.markdown("##### APPROVE AND COMPILE")
    st.caption("Approve the NL draft to compile it into formal Gherkin for review.")

    col_compile, col_reset = st.columns([2, 1])
    with col_compile:
        compile_clicked = st.button("Compile Gherkin", type="primary", key="compile_btn")
    with col_reset:
        if st.button("Reset", key="reset_btn"):
            _reset_state()
            st.rerun()

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


# ── Section: Gherkin Review + Confirm Push ────────────────────────────────────

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
    st.markdown("##### COMPILED GHERKIN")
    st.caption(
        "Review the formal Gherkin below. "
        "Each story will be created as a separate entity in Taiga."
    )

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
        if st.button("+ Add Story", key="add_story_btn"):
            _add_story()
            st.rerun()

    st.divider()
    st.markdown("##### CONFIRM PUSH")

    validation_errors = _validate_compiled_stories(compiled) if not push_done else []
    if validation_errors:
        for err in validation_errors:
            st.caption(f"· {err}")

    col_push, col_back = st.columns([2, 1])
    with col_push:
        push_clicked = st.button(
            "Confirm Push to Taiga",
            type="primary",
            disabled=st.session_state.push_done or bool(validation_errors),
            key="push_btn",
        )
    with col_back:
        if st.button("Edit Draft", key="edit_btn", disabled=st.session_state.push_done):
            _clear_gherkin_editors()
            st.session_state.compiled_stories = None
            st.session_state.compile_error    = None
            st.rerun()

    if push_clicked:
        _run_push()

    _render_push_result()


def _run_push() -> None:
    compiled:    list[dict] = st.session_state.compiled_stories
    epic_id_val: int | None = _parse_epic_id()

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
                    tags=["bolt", size],
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

    story_lines  = "\n".join(_story_line(s) for s in stories)
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

    if result["ok"] and st.button("New Epic", key="new_epic_btn"):
        _reset_state()
        st.rerun()


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
    for key in (
        "nl_draft", "nl_editor", "story_subject",
        "compiled_stories", "push_done", "push_result",
        "ai_error", "compile_error",
        "epic_selectbox_idx",
        "epic_subject_input", "epic_desc_input", "epic_id_input",
    ):
        st.session_state.pop(key, None)
