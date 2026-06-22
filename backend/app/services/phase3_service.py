"""Phase 3 implementation-assist workflow service."""

import logging

from backend.app.services.ai_service import AiService
from backend.app.services.context_service import ContextService
from backend.app.services.request_context import RequestContext

_logger = logging.getLogger("apex.phase3_service")

_PREVIEW_CHARS = 3000

# Statuses for which Phase 3 stays open (select story + decompose + packs).
# design_locked = ready to decompose; implementation = locked & being built;
# qa/qa_passed = in testing but packs can still be added/regenerated. Excludes
# pre-design (new/gherkin_locked) and deployed. lock_story stays design_locked-
# only so re-locking can't downgrade a qa story back to implementation.
_PHASE3_OPEN_STATUSES = ("design_locked", "implementation", "qa", "qa_passed")


class Phase3ValidationError(ValueError):
    """Raised when a Phase 3 request is structurally invalid."""


class Phase3Service:
    def __init__(
        self,
        *,
        ai: AiService | None = None,
        context: ContextService | None = None,
    ) -> None:
        self.ai = ai or AiService()
        self.context = context or ContextService()

    def configure_request(self, ctx: RequestContext) -> None:
        self.context.set_active(ctx)

    def get_eligible_stories(self, ctx: RequestContext) -> list[dict]:
        self.configure_request(ctx)
        index = self.context.story_index()
        stories = []
        for entry in index.values():
            if entry.get("phase_status") not in _PHASE3_OPEN_STATUSES:
                continue
            story_id = entry.get("story_id")
            if not story_id:
                continue
            gherkin = self.context.story_gherkin(story_id)
            tech_spec = self.context.story_technical_spec(story_id)
            stories.append({
                "story_id": story_id,
                "title": entry.get("title", ""),
                "epic_title": entry.get("epic_title", ""),
                "gherkin_preview": gherkin[:_PREVIEW_CHARS].strip(),
                "tech_spec_preview": tech_spec[:_PREVIEW_CHARS].strip(),
            })
        return sorted(stories, key=lambda s: s["story_id"])

    def get_story_context(self, ctx: RequestContext, story_id: int) -> dict:
        self.configure_request(ctx)
        index = self.context.story_index()
        entry = index.get(str(story_id)) or {}
        if not entry:
            raise Phase3ValidationError(f"Story {story_id} not found in index.")
        return {
            "story_id": story_id,
            "title": entry.get("title", ""),
            "epic_title": entry.get("epic_title", ""),
            "gherkin": self.context.story_gherkin(story_id),
            "technical_spec": self.context.story_technical_spec(story_id),
            "project_concept": self.context.read_project_concept(),
            "tech_stack": self.context.read_tech_stack(),
            "design_bundle": self.context.read_context_file("design-bundle.md"),
        }

    def generate_tasks(self, ctx: RequestContext, story_id: int) -> list[dict]:
        self.configure_request(ctx)
        index = self.context.story_index()
        entry = index.get(str(story_id)) or {}
        if entry.get("phase_status") not in _PHASE3_OPEN_STATUSES:
            raise Phase3ValidationError(
                f"Story {story_id} is not ready for task decomposition (status: {entry.get('phase_status')!r})."
            )
        story_title = entry.get("title", f"Story {story_id}")
        gherkin = self.context.story_gherkin(story_id)
        if not gherkin:
            raise Phase3ValidationError(f"Story {story_id} has no Gherkin content.")
        technical_spec = self.context.story_technical_spec(story_id)
        tech_stack = self.context.read_tech_stack()
        design_bundle = self.context.story_design_bundle(story_id)
        github_context = self.context.read_context_file("github-context.md")
        return self.ai.generate_tasks(
            story_title, gherkin, technical_spec,
            tech_stack=tech_stack, design_bundle=design_bundle, github_context=github_context,
        )

    def cross_check_tasks(self, ctx: RequestContext, story_id: int) -> dict:
        """Decompose a story with the active model AND a second configured
        provider, returning the task-subject diff (agreed / only-in-each)."""
        from src import ai_engine

        self.configure_request(ctx)
        index = self.context.story_index()
        entry = index.get(str(story_id)) or {}
        if entry.get("phase_status") not in _PHASE3_OPEN_STATUSES:
            raise Phase3ValidationError(
                f"Story {story_id} is not ready for task decomposition (status: {entry.get('phase_status')!r})."
            )
        gherkin = self.context.story_gherkin(story_id)
        if not gherkin:
            raise Phase3ValidationError(f"Story {story_id} has no Gherkin content.")
        primary = ai_engine.get_model()
        alt = self.ai.pick_alt_model(primary)
        if not alt:
            raise Phase3ValidationError(
                "Cross-check needs a second AI provider — add another provider's API key (OpenAI/Google)."
            )
        labels = {m["id"]: m.get("label", m["id"]) for m in ai_engine.AVAILABLE_MODELS}
        diff = self.ai.cross_check_tasks(
            entry.get("title", f"Story {story_id}"), gherkin,
            self.context.story_technical_spec(story_id),
            tech_stack=self.context.read_tech_stack(),
            design_bundle=self.context.story_design_bundle(story_id),
            github_context=self.context.read_context_file("github-context.md"),
            primary_model=primary, alt_model=alt,
        )
        return {
            "primary_model": primary, "primary_label": labels.get(primary, primary),
            "alt_model": alt, "alt_label": labels.get(alt, alt), **diff,
        }

    def generate_proposal(
        self,
        ctx: RequestContext,
        story_id: int,
        task_id: int,
        task_subject: str,
        task_description: str,
        hint: str = "",
        recent_commits_context: str = "",
        all_tasks: list[dict] | None = None,
    ) -> str:
        self.configure_request(ctx)
        index = self.context.story_index()
        entry = index.get(str(story_id)) or {}
        if not entry:
            raise Phase3ValidationError(f"Story {story_id} not found in index.")
        # Packs are per-task artifacts that can be added/regenerated any time the
        # story is open for Phase 3 work — through testing (see _PHASE3_OPEN_STATUSES).
        if entry.get("phase_status") not in _PHASE3_OPEN_STATUSES:
            raise Phase3ValidationError(
                f"Story {story_id} is not ready for developer packs (status: {entry.get('phase_status')!r})."
            )
        story_title = entry.get("title", f"Story {story_id}")
        story_ref = f"US#{story_id} — {story_title}"
        gherkin = self.context.story_gherkin(story_id)
        technical_spec = self.context.story_technical_spec(story_id)
        tech_stack = self.context.read_tech_stack()
        design_bundle = self.context.story_design_bundle(story_id)
        github_context = self.context.read_context_file("github-context.md")
        constraints = self.context.read_context_file("constraints.md")
        # Only inject the decision log once it has real records (## entries), not
        # the bare template header — keeps the prompt unchanged for fresh projects.
        decisions_raw = self.context.read_context_file("decisions.md")
        decisions = decisions_raw if "\n## " in f"\n{decisions_raw}" else ""
        other_tasks = [t for t in (all_tasks or []) if t.get("subject") != task_subject]
        # Sibling packs already saved for this story → keep packs consistent
        # (shared files/entities/endpoints, no duplication). Label each by its
        # task subject from all_tasks; exclude the task being (re)generated.
        subject_by_id = {
            int(t["id"]): t.get("subject", "")
            for t in (all_tasks or []) if t.get("id") is not None
        }
        sibling_packs = [
            {
                "subject": subject_by_id.get(int(p["task_id"]), f"Task {p['task_id']}"),
                "proposal_md": p.get("proposal_md", ""),
            }
            for p in self.context.load_proposals(story_id)
            if int(p["task_id"]) != int(task_id)
        ]
        return self.ai.generate_proposal(
            task_subject, task_description, gherkin, technical_spec,
            tech_stack=tech_stack, design_bundle=design_bundle, story_ref=story_ref,
            github_context=github_context, hint=hint, recent_commits=recent_commits_context,
            other_tasks=other_tasks, sibling_packs=sibling_packs, constraints=constraints,
            decisions=decisions,
        )

    def save_proposal(
        self,
        ctx: RequestContext,
        story_id: int,
        task_id: int,
        proposal_md: str,
    ) -> None:
        self.configure_request(ctx)
        self.context.save_proposal(story_id, task_id, proposal_md)
        # Keep cross-story design-conflict flags live as packs land (no AI).
        self._refresh_design_conflicts()

    def _refresh_design_conflicts(self) -> dict:
        """Re-run the cross-story design-drift detector over every saved pack and
        set/clear each story's design_conflict flag. Returns the report."""
        from src import ai_engine

        index = self.context.story_index()
        packs = self.context.load_all_proposals()
        for p in packs:
            entry = index.get(str(p["story_id"])) or {}
            p["story_title"] = entry.get("title", "")
        conflicts = ai_engine.detect_design_conflicts(packs)

        flagged_ids = set(conflicts)
        # Clear stories that previously had a flag but no longer conflict.
        for sid_str, entry in index.items():
            if entry.get("design_conflict") and int(sid_str) not in flagged_ids:
                self.context.clear_design_conflict(int(sid_str))
        results = []
        for sid, info in sorted(conflicts.items()):
            self.context.set_design_conflict(sid, info["reason"])
            results.append({
                "story_id": sid,
                "title": (index.get(str(sid)) or {}).get("title", ""),
                "reason": info["reason"],
                "files": info["files"],
                "endpoints": info["endpoints"],
            })
        return {"results": results, "conflicted_ids": sorted(flagged_ids)}

    def scan_design_conflicts(self, ctx: RequestContext) -> dict:
        """On-demand project-wide cross-story design-conflict scan (no AI)."""
        self.configure_request(ctx)
        return self._refresh_design_conflicts()

    def _require_story(self, story_id: int) -> None:
        """Raise Phase3ValidationError if story_id is not in the project index."""
        if str(story_id) not in self.context.story_index():
            raise Phase3ValidationError(f"Story {story_id} not found in project index.")

    def get_proposals(self, ctx: RequestContext, story_id: int) -> list[dict]:
        self.configure_request(ctx)
        self._require_story(story_id)
        return self.context.load_proposals(story_id)

    def delete_proposal(self, ctx: RequestContext, story_id: int, task_id: int) -> None:
        """Drop one task's developer pack (the task was deleted in the PM tool)."""
        self.configure_request(ctx)
        self.context.delete_proposal(story_id, task_id)

    def list_all_packs(self, ctx: RequestContext) -> list[dict]:
        """All developer packs in the project, annotated with story titles."""
        self.configure_request(ctx)
        index = self.context.story_index()
        packs = self.context.list_all_proposals()
        for p in packs:
            entry = index.get(str(p["story_id"])) or {}
            p["story_title"] = entry.get("title", "")
        return packs

    def lock_story(self, ctx: RequestContext, story_id: int, task_ids: list[int]) -> None:
        self.configure_request(ctx)
        index = self.context.story_index()
        entry = index.get(str(story_id)) or {}
        if not entry:
            raise Phase3ValidationError(f"Story {story_id} not found.")
        if entry.get("phase_status") != "design_locked":
            raise Phase3ValidationError(
                f"Story {story_id} is not design_locked (status: {entry.get('phase_status')!r})."
            )
        task_ids = list(dict.fromkeys(task_ids))  # dedup, preserve order
        missing = [tid for tid in task_ids if not self.context.proposal_exists(story_id, tid)]
        if missing:
            raise Phase3ValidationError(
                f"Tasks {missing} have no saved proposals — save all packs before locking."
            )
        self.context.upsert_story_index(
            story_id, phase_status="implementation", has_proposal=True,
        )
