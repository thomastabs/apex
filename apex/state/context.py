"""context.py — Active Context file editor state."""

import reflex as rx

from src import context_manager
from apex.state.project import ProjectState


class ContextState(ProjectState):
    mem_bank_content: str = ""
    mem_bank_edit: bool = False
    func_spec_content: str = ""
    func_spec_edit: bool = False
    tech_spec_content: str = ""
    tech_spec_edit: bool = False
    vaccines_content: str = ""
    vaccines_edit: bool = False
    context_sizes: dict = {}
    context_error: str = ""

    @rx.event
    def load_context(self):
        try:
            self.mem_bank_content = context_manager.get_memory_bank()
            self.func_spec_content = context_manager.read_file("functional-spec.md")
            self.tech_spec_content = context_manager.read_file("technical-spec.md")
            self.vaccines_content = context_manager.get_vaccines()
            self.context_sizes = context_manager.get_context_sizes()
        except Exception as exc:
            self.context_error = str(exc)

    @rx.event
    def save_mem_bank(self, content: str):
        context_manager.write_file("memory-bank.md", content)
        self.mem_bank_content = content
        self.mem_bank_edit = False

    @rx.event
    def save_func_spec(self, content: str):
        context_manager.write_file("functional-spec.md", content)
        self.func_spec_content = content
        self.func_spec_edit = False

    @rx.event
    def save_tech_spec(self, content: str):
        context_manager.write_file("technical-spec.md", content)
        self.tech_spec_content = content
        self.tech_spec_edit = False

    @rx.event
    def save_vaccines(self, content: str):
        context_manager.write_file("vaccines.md", content)
        self.vaccines_content = content
        self.vaccines_edit = False

    @rx.event
    def reset_context(self):
        context_manager.reset_context()
        yield ContextState.load_context
