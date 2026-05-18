"""Phase 2 state — Design Workspace (Epic-level Macro).

Stage A: One-time tech stack definition (Gate 0, Tech Lead).
Stage B: Per-epic design bundle — wireframes, user flow, component tree, OpenAPI spec
         (Gate 1: Design Lead, Gate 2: Tech Lead).
"""

import asyncio
import html as _html
import logging

import reflex as rx

from src import ai_engine, context_manager, taiga_adapter
from state.project import ProjectState
from state.auth import AuthState

_logger = logging.getLogger("apex.phase2")


class Phase2State(ProjectState):
    # ── Stage A — Tech Stack (project-level, one-time) ──────────────────────
    existing_tech_stack: str = ""
    stack_alternatives: list[dict] = []
    selected_alternative_index: int = -1
    tech_stack_edit: str = ""
    stack_hint: str = ""
    stack_suggesting: bool = False
    stack_error: str = ""
    gate0_approved: bool = False

    # ── Stage B — Epic list ──────────────────────────────────────────────────
    epic_list: list[dict] = []
    epics_loading: bool = False
    epics_load_error: str = ""

    # ── Stage B — Selected epic ──────────────────────────────────────────────
    selected_epic_id: int = 0
    selected_epic_title: str = ""
    stories_in_epic: list[dict] = []

    # ── Stage B — Design outputs ─────────────────────────────────────────────
    wireframes_draft: str = ""
    wireframes_edit: str = ""
    user_flow_draft: str = ""
    user_flow_edit: str = ""
    component_tree_draft: str = ""
    component_tree_edit: str = ""
    tech_spec_draft: str = ""
    tech_spec_edit: str = ""

    # ── Gates ────────────────────────────────────────────────────────────────
    gate1_approved: bool = False
    gate2_approved: bool = False

    # ── Progress / errors ────────────────────────────────────────────────────
    generating: bool = False
    saving: bool = False
    generate_error: str = ""
    save_error: str = ""
    generation_log: list[str] = []

    # ── Draft guard ──────────────────────────────────────────────────────────
    draft_restored: bool = False

    # ── Stage A discard dialog ────────────────────────────────────────────────
    stage_a_discard_dialog_open: bool = False
    _stage_a_pending_action: str = ""

    # ── Computed vars ────────────────────────────────────────────────────────

    @rx.var
    def tech_stack_confirmed(self) -> bool:
        return bool(self.existing_tech_stack) or self.gate0_approved

    @rx.var
    def selectable_epics(self) -> list[dict]:
        return self.epic_list

    @rx.var
    def user_flow_mermaid_html(self) -> str:
        return f'<div class="apex-mermaid">{self.user_flow_edit}</div>'

    @rx.var
    def component_tree_html(self) -> str:
        colors = ["#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#fb923c"]
        lines = self.component_tree_edit.split("\n") if self.component_tree_edit else []
        rows = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            spaces = len(line) - len(line.lstrip(" "))
            depth = spaces // 2
            color = colors[depth % len(colors)]
            indent_px = depth * 20
            icon = "◆" if depth == 0 else "└─"
            safe = _html.escape(stripped)
            rows.append(
                f'<div style="padding:2px 8px;line-height:1.65;display:flex;align-items:baseline">'
                f'<span style="display:inline-block;min-width:{indent_px}px;flex-shrink:0"></span>'
                f'<span style="color:{color};margin-right:5px;font-size:10px;flex-shrink:0">{icon}</span>'
                f'<span style="color:var(--gray-12);font-family:\'JetBrains Mono\',monospace;font-size:12px">{safe}</span>'
                f'</div>'
            )
        return (
            '<div style="padding:10px 6px;background:var(--gray-2);border-radius:6px;overflow-y:auto">'
            + "".join(rows)
            + "</div>"
            if rows else ""
        )

    @rx.var
    def epic_list_empty(self) -> bool:
        return not self.epics_loading and len(self.epic_list) == 0

    @rx.var
    def selected_epic_no_locked_stories(self) -> bool:
        """True when an epic is selected but none of its stories are gherkin_locked or design_locked."""
        if not self.stories_in_epic:
            return False
        return not any(
            s.get("phase_status") in ("gherkin_locked", "design_locked")
            for s in self.stories_in_epic
        )

    @rx.var
    def can_suggest_stack(self) -> bool:
        return self.is_authenticated and self.has_project and not self.gate0_approved

    @rx.var
    def can_approve_gate0(self) -> bool:
        return bool(self.tech_stack_edit) and not self.gate0_approved

    @rx.var
    def can_generate(self) -> bool:
        return (
            self.tech_stack_confirmed
            and self.is_authenticated
            and self.has_project
            and self.selected_epic_id > 0
        )

    @rx.var
    def can_approve_gate1(self) -> bool:
        return bool(self.wireframes_edit) and not self.gate1_approved

    @rx.var
    def can_approve_gate2(self) -> bool:
        return self.gate1_approved and bool(self.tech_spec_edit) and not self.gate2_approved

    @rx.var
    def can_save(self) -> bool:
        return self.gate1_approved and self.gate2_approved and not self.saving

    @rx.var
    def design_complete(self) -> bool:
        return bool(self.stories_in_epic) and all(
            s.get("phase_status") == "design_locked" for s in self.stories_in_epic
        )

    @rx.var
    def stage_a_has_unsaved(self) -> bool:
        return (
            not self.gate0_approved
            and (bool(self.stack_alternatives) or bool(self.tech_stack_edit))
        )

    # ── Event handlers ───────────────────────────────────────────────────────

    @rx.event
    def load_page_data(self):
        """Read existing tech stack from Memory Bank and load epic list."""
        if not self.is_authenticated or not self.has_project:
            return
        content = context_manager.read_context_file("memory-bank.md")
        import re
        match = re.search(
            r"^## Tech Stack[^\n]*\n(.*?)(?=^## |\Z)",
            content,
            re.MULTILINE | re.DOTALL,
        )
        if match:
            text = match.group(1).strip()
            if text and not text.startswith("<!--"):
                self.existing_tech_stack = text
                self.gate0_approved = True
        self.load_epics()

    @rx.event
    def load_epics(self):
        """Load epics from Taiga + cross-reference story index for phase status."""
        if not self.is_authenticated or not self.has_project:
            return
        self.epics_loading = True
        self.epics_load_error = ""
        try:
            self._sync_token()
            taiga_epics = taiga_adapter.get_epics()
            index = context_manager.get_story_index()

            result = []
            for epic in taiga_epics:
                eid = epic.get("id", 0)
                epic_stories = [e for e in index.values() if e.get("epic_id") == eid]
                all_locked = bool(epic_stories) and all(
                    s.get("phase_status") == "design_locked" for s in epic_stories
                )
                result.append({
                    "epic_id": eid,
                    "epic_title": epic.get("subject", f"Epic {eid}"),
                    "story_count": len(epic_stories),
                    "all_locked": all_locked,
                })
            self.epic_list = result
        except Exception as exc:
            self.epics_load_error = str(exc)
            _logger.warning("load_epics error: %s", exc)
        finally:
            self.epics_loading = False

    @rx.event(background=True)
    async def run_suggest_stack(self):
        """Ask AI for 3 architectural alternatives based on all gherkin_locked stories."""
        async with self:
            self.stack_suggesting = True
            self.stack_error = ""
            self.stack_alternatives = []

        _success = False
        try:
            index = context_manager.get_story_index()
            all_stories = []
            for entry in index.values():
                if entry.get("phase_status") not in ("gherkin_locked", "design_locked"):
                    continue
                story_id = entry.get("story_id")
                gherkin = context_manager.get_story_gherkin(story_id) if story_id else ""
                all_stories.append({
                    "epic_title": entry.get("epic_title", ""),
                    "title": entry.get("title", ""),
                    "gherkin": gherkin,
                })

            mb_context = context_manager.read_context_file("memory-bank.md")
            hint = self.stack_hint
            alternatives = await asyncio.to_thread(
                ai_engine.suggest_tech_stack, all_stories, mb_context, hint
            )
            async with self:
                self.stack_alternatives = alternatives
                self._save_draft()
            _success = True
        except Exception as exc:
            _logger.warning("run_suggest_stack error: %s", exc)
            async with self:
                self.stack_error = str(exc)
        finally:
            async with self:
                self.stack_suggesting = False
        if _success:
            yield rx.toast.success("Tech stack alternatives ready — select one below")

    @rx.event
    def select_alternative(self, index: int):
        """Select one of the 3 stack alternatives and pre-fill the edit textarea."""
        self.selected_alternative_index = index
        if 0 <= index < len(self.stack_alternatives):
            alt = self.stack_alternatives[index]
            self.tech_stack_edit = (
                f"{alt.get('name', '')}\n\n"
                f"{alt.get('description', '')}\n\n"
                f"{alt.get('trade_offs', '')}"
            )
        self._save_draft()

    @rx.event
    def set_stack_hint(self, value: str):
        self.stack_hint = value

    @rx.event
    def set_tech_stack_edit(self, value: str):
        self.tech_stack_edit = value
        self._save_draft()

    @rx.event
    def approve_gate0(self):
        """Write confirmed tech stack to memory-bank.md and unlock Stage B."""
        context_manager.write_tech_stack(self.tech_stack_edit)
        self.existing_tech_stack = self.tech_stack_edit
        self.gate0_approved = True
        self._save_draft()

    @rx.event
    def reopen_gate0(self):
        """Allow Tech Lead to update the tech stack after initial confirmation."""
        self.gate0_approved = False
        self.existing_tech_stack = ""
        self._save_draft()

    @rx.event
    def select_epic(self, epic_id_str: str):
        """Load stories for the selected epic and reset Stage B design state."""
        try:
            epic_id = int(epic_id_str)
        except (ValueError, TypeError):
            return
        self.selected_epic_id = epic_id
        self.selected_epic_title = ""
        for e in self.epic_list:
            if e.get("epic_id") == epic_id:
                self.selected_epic_title = e.get("epic_title", "")
                break

        self._sync_token()
        index = context_manager.get_story_index()
        index_by_id = {
            str(e.get("story_id")): e
            for e in index.values()
            if e.get("epic_id") == epic_id
        }
        try:
            taiga_stories = taiga_adapter.get_stories_for_epic(epic_id)
        except Exception:
            taiga_stories = []
        stories = []
        for ts in taiga_stories:
            sid = ts.get("id")
            entry = index_by_id.get(str(sid), {})
            gherkin = context_manager.get_story_gherkin(sid) if sid and entry else ""
            stories.append({
                "story_id": sid,
                "title": ts.get("subject", entry.get("title", "")),
                "gherkin": gherkin,
                "phase_status": entry.get("phase_status", "pending"),
            })
        self.stories_in_epic = stories

        # Reset per-epic design state (not gate0 or tech stack)
        self.wireframes_draft = ""
        self.wireframes_edit = ""
        self.user_flow_draft = ""
        self.user_flow_edit = ""
        self.component_tree_draft = ""
        self.component_tree_edit = ""
        self.tech_spec_draft = ""
        self.tech_spec_edit = ""
        self.gate1_approved = False
        self.gate2_approved = False
        self.generate_error = ""
        self.save_error = ""
        self.generation_log = []

        # Restore previously saved design bundle if one exists for this epic
        bundle = context_manager.get_epic_design_bundle(epic_id)
        if bundle:
            self.wireframes_draft = bundle.get("wireframes", "")
            self.wireframes_edit = bundle.get("wireframes", "")
            self.user_flow_draft = bundle.get("user_flow", "")
            self.user_flow_edit = bundle.get("user_flow", "")
            self.component_tree_draft = bundle.get("component_tree", "")
            self.component_tree_edit = bundle.get("component_tree", "")
            self.tech_spec_draft = bundle.get("tech_spec", "")
            self.tech_spec_edit = bundle.get("tech_spec", "")
            all_design_locked = bool(stories) and all(
                s.get("phase_status") == "design_locked" for s in stories
            )
            if all_design_locked:
                self.gate1_approved = True
                self.gate2_approved = True

        self._save_draft()
        yield rx.toast.info(f"Epic selected: {self.selected_epic_title}")

    @rx.event(background=True)
    async def run_generate(self):
        """Generate wireframes, user flow, component tree, and OpenAPI spec for the epic."""
        async with self:
            self.generating = True
            self.generate_error = ""
            self.generation_log = [
                f"Reading memory bank...",
                f"Preparing {len(self.stories_in_epic)} stories for epic '{self.selected_epic_title}'...",
            ]

        _success = False
        try:
            mb_context = context_manager.read_context_file("memory-bank.md")
            cross_epic_context = context_manager.get_other_epics_design_context(
                self.selected_epic_id
            )
            stories = list(self.stories_in_epic)
            epic_title = self.selected_epic_title

            log_msg = "Calling AI (this may take a minute)..."
            if cross_epic_context:
                log_msg = "Calling AI — injecting cross-epic context for consistency..."
            async with self:
                self.generation_log = self.generation_log + [log_msg]

            result = await asyncio.wait_for(
                asyncio.to_thread(
                    ai_engine.generate_phase2_design,
                    epic_title, stories, mb_context, cross_epic_context,
                ),
                timeout=480,  # 8 min — well under Azure's 1800s ingress limit
            )

            async with self:
                self.wireframes_draft = result.get("wireframes", "")
                self.wireframes_edit = result.get("wireframes", "")
                self.user_flow_draft = result.get("user_flow", "")
                self.user_flow_edit = result.get("user_flow", "")
                self.component_tree_draft = result.get("component_tree", "")
                self.component_tree_edit = result.get("component_tree", "")
                self.tech_spec_draft = result.get("tech_spec", "")
                self.tech_spec_edit = result.get("tech_spec", "")
                self.generation_log = self.generation_log + ["Design bundle generated. Review and approve each section."]
                self._save_draft()
            _success = True
        except asyncio.TimeoutError:
            _logger.warning("run_generate timed out after 480s")
            async with self:
                self.generate_error = "Generation timed out (>8 min). Try a smaller epic or fewer stories."
        except Exception as exc:
            _logger.warning("run_generate error: %s", exc)
            async with self:
                self.generate_error = str(exc)
        finally:
            async with self:
                self.generating = False
        if _success:
            yield rx.toast.success("Design bundle generated — review and approve each section")

    @rx.event
    def set_wireframes_edit(self, value: str):
        self.wireframes_edit = value
        self._save_draft()

    @rx.event
    def set_user_flow_edit(self, value: str):
        self.user_flow_edit = value
        self._save_draft()

    @rx.event
    def set_component_tree_edit(self, value: str):
        self.component_tree_edit = value
        self._save_draft()

    @rx.event
    def set_tech_spec_edit(self, value: str):
        self.tech_spec_edit = value
        self._save_draft()

    @rx.event
    def approve_gate1(self):
        self.gate1_approved = True
        self._save_draft()

    @rx.event
    def approve_gate2(self):
        if not self.gate1_approved:
            return
        self.gate2_approved = True
        self._save_draft()

    @rx.event
    async def save_design(self):
        """Write approved design to technical-spec.md + memory-bank.md, transition stories."""
        self.saving = True
        self.save_error = ""
        yield
        try:
            story_ids = [s["story_id"] for s in self.stories_in_epic if s.get("story_id")]
            context_manager.append_epic_technical_spec(
                self.selected_epic_id,
                self.selected_epic_title,
                story_ids,
                self.tech_spec_edit,
            )
            context_manager.append_memory_bank_design(
                self.selected_epic_id,
                self.selected_epic_title,
                prototype_summary=self.wireframes_edit,
                tech_spec_summary=self.tech_spec_edit,
            )
            context_manager.append_epic_design_bundle(
                self.selected_epic_id,
                self.selected_epic_title,
                self.wireframes_edit,
                self.user_flow_edit,
                self.component_tree_edit,
                self.tech_spec_edit,
            )
            self.stories_in_epic = [
                {**s, "phase_status": "design_locked"}
                for s in self.stories_in_epic
            ]
            self._save_draft()
            yield Phase2State.load_epics
            yield rx.toast.success("Design saved to context files")
        except Exception as exc:
            _logger.warning("save_design error: %s", exc)
            self.save_error = str(exc)
        finally:
            self.saving = False

    @rx.event
    def reset_story(self):
        """Clear per-epic design outputs and gates without touching tech stack or selection."""
        self.wireframes_draft = ""
        self.wireframes_edit = ""
        self.user_flow_draft = ""
        self.user_flow_edit = ""
        self.component_tree_draft = ""
        self.component_tree_edit = ""
        self.tech_spec_draft = ""
        self.tech_spec_edit = ""
        self.gate1_approved = False
        self.gate2_approved = False
        self.generate_error = ""
        self.save_error = ""
        self.generation_log = []
        context_manager.clear_design_draft()
        yield rx.toast.info("Design draft reset")

    @rx.event
    def refresh_epic_stories(self):
        """Invalidate story index cache and re-sync current epic from storage + Taiga."""
        if self.selected_epic_id <= 0:
            return
        context_manager.reset_cache()
        yield Phase2State.select_epic(str(self.selected_epic_id))

    @rx.event
    def restore_draft(self):
        """Restore Phase 2 draft state on page load (one-time guard)."""
        if self.draft_restored:
            return
        self.draft_restored = True
        draft = context_manager.load_design_draft()
        if not draft:
            return
        self.existing_tech_stack = draft.get("existing_tech_stack", "")
        self.stack_alternatives = draft.get("stack_alternatives", [])
        self.selected_alternative_index = draft.get("selected_alternative_index", -1)
        self.tech_stack_edit = draft.get("tech_stack_edit", "")
        self.gate0_approved = draft.get("gate0_approved", False)
        self.selected_epic_id = draft.get("selected_epic_id", 0)
        self.selected_epic_title = draft.get("selected_epic_title", "")
        self.stories_in_epic = draft.get("stories_in_epic", [])
        self.wireframes_edit = draft.get("wireframes_edit", "")
        self.user_flow_edit = draft.get("user_flow_edit", "")
        self.component_tree_edit = draft.get("component_tree_edit", "")
        self.tech_spec_edit = draft.get("tech_spec_edit", "")
        self.gate1_approved = draft.get("gate1_approved", False)
        self.gate2_approved = draft.get("gate2_approved", False)
        if self.selected_epic_id > 0:
            yield Phase2State.load_epics

    @rx.event
    def request_project_switch(self):
        """Intercept project confirmation — warn if Stage A has unsaved progress."""
        from state.context import ContextState
        if self.stage_a_has_unsaved:
            self.stage_a_discard_dialog_open = True
            self._stage_a_pending_action = "project_switch"
        else:
            self._do_clear_stage_a()
            yield ContextState.confirm_project_selection

    @rx.event
    def request_logout(self):
        """Intercept sign-out — warn if Stage A has unsaved progress."""
        if self.stage_a_has_unsaved:
            self.stage_a_discard_dialog_open = True
            self._stage_a_pending_action = "logout"
        else:
            self._do_clear_stage_a()
            yield AuthState.logout

    @rx.event
    def confirm_stage_a_discard(self):
        """User confirmed discard — clear Stage A and proceed with pending action."""
        from state.context import ContextState
        action = self._stage_a_pending_action
        self._stage_a_pending_action = ""
        self.stage_a_discard_dialog_open = False
        self._do_clear_stage_a()
        if action == "project_switch":
            yield ContextState.confirm_project_selection
        elif action == "logout":
            yield AuthState.logout

    @rx.event
    def set_stage_a_discard_dialog_open(self, value: bool):
        self.stage_a_discard_dialog_open = value
        if not value:
            self._stage_a_pending_action = ""

    @rx.event
    def clear_stage_a(self):
        """Clear Stage A suggestions and draft — allows starting fresh."""
        self._do_clear_stage_a()

    def _do_clear_stage_a(self):
        self.stack_alternatives = []
        self.selected_alternative_index = -1
        self.tech_stack_edit = ""
        self.stack_suggesting = False
        self.stack_error = ""
        self.gate0_approved = False
        self.existing_tech_stack = ""
        context_manager.clear_design_draft()

    def _save_draft(self):
        context_manager.save_design_draft({
            "existing_tech_stack": self.existing_tech_stack,
            "stack_alternatives": self.stack_alternatives,
            "selected_alternative_index": self.selected_alternative_index,
            "tech_stack_edit": self.tech_stack_edit,
            "gate0_approved": self.gate0_approved,
            "selected_epic_id": self.selected_epic_id,
            "selected_epic_title": self.selected_epic_title,
            "stories_in_epic": self.stories_in_epic,
            "wireframes_edit": self.wireframes_edit,
            "user_flow_edit": self.user_flow_edit,
            "component_tree_edit": self.component_tree_edit,
            "tech_spec_edit": self.tech_spec_edit,
            "gate1_approved": self.gate1_approved,
            "gate2_approved": self.gate2_approved,
        })
