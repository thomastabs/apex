"""Shared base for the FakeContextService test doubles in phase2/3/4/5 tests.

Each phase service test defines its own FakeContextService with the handful
of ContextService methods that specific service actually calls — most of
that is deliberately NOT shared here (phase6/maintenance/analytics/
traceability track active-project and story-index differently, so forcing
them onto one shape would change behavior, not just remove duplication).
This base only carries the three methods that were byte-for-byte identical
across phase2/phase3/phase4/phase5's fakes (flagged in the 2026-07-21
full-repo audit).
"""


class FakeContextServiceBase:
    def __init__(self, index=None):
        self.project_id = 0
        self.index = index if index is not None else {}

    def set_active(self, ctx):
        self.set_project(ctx.project_id)

    def set_project(self, project_id: int) -> None:
        self.project_id = project_id

    def story_index(self):
        return self.index
