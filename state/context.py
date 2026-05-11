"""context.py — Active Context file editor state."""

import reflex as rx

from src import context_manager
from state.project import ProjectState

_FILES = ("memory-bank.md", "functional-spec.md", "technical-spec.md", "vaccines.md")


class ContextState(ProjectState):
    mem_bank_content: str = ""
    func_spec_content: str = ""
    tech_spec_content: str = ""
    vaccines_content: str = ""
    context_sizes: dict = {}
    context_error: str = ""

    # ── Computed vars ─────────────────────────────────────────────────────────

    @rx.var
    def context_total_chars(self) -> int:
        return (
            len(self.mem_bank_content)
            + len(self.func_spec_content)
            + len(self.tech_spec_content)
            + len(self.vaccines_content)
        )

    @rx.var
    def context_size_color(self) -> str:
        total = self.context_total_chars
        if total < 30_000:
            return "#4ade80"
        elif total < 80_000:
            return "#facc15"
        return "#f87171"

    # Phase progress badges (derived from story index on disk)
    @rx.var
    def phase2_badge(self) -> str:
        return self._phase_badge(2)

    @rx.var
    def phase3_badge(self) -> str:
        return self._phase_badge(3)

    @rx.var
    def phase4_badge(self) -> str:
        return self._phase_badge(4)

    @rx.var
    def phase5_badge(self) -> str:
        return self._phase_badge(5)

    def _phase_badge(self, phase: int) -> str:
        try:
            index = context_manager.get_story_index()
            if not index:
                return ""
            total = len(index)
            stories = list(index.values())
            if phase == 2:
                n = sum(1 for s in stories if s.get("has_tech_spec"))
                return f"{n}/{total} designed" if n else ""
            if phase == 3:
                n = sum(1 for s in stories if s.get("has_proposal"))
                return f"{n}/{total} proposed" if n else ""
            if phase == 4:
                n = sum(1 for s in stories if s.get("has_bdd"))
                return f"{n}/{total} tested" if n else ""
            if phase == 5:
                n = sum(1 for s in stories if s.get("phase_status") == "deployed")
                return f"{n}/{total} deployed" if n else ""
        except Exception:
            pass
        return ""

    # ── Load / reload ─────────────────────────────────────────────────────────

    @rx.event
    def load_context(self):
        try:
            self.mem_bank_content = context_manager.get_memory_bank()
            self.func_spec_content = context_manager.read_context_file("functional-spec.md")
            self.tech_spec_content = context_manager.read_context_file("technical-spec.md")
            self.vaccines_content = context_manager.get_vaccines()
            self.context_sizes = context_manager.get_context_sizes()
        except Exception as exc:
            self.context_error = str(exc)

    # ── Autosave handlers (called on every textarea change) ───────────────────

    @rx.event
    def save_mem_bank(self, content: str):
        context_manager.write_context_file("memory-bank.md", content)
        self.mem_bank_content = content

    @rx.event
    def save_func_spec(self, content: str):
        context_manager.write_context_file("functional-spec.md", content)
        self.func_spec_content = content

    @rx.event
    def save_tech_spec(self, content: str):
        context_manager.write_context_file("technical-spec.md", content)
        self.tech_spec_content = content

    @rx.event
    def save_vaccines(self, content: str):
        context_manager.write_context_file("vaccines.md", content)
        self.vaccines_content = content

    # ── Download ──────────────────────────────────────────────────────────────

    @rx.event
    def download_mem_bank(self):
        return rx.download(data=self.mem_bank_content.encode("utf-8"), filename="memory-bank.md")

    @rx.event
    def download_func_spec(self):
        return rx.download(data=self.func_spec_content.encode("utf-8"), filename="functional-spec.md")

    @rx.event
    def download_tech_spec(self):
        return rx.download(data=self.tech_spec_content.encode("utf-8"), filename="technical-spec.md")

    @rx.event
    def download_vaccines(self):
        return rx.download(data=self.vaccines_content.encode("utf-8"), filename="vaccines.md")

    # ── Reset ─────────────────────────────────────────────────────────────────

    @rx.event
    def reset_context_file(self, filename: str):
        context_manager.reset_context_file(filename)
        yield ContextState.load_context

    @rx.event
    def reset_context(self):
        context_manager.reset_context()
        yield ContextState.load_context
