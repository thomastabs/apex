"""apex.py — Reflex app entry point: theme, routing, on_load handlers."""

import reflex as rx

from apex.state.auth import AuthState
from apex.state.context import ContextState
from apex.state.phase1 import Phase1State
from apex.state.project import ProjectState

from apex.pages.phase1 import phase1_page
from apex.pages.phase2 import phase2_page
from apex.pages.phase3 import phase3_page
from apex.pages.phase4 import phase4_page
from apex.pages.phase5 import phase5_page
from apex.pages.phase6 import phase6_page

_SHARED_ON_LOAD = [
    AuthState.restore_session,
    ProjectState.load_project_config,
    ContextState.load_context,
]

app = rx.App()

app.add_page(
    phase1_page,
    route="/",
    title="Phase 1 · Requirements",
    on_load=_SHARED_ON_LOAD + [Phase1State.restore_draft],
)
app.add_page(phase2_page, route="/phase2", title="Phase 2 · Design",          on_load=_SHARED_ON_LOAD)
app.add_page(phase3_page, route="/phase3", title="Phase 3 · Implementation",  on_load=_SHARED_ON_LOAD)
app.add_page(phase4_page, route="/phase4", title="Phase 4 · Testing",         on_load=_SHARED_ON_LOAD)
app.add_page(phase5_page, route="/phase5", title="Phase 5 · Deployment",      on_load=_SHARED_ON_LOAD)
app.add_page(phase6_page, route="/phase6", title="Phase 6 · Maintenance",     on_load=_SHARED_ON_LOAD)
