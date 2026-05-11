"""phase1.py — Phase 1 (Requirements) state: NL draft → Gherkin → Taiga push."""

import asyncio
import logging
import re

import reflex as rx

from src import ai_engine, context_manager, taiga_adapter
from state.project import ProjectState

_logger = logging.getLogger("apex.state.phase1")


def validate_stories(compiled: list[dict], gherkin_edits: list[str]) -> list[str]:
    """Return validation error strings; push is blocked until the list is empty."""
    errors: list[str] = []
    for i, item in enumerate(compiled):
        title = item.get("title", "").strip()
        gherkin = (gherkin_edits[i] if i < len(gherkin_edits) else "") or item.get("gherkin", "")
        label = f'"{title}"' if title else f"Story {i + 1}"
        if not title:
            errors.append(f"Story {i + 1} has no title.")
        if not re.search(r"^\s*Feature:", gherkin, re.MULTILINE):
            errors.append(f"{label} is missing a Feature: header.")
        if not re.search(r"^\s*Scenario", gherkin, re.MULTILINE):
            errors.append(f"{label} is missing a Scenario block.")
    return errors


class Phase1State(ProjectState):
    # ── Core workflow vars ────────────────────────────────────────────────────
    nl_draft: str = ""
    nl_editor: str = ""
    story_subject: str = ""
    compiled_stories: list[dict] = []
    gherkin_edits: list[str] = []     # indexed list replaces gherkin_edit_{i}
    push_done: bool = False
    push_result: dict = {}
    ai_error: str = ""
    compile_error: str = ""
    push_error: str = ""

    # ── Loading states ────────────────────────────────────────────────────────
    generating: bool = False
    compiling: bool = False
    pushing: bool = False
    story_count_progress: int = 0

    # ── Step 1 inputs ─────────────────────────────────────────────────────────
    start_mode: str = "new"           # "new" | "load" | "suggest"
    epic_subject_input: str = ""
    epic_id_input: str = ""
    epic_desc_input: str = ""
    ai_hint_input: str = ""

    # ── Load panel ────────────────────────────────────────────────────────────
    epics_list: list[dict] = []
    epics_loading: bool = False
    epics_load_error: str = ""

    # ── Suggest panel ─────────────────────────────────────────────────────────
    epics_suggested: list[dict] = []
    suggest_loading: bool = False
    suggest_error: str = ""

    # ── Dialogs ───────────────────────────────────────────────────────────────
    discard_dialog_open: bool = False
    pending_mode_switch: str = ""

    # ── Draft guard ───────────────────────────────────────────────────────────
    draft_restored: bool = False

    # ── Rename ───────────────────────────────────────────────────────────────
    rename_index: int = -1
    rename_value: str = ""

    # ── Push result ───────────────────────────────────────────────────────────
    push_story_urls: list[str] = []

    # ─────────────────────────────────────────────────────────────────────────
    # Draft helpers
    # ─────────────────────────────────────────────────────────────────────────

    def _save_draft(self) -> None:
        context_manager.save_draft({
            "epic_subject":     self.epic_subject_input,
            "epic_id":          self.epic_id_input,
            "nl_draft":         self.nl_draft,
            "nl_editor":        self.nl_editor,
            "compiled_stories": self.compiled_stories,
            "gherkin_edits":    self.gherkin_edits,
        })

    @rx.event
    def restore_draft(self):
        if self.draft_restored:
            return
        self.draft_restored = True
        draft = context_manager.load_draft()
        if not draft or self.nl_draft:
            return
        self.epic_subject_input = draft.get("epic_subject", "")
        self.epic_id_input = draft.get("epic_id", "")
        nl = draft.get("nl_draft", "")
        if nl:
            self.nl_draft = nl
            self.nl_editor = draft.get("nl_editor", nl)
        compiled = draft.get("compiled_stories") or []
        if compiled:
            self.compiled_stories = compiled
            saved_edits = draft.get("gherkin_edits", [])
            self.gherkin_edits = [
                (saved_edits[i] if i < len(saved_edits) else "")
                or item.get("gherkin", "")
                for i, item in enumerate(compiled)
            ]

    @rx.event
    def set_nl_editor(self, value: str):
        self.nl_editor = value
        self._save_draft()

    @rx.event
    def set_gherkin_edit(self, index: int, value: str):
        edits = list(self.gherkin_edits)
        if index < len(edits):
            edits[index] = value
        self.gherkin_edits = edits
        self._save_draft()

    # ─────────────────────────────────────────────────────────────────────────
    # Mode switching (tab guard)
    # ─────────────────────────────────────────────────────────────────────────

    @rx.event
    def request_mode_switch(self, mode: str):
        has_progress = bool(self.nl_draft or self.compiled_stories or self.epic_subject_input)
        if has_progress and mode != self.start_mode:
            self.pending_mode_switch = mode
            self.discard_dialog_open = True
        else:
            self.start_mode = mode

    @rx.event
    def set_discard_dialog_open(self, value: bool):
        self.discard_dialog_open = value

    @rx.event
    def confirm_mode_switch(self):
        self.start_mode = self.pending_mode_switch
        self.pending_mode_switch = ""
        self.discard_dialog_open = False
        self._reset_story_progress()

    @rx.event
    def cancel_mode_switch(self):
        self.pending_mode_switch = ""
        self.discard_dialog_open = False

    def _reset_story_progress(self):
        self.nl_draft = ""
        self.nl_editor = ""
        self.story_subject = ""
        self.compiled_stories = []
        self.gherkin_edits = []
        self.push_done = False
        self.push_result = {}
        self.ai_error = ""
        self.compile_error = ""
        self.push_error = ""
        context_manager.clear_draft()

    @rx.event
    def reset_all(self):
        self._reset_story_progress()
        self.epic_subject_input = ""
        self.epic_id_input = ""
        self.epic_desc_input = ""
        self.ai_hint_input = ""

    # ─────────────────────────────────────────────────────────────────────────
    # Step 1 inputs
    # ─────────────────────────────────────────────────────────────────────────

    @rx.event
    def set_epic_subject(self, value: str):
        self.epic_subject_input = value

    @rx.event
    def set_epic_desc(self, value: str):
        self.epic_desc_input = value

    @rx.event
    def set_epic_id(self, value: str):
        self.epic_id_input = value

    @rx.event
    def set_ai_hint(self, value: str):
        self.ai_hint_input = value

    # ─────────────────────────────────────────────────────────────────────────
    # Load panel
    # ─────────────────────────────────────────────────────────────────────────

    @rx.event
    async def load_epics(self):
        self._sync_token()
        self.epics_loading = True
        self.epics_load_error = ""
        yield
        try:
            self.epics_list = taiga_adapter.get_epics()
        except taiga_adapter.TaigaAPIError as exc:
            self.epics_load_error = str(exc)
        finally:
            self.epics_loading = False

    @rx.event
    def select_epic(self, epic: dict):
        self.epic_subject_input = epic.get("subject", "")
        self.epic_id_input = str(epic.get("id", ""))
        self.epic_desc_input = epic.get("description", "")

    @rx.event
    async def delete_epic_from_load(self, epic_id: int):
        self._sync_token()
        try:
            taiga_adapter.delete_epic_with_stories(epic_id)
            yield Phase1State.load_epics
        except taiga_adapter.TaigaAPIError as exc:
            self.epics_load_error = str(exc)

    # ─────────────────────────────────────────────────────────────────────────
    # Suggest panel
    # ─────────────────────────────────────────────────────────────────────────

    @rx.event(background=True)
    async def run_suggest_epics(self):
        async with self:
            self.suggest_loading = True
            self.suggest_error = ""
        try:
            hint = self.ai_hint_input
            concept = context_manager.get_project_concept()
            result = await asyncio.to_thread(ai_engine.suggest_epics, concept, hint)
            async with self:
                self.epics_suggested = [
                    {"title": e.title, "description": e.description}
                    for e in result.epics
                ]
        except Exception as exc:
            async with self:
                self.suggest_error = str(exc)
        finally:
            async with self:
                self.suggest_loading = False

    @rx.event
    def select_suggested_epic(self, epic: dict):
        self.epic_subject_input = epic.get("title", "")
        self.epic_desc_input = epic.get("description", "")
        self.epic_id_input = ""

    # ─────────────────────────────────────────────────────────────────────────
    # Step 2: Generate NL
    # ─────────────────────────────────────────────────────────────────────────

    @rx.event(background=True)
    async def run_generate(self):
        async with self:
            self.generating = True
            self.ai_error = ""
            self.story_count_progress = 0

        try:
            subject = self.epic_subject_input.strip()
            description = self.epic_desc_input.strip()
            hint = self.ai_hint_input.strip()
            concept = context_manager.get_project_concept()

            count_holder = [0]

            def _on_story(n: int) -> None:
                count_holder[0] = n

            story_list = await asyncio.to_thread(
                ai_engine.generate_nl_stories,
                subject, description,
                hint=hint,
                project_concept=concept,
                on_story=_on_story,
            )
            nl_text = ai_engine.format_nl_draft(story_list)

            async with self:
                self.nl_draft = nl_text
                self.nl_editor = nl_text
                self.story_subject = subject
                self.push_done = False
                self.push_result = {}
                self._save_draft()

        except Exception as exc:
            async with self:
                self.ai_error = ai_engine.classify_error(exc) if hasattr(ai_engine, "classify_error") else str(exc)
        finally:
            async with self:
                self.generating = False

    # ─────────────────────────────────────────────────────────────────────────
    # Step 4: Compile to Gherkin
    # ─────────────────────────────────────────────────────────────────────────

    @rx.event(background=True)
    async def run_compile(self):
        async with self:
            self.compiling = True
            self.compile_error = ""

        try:
            nl_text = self.nl_editor

            gherkin_list = await asyncio.to_thread(
                ai_engine.compile_gherkin_stories, nl_text
            )
            compiled = [
                {
                    "title":   story.title,
                    "size":    story.size,
                    "gherkin": ai_engine.format_gherkin_story(story),
                }
                for story in gherkin_list.stories
            ]
            edits = [item["gherkin"] for item in compiled]

            async with self:
                self.compiled_stories = compiled
                self.gherkin_edits = edits
                self._save_draft()

        except Exception as exc:
            async with self:
                self.compile_error = str(exc)
        finally:
            async with self:
                self.compiling = False

    # ─────────────────────────────────────────────────────────────────────────
    # Step 5: Gherkin story management
    # ─────────────────────────────────────────────────────────────────────────

    @rx.event
    def set_story_title(self, index: int, value: str):
        stories = list(self.compiled_stories)
        if index < len(stories):
            stories[index] = {**stories[index], "title": value}
        self.compiled_stories = stories

    @rx.event
    def cycle_story_size(self, index: int):
        _sizes = ["XS", "S", "M", "L", "XL"]
        stories = list(self.compiled_stories)
        if index < len(stories):
            cur = stories[index].get("size", "M")
            nxt = _sizes[(_sizes.index(cur) + 1) % len(_sizes)] if cur in _sizes else "M"
            stories[index] = {**stories[index], "size": nxt}
        self.compiled_stories = stories

    @rx.event
    def delete_story(self, index: int):
        self.compiled_stories = [s for i, s in enumerate(self.compiled_stories) if i != index]
        self.gherkin_edits = [g for i, g in enumerate(self.gherkin_edits) if i != index]
        self._save_draft()

    @rx.event
    def add_story(self):
        self.compiled_stories = self.compiled_stories + [{"title": "New Story", "size": "M", "gherkin": "Feature: \n\n  Scenario: \n    Given \n    When \n    Then "}]
        self.gherkin_edits = self.gherkin_edits + ["Feature: \n\n  Scenario: \n    Given \n    When \n    Then "]

    @rx.event
    def back_to_nl_edit(self):
        self.compiled_stories = []
        self.gherkin_edits = []
        self.compile_error = ""

    # ─────────────────────────────────────────────────────────────────────────
    # Step 6: Push to Taiga
    # ─────────────────────────────────────────────────────────────────────────

    @rx.event(background=True)
    async def run_push(self):
        async with self:
            self.pushing = True
            self.push_error = ""

        try:
            self._sync_token()
            subject = self.epic_subject_input.strip()
            description = self.epic_desc_input.strip()
            epic_id_str = self.epic_id_input.strip()
            compiled = self.compiled_stories
            gherkin_edits = self.gherkin_edits

            # Resolve or create epic
            if epic_id_str:
                epic_id = int(epic_id_str)
                epic = taiga_adapter.get_epic(epic_id)
            else:
                epic = taiga_adapter.create_epic(subject, description)
                epic_id = epic["id"]

            context_manager.init_context()
            status_id = taiga_adapter.find_status_id("Ready for Discovery")
            urls = []

            for i, item in enumerate(compiled):
                title = item.get("title", "").strip()
                gherkin = (gherkin_edits[i] if i < len(gherkin_edits) else "") or item.get("gherkin", "")
                bold_gherkin = ai_engine.bold_gherkin_keywords(gherkin)

                story = taiga_adapter.create_story(
                    title,
                    bold_gherkin,
                    epic_id=epic_id,
                    tags=["apex", "gherkin"],
                    backlog_order=i,
                )
                if status_id:
                    taiga_adapter.update_story_status(story["id"], status_id, story["version"])

                story_obj = taiga_adapter.get_story(story["id"])
                context_manager.append_gherkin(
                    story["id"], title, gherkin,
                    epic_id=epic_id, epic_title=epic.get("subject", ""),
                )
                url = taiga_adapter.get_story_url(story_obj.get("ref"))
                if url:
                    urls.append(url)

            async with self:
                self.push_done = True
                self.push_story_urls = urls
                self.push_result = {"ok": True, "count": len(compiled)}
                context_manager.clear_draft()

        except Exception as exc:
            async with self:
                self.push_error = str(exc)
        finally:
            async with self:
                self.pushing = False

    @rx.event
    def start_new_epic(self):
        self._reset_story_progress()
        self.epic_subject_input = ""
        self.epic_id_input = ""
        self.epic_desc_input = ""
        self.ai_hint_input = ""

    # ─────────────────────────────────────────────────────────────────────────
    # Computed vars
    # ─────────────────────────────────────────────────────────────────────────

    @rx.var
    def stories_with_edits(self) -> list[dict]:
        """compiled_stories merged with their gherkin edits and list index.

        rx.foreach only passes one argument, so we embed index and the live
        gherkin edit into each story dict so the render function can access them.
        """
        result = []
        for i, story in enumerate(self.compiled_stories):
            edit = (self.gherkin_edits[i] if i < len(self.gherkin_edits) else "") or story.get("gherkin", "")
            result.append({**story, "gherkin_edit": edit, "index": i})
        return result

    @rx.var
    def validation_errors(self) -> list[str]:
        return validate_stories(self.compiled_stories, self.gherkin_edits)

    @rx.var
    def has_nl_draft(self) -> bool:
        return bool(self.nl_draft)

    @rx.var
    def has_compiled(self) -> bool:
        return bool(self.compiled_stories)

    @rx.var
    def can_generate(self) -> bool:
        return bool(self.epic_subject_input.strip()) and self.is_authenticated and self.has_project

    @rx.var
    def can_push(self) -> bool:
        return self.has_compiled and not self.push_done and len(self.validation_errors) == 0
