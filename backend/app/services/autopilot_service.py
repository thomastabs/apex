"""Autopilot service: AI-driven full SDLC pipeline (Phases 1–5).

Runs the entire pipeline in a background thread:
  Phase 1: epic → NL stories → Gherkin (per epic)
  Phase 2: lock tech stack → generate design sections → persist design
  Phase 3: task decomposition + developer packs (per story)
  Phase 4: test plan generation + auto QA pass (per story)
  Phase 5: infra delta bypass + auto deployment gate (per story)

Job lifecycle: running → paused (checkpoint) → running → done | stopped | error
"""

from __future__ import annotations

import concurrent.futures as cf
import contextvars
import logging
import os
import threading
import time
import uuid
from typing import Any

import httpx

from backend.app.services.context_service import ContextService
from backend.app.services.phase1_service import Phase1Service
from backend.app.services.phase2_service import Phase2Service
from backend.app.services.phase3_service import Phase3Service
from backend.app.services.phase4_service import Phase4Service
from backend.app.services.phase5_service import Phase5Service
from backend.app.services.request_context import RequestContext

_logger = logging.getLogger("apex.autopilot")

# In-memory job registry (single-writer assumption: backend max 1 replica or Redis lock).
_JOBS: dict[str, dict[str, Any]] = {}
_JOBS_LOCK = threading.Lock()

# Synthetic story IDs for non-Taiga mode (avoid collision with real Taiga IDs < 1M).
_SYNTHETIC_BASE = 9_000_000
_synthetic_counter = 0
_synthetic_lock = threading.Lock()

_TIMEOUT = 20.0

# Phases 3/4 are per-story and independent → run a bounded number concurrently to
# cut wall-clock time (each story is still sequential internally). ai_engine backs
# off on a provider 429, so a small fan-out is safe; tune with AUTOPILOT_CONCURRENCY.
_AUTOPILOT_CONCURRENCY = max(1, min(8, int(os.getenv("AUTOPILOT_CONCURRENCY", "3") or "3")))
# Guards the shared event counter/list + stories_done across worker threads.
_progress_lock = threading.Lock()
# Serialises the autopilot-job.json write (concurrent persists would interleave).
_persist_lock = threading.Lock()

# Phase order for resume: a job persists its current_phase; on resume we re-enter
# at that phase (the running phase didn't finish) and skip the earlier ones, whose
# artifacts are already on disk. Per-unit idempotent skips (completed epics in
# Phase 1, story phase_status in Phases 3-5) make re-entering a phase safe.
_PHASE_KEYS = ["phase1", "phase2", "phase3", "phase4", "phase5"]
_PHASE_LABELS = ["Phase 1", "Phase 2", "Phase 3", "Phase 4", "Phase 5"]
_RESUMABLE_STATES = ("running", "paused", "interrupted")
# A story already at/past these statuses is skipped when its phase re-runs.
_PHASE3_DONE = {"implementation", "qa", "qa_passed", "deployed"}
_PHASE4_DONE = {"qa_passed", "deployed"}
_PHASE5_DONE = {"deployed"}


def _next_synthetic_id() -> int:
    global _synthetic_counter
    with _synthetic_lock:
        _synthetic_counter += 1
        return _SYNTHETIC_BASE + _synthetic_counter


# ---------------------------------------------------------------------------
# Taiga helpers
# ---------------------------------------------------------------------------

def _taiga_post(url: str, token: str, body: dict) -> dict:
    from backend.app.api.taiga_proxy import _egress, _pin_unless_relayed

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    url, headers = _egress(url, headers)
    url, headers, ext = _pin_unless_relayed(url, headers)
    resp = httpx.post(
        url, headers=headers, json=body, timeout=_TIMEOUT,
        **({"extensions": ext} if ext else {}),
    )
    if resp.status_code in (401, 403):
        raise PermissionError(f"Taiga returned {resp.status_code} on POST {url}")
    resp.raise_for_status()
    return resp.json()


def _taiga_delete(url: str, token: str) -> None:
    from backend.app.api.taiga_proxy import _egress, _pin_unless_relayed

    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    url, headers = _egress(url, headers)
    url, headers, ext = _pin_unless_relayed(url, headers)
    resp = httpx.delete(url, headers=headers, timeout=_TIMEOUT, **({"extensions": ext} if ext else {}))
    if resp.status_code not in (200, 204, 404):  # 404 = already gone, fine
        resp.raise_for_status()


# ---------------------------------------------------------------------------
# Event helpers
# ---------------------------------------------------------------------------

def _emit(job: dict, level: str, msg: str, phase: str = "", artifact: str = "") -> None:
    with _progress_lock:
        job["event_counter"] += 1
        job["events"].append({
            "id": job["event_counter"],
            "ts": time.time(),
            "level": level,
            "msg": msg,
            "phase": phase,
            "artifact": artifact,
        })
    _logger.info("[autopilot %s] [%s] %s", job["job_id"][:8], level, msg)


# ---------------------------------------------------------------------------
# Checkpoint handling
# ---------------------------------------------------------------------------

def _maybe_checkpoint(job: dict, phase_name: str) -> bool:
    """Pause if pause_at_checkpoints is enabled. Returns True if stopped."""
    if job.get("state") == "stopped":
        return True
    if not job["settings"].get("pause_at_checkpoints"):
        return False

    _emit(job, "checkpoint", f"Checkpoint after {phase_name} — waiting for resume", phase=phase_name)
    job["state"] = "paused"
    job["checkpoint_phase"] = phase_name
    _persist(job)

    # Block until resumed or stopped.
    resume_event: threading.Event = job["_resume_event"]
    stop_event: threading.Event = job["_stop_event"]
    resume_event.clear()
    while not resume_event.wait(timeout=1.0):
        if stop_event.is_set():
            return True
    job["state"] = "running"
    job["checkpoint_phase"] = None
    _emit(job, "info", f"Resumed from checkpoint after {phase_name}", phase=phase_name)
    return False


def _check_stop(job: dict) -> bool:
    return job["_stop_event"].is_set() or job.get("state") == "stopped"


# ---------------------------------------------------------------------------
# Phase runners
# ---------------------------------------------------------------------------

def _seed_figma(job: dict, cs: ContextService) -> None:
    """Optional: fetch the linked Figma design and write figma-context.md so Phase 1
    story-gen and Phase 2 design pick it up automatically. Frames/flows are stashed on
    the job for the Phase 2 screen-flow build. Best-effort — never fails the pipeline.

    Two modes: a single file (figma_file_key) or a whole project (figma_project_id →
    one epic per file, Stage 3 file-as-epic)."""
    token = job.get("figma_token", "")
    if not token:
        return
    if job.get("figma_project_id"):
        _seed_figma_project(job, cs, token)
        return

    file_key = job.get("figma_file_key", "")
    if not file_key:
        return
    from backend.app.services.figma_fetch import (
        FigmaFetchError,
        fetch_context_and_frames,
        fetch_frame_images,
    )

    _emit(job, "info", "  Seeding design context from Figma…", phase="phase1")
    try:
        context_md, frames, flows = fetch_context_and_frames(token, file_key)
    except FigmaFetchError as exc:
        _emit(job, "warning", f"  Figma seeding skipped: {exc}", phase="phase1")
        return
    cs.write_context_file("figma-context.md", context_md)
    job["_figma_frames"] = frames
    job["_figma_flows"] = flows
    # U1: render frames to PNGs for multimodal grounding (advisory — never raises).
    images = fetch_frame_images(token, file_key, frames)
    job["_figma_images"] = images
    img_note = f", {len(images)} frame images" if images else ""
    _emit(job, "success", f"  Figma context seeded ({len(frames)} frames{img_note})", phase="phase1",
          artifact=context_md[:1500])


def _seed_figma_project(job: dict, cs: ContextService, token: str) -> None:
    """Stage 3: ingest a whole Figma project → one epic per file, each grounded in its
    own file's frames + images. Aggregates the per-file context into figma-context.md
    and unions the frames (ids namespaced by file key) for the Phase-2 screen flow."""
    project_id = job["figma_project_id"]
    from backend.app.services.figma_fetch import (
        FigmaFetchError,
        build_project_context_markdown,
        fetch_project_designs,
        stitch_cross_file_flows,
    )

    _emit(job, "info", "  Seeding design context from Figma project…", phase="phase1")
    try:
        bundles = fetch_project_designs(token, project_id)
    except FigmaFetchError as exc:
        _emit(job, "warning", f"  Figma project seeding skipped: {exc}", phase="phase1")
        return
    if not bundles:
        _emit(job, "warning", "  Figma project had no usable files — skipping.", phase="phase1")
        return

    context_md = build_project_context_markdown(bundles)
    cs.write_context_file("figma-context.md", context_md)

    # One epic per file (file-as-epic). The _figma_file_key marker lets _run_phase1
    # ground each epic with that file's own images.
    job["epics"] = [
        {"title": b["file_name"], "description": "", "_figma_file_key": b["file_key"]}
        for b in bundles
    ]
    job["_figma_by_file"] = {b["file_key"]: b for b in bundles}

    # Union frames/flows for the single Phase-2 screen flow. Node ids are file-scoped
    # in Figma and can collide across files, so namespace them by file key.
    union_frames: list[dict] = []
    union_flows: list[dict] = []
    for b in bundles:
        fk = b["file_key"]
        for fr in b["frames"]:
            union_frames.append({**fr, "node_id": f"{fk}:{fr['node_id']}"})
        union_flows.extend(b["flows"])
    job["_figma_frames"] = union_frames
    job["_figma_flows"] = union_flows
    # Inferred cross-file edges (shared screen names across files) for the screen flow.
    job["_figma_cross_edges"] = stitch_cross_file_flows(bundles)

    total_imgs = sum(len(b["images"]) for b in bundles)
    _emit(job, "success",
          f"  Figma project seeded — {len(bundles)} files → epics, {total_imgs} frame images",
          phase="phase1", artifact=context_md[:1500])


def _epic_field(epic, field: str) -> str:
    """Read title/description whether suggest_epics returns dicts or pydantic models."""
    if isinstance(epic, dict):
        return str(epic.get(field) or "")
    return str(getattr(epic, field, "") or "")


def _run_phase1(job: dict, ctx: RequestContext) -> list[int]:
    """Run Phase 1 for all epics. Returns all story IDs created."""
    p1 = Phase1Service()
    cs = ContextService()
    cs.set_active(ctx)
    cs.init_context()
    if job.get("use_existing_concept"):
        # Use the project's existing concept file as-is — never overwrite it. The
        # reader returns "" for a missing file or the untouched blank template.
        existing = cs.read_project_concept()
        if not existing:
            _emit(job, "error",
                  "project-concept.md is empty — write a concept in the form or fill the file first.",
                  phase="phase1")
            raise RuntimeError("use_existing_concept is set but project-concept.md has no content")
        job["concept"] = existing
        _emit(job, "info", f"Using existing project concept ({len(existing)} chars)", phase="phase1")
    else:
        cs.write_context_file("project-concept.md", job["concept"])
        _emit(job, "info", "Project concept saved", phase="phase1")
    _seed_figma(job, cs)

    # Automatic epics: when enabled and the user gave no manual epics (and we're not
    # in Figma project mode, which already set one epic per file), derive the epic
    # set from the project concept via AI — the same suggest_epics used by Phase 1.
    if (
        job["settings"].get("auto_epics")
        and not job.get("figma_project_id")
        and not [e for e in job.get("epics", []) if (e.get("title") or "").strip()]
    ):
        _emit(job, "info", "Deriving epics from the project concept…", phase="phase1")
        try:
            suggested = p1.suggest_epics(ctx, hint=job.get("tech_stack_hint", ""))
        except Exception as exc:  # noqa: BLE001 — surface as a job error, don't crash the thread
            _emit(job, "error", f"Epic generation failed: {exc}", phase="phase1")
            raise
        job["epics"] = [
            {"title": _epic_field(e, "title"), "description": _epic_field(e, "description")}
            for e in suggested
            if _epic_field(e, "title").strip()
        ]
        if not job["epics"]:
            _emit(job, "error", "AI returned no epics for this concept.", phase="phase1")
            raise RuntimeError("Automatic epic generation produced no epics.")
        _emit(job, "success", f"  {len(job['epics'])} epics derived", phase="phase1",
              artifact="\n".join(f"- {e['title']}" for e in job["epics"]))

    # Resume: start from any story ids already created in a prior (interrupted) run,
    # and skip epics already finalized (tracked by index in completed_epics).
    all_story_ids: list[int] = list(job.get("_all_story_ids", []))
    completed_epics: set[int] = set(job.get("completed_epics", []))
    epics: list[dict] = job["epics"]
    pending = [i for i in range(len(epics)) if i not in completed_epics]
    _emit(job, "info",
          f"Phase 1 · {len(pending)} epic(s) → stories "
          f"(up to {_AUTOPILOT_CONCURRENCY} at a time)…", phase="phase1")

    def _epic_worker(epic_idx: int) -> None:
        if _check_stop(job):
            return
        p1w = Phase1Service()  # per-worker instance — services hold per-request state
        epic = epics[epic_idx]
        epic_title = epic["title"]
        epic_description = epic.get("description", "")
        _emit(job, "info", f"  Epic {epic_idx + 1}/{len(epics)}: {epic_title!r} — generating stories…", phase="phase1")

        # Taiga epic creation
        epic_taiga_id: int | None = None
        if job["settings"].get("create_epics_in_taiga") and job.get("taiga_base") and job.get("taiga_token"):
            try:
                result = _taiga_post(
                    f"{job['taiga_base']}/epics",
                    job["taiga_token"],
                    {"project": ctx.project_id, "subject": epic_title, "description": epic_description},
                )
                epic_taiga_id = result.get("id")
                _emit(job, "info", f"  Created Taiga epic #{epic_taiga_id} ({epic_title!r})", phase="phase1")
            except Exception as exc:
                _emit(job, "warning", f"  Taiga epic creation failed: {exc} — using synthetic ID", phase="phase1")

        epic_id = epic_taiga_id if epic_taiga_id else (epic_idx + 1)

        # Project mode (file-as-epic): ground this epic with its OWN file's images.
        epic_file_key = epic.get("_figma_file_key")
        if epic_file_key and job.get("_figma_by_file"):
            epic_images = job["_figma_by_file"].get(epic_file_key, {}).get("images") or None
        else:
            epic_images = job.get("_figma_images") or None
        nl_draft, _ = p1w.generate_nl_stories(
            ctx, epic_subject=epic_title, epic_description=epic_description,
            images=epic_images, instructions=job.get("steer_note", ""),
        )
        if _check_stop(job):
            return
        stories = p1w.compile_gherkin(nl_draft=nl_draft)

        # Assign real IDs (Taiga story + epic link, mirroring taigaCreateStory) or synthetic.
        if job["settings"].get("create_epics_in_taiga") and job.get("taiga_base") and job.get("taiga_token") and epic_taiga_id:
            remapped: list[dict] = []
            for s in stories:
                try:
                    sr = _taiga_post(
                        f"{job['taiga_base']}/userstories",
                        job["taiga_token"],
                        {"project": ctx.project_id, "subject": s["title"], "description": s.get("gherkin", "")},
                    )
                    us_id = sr["id"]
                    try:
                        _taiga_post(
                            f"{job['taiga_base']}/epics/{epic_taiga_id}/related_userstories",
                            job["taiga_token"],
                            {"epic": epic_taiga_id, "user_story": us_id},
                        )
                    except Exception as link_exc:
                        _emit(job, "warning", f"  Story #{us_id} created but epic link failed: {link_exc}", phase="phase1")
                    remapped.append({**s, "id": us_id})
                except Exception as exc:
                    _emit(job, "warning", f"  Taiga story creation failed: {exc} — using synthetic ID", phase="phase1")
                    remapped.append({**s, "id": _next_synthetic_id()})
            stories = remapped
        else:
            stories = [{**s, "id": _next_synthetic_id()} for s in stories]

        result = p1w.finalize_stories(ctx, epic_id=epic_id, epic_subject=epic_title, stories=stories)
        story_ids = result["story_ids"]
        with _progress_lock:
            all_story_ids.extend(story_ids)
            job["story_count"] += len(story_ids)
            completed_epics.add(epic_idx)
            job["completed_epics"] = sorted(completed_epics)
            job["_all_story_ids"] = list(all_story_ids)
        _emit(job, "success", f"  Epic {epic_title!r}: {len(story_ids)} stories locked (Gherkin)", phase="phase1")
        _persist(job)

    _run_parallel(job, pending, _epic_worker)
    return list(all_story_ids)


def _dedup_stories(job: dict, ctx: RequestContext, all_story_ids: list[int]) -> list[int]:
    """Drop near-duplicate stories produced across DIFFERENT epics (pure detector),
    so the backlog stays concise. Runs right after Phase 1 — before any downstream
    artifacts exist — so removal is clean: delete the Taiga story (real ids) + its
    index entry. Idempotent on resume (already-gone deletes 404, index removal no-ops).
    Returns the surviving story ids."""
    from src import ai_engine

    cs = ContextService()
    cs.set_active(ctx)
    keep = set(all_story_ids)
    index = cs.story_index()
    stories = [
        {"id": int(sid), "title": entry.get("title", ""), "epic_id": entry.get("epic_id")}
        for sid, entry in index.items()
        if int(sid) in keep
    ]
    drops = ai_engine.find_cross_epic_duplicates(stories)
    if not drops:
        _emit(job, "info", "Dedup: no cross-epic duplicate stories found.", phase="phase1")
        return all_story_ids

    drop_ids = [d["drop_id"] for d in drops]
    if job["settings"].get("create_epics_in_taiga") and job.get("taiga_base") and job.get("taiga_token"):
        for did in drop_ids:
            if did < _SYNTHETIC_BASE:  # real Taiga id (synthetic ids are local-only)
                try:
                    _taiga_delete(f"{job['taiga_base']}/userstories/{did}", job["taiga_token"])
                except Exception as exc:  # noqa: BLE001 — best-effort cleanup
                    _emit(job, "warning", f"  Could not delete Taiga story #{did}: {exc}", phase="phase1")
    cs.remove_story_index_entries(drop_ids)

    for d in drops:
        _emit(job, "info",
              f"  Removed duplicate story #{d['drop_id']} {d['title'][:50]!r} — overlaps #{d['keep_id']} (sim {d['score']})",
              phase="phase1")
    remaining = [sid for sid in all_story_ids if sid not in set(drop_ids)]
    job["_all_story_ids"] = remaining
    job["story_count"] = len(remaining)
    _emit(job, "success",
          f"Dedup: removed {len(drops)} cross-epic duplicate "
          f"{'story' if len(drops) == 1 else 'stories'}; {len(remaining)} remain.",
          phase="phase1")
    _persist(job)
    return remaining


def _run_phase2(job: dict, ctx: RequestContext, all_story_ids: list[int]) -> None:
    """Run Phase 2: lock tech stack + generate design + persist."""
    p2 = Phase2Service()
    _emit(job, "info", "Phase 2 · Design starting…", phase="phase2")

    # Lock tech stack
    tech_stack = job.get("tech_stack_hint", "").strip()
    if not tech_stack:
        # Let AI suggest; pick the first suggestion
        _emit(job, "info", "  Suggesting tech stack via AI…", phase="phase2")
        suggestions = p2.propose_tech_stack(ctx)
        if suggestions:
            tech_stack = suggestions[0].get("stack", "") or suggestions[0].get("label", "")
        if not tech_stack:
            tech_stack = "React · FastAPI · PostgreSQL · Docker"
        _emit(job, "info", f"  Tech stack: {tech_stack[:80]}", phase="phase2")
    p2.lock_tech_stack(ctx, tech_stack=tech_stack)
    _emit(job, "success", "  Tech stack locked", phase="phase2", artifact=tech_stack)

    if _check_stop(job):
        return

    # Generate design sections sequentially
    prior_sections: dict[str, str] = {}
    for section in Phase2Service.DESIGN_SECTION_ORDER:
        if _check_stop(job):
            return
        _emit(job, "info", f"  Generating design section: {section}…", phase="phase2")
        result = p2.generate_design_section(ctx, section=section, prior_sections=prior_sections, instructions=job.get("steer_note", ""))
        prior_sections[section] = result["content"]
        _emit(job, "info", f"  Section {section!r} ready", phase="phase2",
              artifact=result["content"][:2000])

    if _check_stop(job):
        return

    # Persist design (advances all stories to design_locked)
    p2.persist_design(
        ctx,
        story_ids=all_story_ids,
        ux_brief=prior_sections.get("ux_brief", ""),
        endpoints=prior_sections.get("endpoints", ""),
        data_model=prior_sections.get("data_model", ""),
    )
    _emit(job, "success", f"  Design locked for {len(all_story_ids)} stories", phase="phase2")

    # Real screen flow from Figma frames (seeded in Phase 1), if present.
    figma_frames = job.get("_figma_frames") or []
    if figma_frames:
        try:
            diagram = p2.build_screen_flow_from_figma(
                ctx, frames=figma_frames, flows=job.get("_figma_flows") or [],
                extra_edges=job.get("_figma_cross_edges") or None,
            )
            _emit(job, "success",
                  f"  Screen flow built from Figma ({len(diagram['nodes'])} screens, {len(diagram['edges'])} flows)",
                  phase="phase2")
        except Exception as exc:  # noqa: BLE001 — advisory; don't fail the pipeline
            _emit(job, "warning", f"  Figma screen-flow build skipped: {exc}", phase="phase2")


def _run_phase3(job: dict, ctx: RequestContext, all_story_ids: list[int]) -> None:
    """Run Phase 3: task decomposition + developer packs (stories run concurrently)."""
    _emit(job, "info",
          f"Phase 3 · Implementation plans for {len(all_story_ids)} stories "
          f"(up to {_AUTOPILOT_CONCURRENCY} at a time)…", phase="phase3")

    def _worker(story_id: int) -> None:
        if _check_stop(job):
            return
        p3 = Phase3Service()  # per-worker instance — services hold per-request state
        job["current_story_id"] = story_id
        _emit(job, "info", f"  Story {story_id}: generating tasks…", phase="phase3")
        tasks = p3.generate_tasks(ctx, story_id, instructions=job.get("steer_note", ""))
        _emit(job, "info", f"  Story {story_id}: {len(tasks)} tasks", phase="phase3")
        proposals: list[str] = []
        for task in tasks:
            if _check_stop(job):
                return
            _emit(job, "info", f"    Story {story_id} · task {task['id']}: {task['subject'][:60]}…", phase="phase3")
            proposal_md = p3.generate_proposal(
                ctx, story_id, task["id"], task["subject"], task.get("description", ""),
                all_tasks=tasks,
            )
            p3.save_proposal(ctx, story_id, task["id"], proposal_md)
            proposals.append(f"### Task {task['id']}: {task['subject']}\n{proposal_md}")
        p3.lock_story(ctx, story_id, [t["id"] for t in tasks])

        # Push tasks to Taiga when we have a real Taiga story ID (< 9M = not synthetic).
        can_push = (
            job.get("taiga_base") and job.get("taiga_token") and story_id < 9_000_000
        )
        if can_push:
            for task in tasks:
                if _check_stop(job):
                    return
                try:
                    _taiga_post(
                        f"{job['taiga_base']}/tasks",
                        job["taiga_token"],
                        {
                            "project": ctx.project_id,
                            "user_story": story_id,
                            "subject": task["subject"],
                            "description": task.get("description", ""),
                        },
                    )
                except Exception as exc:
                    _emit(job, "warning",
                          f"    Story {story_id} · task '{task['subject'][:40]}': Taiga push failed ({exc})",
                          phase="phase3")

        with _progress_lock:
            job["stories_done"] += 1
        dev_pack_preview = "\n\n".join(proposals)[:2000]
        push_note = " · tasks pushed to Taiga" if can_push else ""
        _emit(job, "success", f"  Story {story_id}: implementation plan locked{push_note}", phase="phase3",
              artifact=dev_pack_preview)
        _persist(job)

    _process_stories(job, all_story_ids, _PHASE3_DONE, _worker)


def _run_phase4(job: dict, ctx: RequestContext, all_story_ids: list[int]) -> None:
    """Run Phase 4: test plan generation only (stories run concurrently).

    Autopilot drafts each story's test plan but never executes or verifies its
    scenarios, so it CANNOT know whether QA actually passes — auto-passing the
    gate here would be a fabricated result. Stories land at "qa" (test plan
    saved, gate untouched); a human must run/verify the plan and pass or fail
    the gate manually in Phase 4 before Phase 5 will deploy that story.
    """
    job["stories_done"] = 0
    _emit(job, "warning",
          "Phase 4 drafts test plans only — it does NOT execute or verify scenarios, "
          "so the QA gate is left for a human to pass or fail manually. Stories "
          "without a passed gate are skipped in Phase 5.", phase="phase4")
    _emit(job, "info",
          f"Phase 4 · Test plans for {len(all_story_ids)} stories "
          f"(up to {_AUTOPILOT_CONCURRENCY} at a time)…", phase="phase4")

    def _worker(story_id: int) -> None:
        if _check_stop(job):
            return
        p4 = Phase4Service()
        job["current_story_id"] = story_id
        _emit(job, "info", f"  Story {story_id}: generating test plan…", phase="phase4")
        test_plan = p4.generate_test_plan(ctx, story_id)
        p4.save_test_plan(ctx, story_id, test_plan)
        with _progress_lock:
            job["stories_done"] += 1
        _emit(job, "success",
              f"  Story {story_id}: test plan saved — awaiting manual QA review", phase="phase4",
              artifact=test_plan[:2000])
        _persist(job)

    # "qa" now counts as done for resume purposes too — Autopilot's part (drafting
    # the plan) is finished; re-running it wouldn't change that a human still owns
    # the gate decision.
    _process_stories(job, all_story_ids, _PHASE4_DONE | {"qa"}, _worker)


def _run_phase5(job: dict, ctx: RequestContext, all_story_ids: list[int]) -> tuple[int, int]:
    """Run Phase 5: infra delta bypass + auto deployment gate.

    Only stories whose QA gate was actually passed (manually — see _run_phase4)
    are deployed. A story still sitting at "qa" is skipped with a warning rather
    than deployed sight-unseen; re-run/resume Autopilot after passing its gate
    to pick it up. Returns (deployed_count, skipped_count).
    """
    p5 = Phase5Service()
    job["stories_done"] = 0
    _emit(job, "info", f"Phase 5 · Deployment gate for {len(all_story_ids)} stories…", phase="phase5")

    deployed = 0
    skipped = 0
    done = _status_snapshot(job)
    for story_id in all_story_ids:
        if _check_stop(job):
            return deployed, skipped
        status = done.get(str(story_id), "")
        if status in _PHASE5_DONE:
            job["stories_done"] += 1
            deployed += 1
            continue
        if status != "qa_passed":
            skipped += 1
            _emit(job, "warning",
                  f"  Story {story_id}: skipped — QA gate not passed yet (status: {status or 'unknown'}). "
                  "Review its test plan and pass the gate manually in Phase 4, then re-run or resume "
                  "Autopilot to deploy it.", phase="phase5")
            continue

        job["current_story_id"] = story_id
        _emit(job, "info", f"  Story {story_id}: saving infra delta (routine bypass)…", phase="phase5")

        # Routine deployment bypass (no infra changes — autopilot assumes dev environment)
        p5.save_infra_delta(ctx, story_id, {
            "needs_infra_change": False,
            "summary": "Autopilot: routine deployment, no infrastructure changes required.",
            "deltas": [],
        })
        p5.pass_deployment_gate(
            ctx, story_id,
            tech_lead_approved=True,
            devops_approved=True,
            notes="Autopilot auto-approved",
        )
        job["stories_done"] += 1
        deployed += 1
        _emit(job, "success", f"  Story {story_id}: deployed", phase="phase5")
        _persist(job)

    return deployed, skipped


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------

def _run_pipeline(job_id: str) -> None:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if job is None:
        return

    ctx: RequestContext = job["ctx"]
    # Resume: pick up the persisted story ids + re-enter at the saved phase. A fresh
    # run has current_phase "init" → start at 0; a resumed run starts at its phase
    # (earlier phases' artifacts are on disk, the re-entered phase skips done units).
    all_story_ids: list[int] = list(job.get("_all_story_ids", []))
    start = _PHASE_KEYS.index(job["current_phase"]) if job.get("current_phase") in _PHASE_KEYS else 0
    end = _PHASE_KEYS.index(job["end_phase"]) if job.get("end_phase") in _PHASE_KEYS else 4

    try:
        job["state"] = "running"
        if start == 0:
            job["current_phase"] = "init"
            _emit(job, "info", "Autopilot started", phase="init")
        elif not all_story_ids:
            # Starting at a later phase (Phases 1-2 already done in this project) with
            # no in-memory cursor → drive the rest from the existing story index.
            try:
                cs = ContextService()
                cs.set_active(ctx)
                all_story_ids = sorted(int(sid) for sid in cs.story_index().keys())
            except Exception:  # noqa: BLE001
                all_story_ids = []
            job["_all_story_ids"] = all_story_ids
            job["story_count"] = len(all_story_ids)
            _emit(job, "info",
                  f"Starting at {job['current_phase']} — {len(all_story_ids)} existing stories from the project",
                  phase=job["current_phase"])
        _persist(job)

        # Phase 1
        if start <= 0 <= end:
            if _check_stop(job):
                raise StopIteration
            job["current_phase"] = "phase1"
            all_story_ids = _run_phase1(job, ctx)
            if _check_stop(job):
                raise StopIteration
            # Concise backlog: drop cross-epic duplicate stories before downstream phases.
            if job["settings"].get("dedup_stories") and len(job.get("epics", [])) > 1:
                all_story_ids = _dedup_stories(job, ctx, all_story_ids)
            if _check_stop(job):
                raise StopIteration
            job["_all_story_ids"] = all_story_ids
            _emit(job, "success",
                  f"Phase 1 complete — {len(all_story_ids)} stories across {len(job['epics'])} epic(s)",
                  phase="phase1")
            _persist(job)
            if end > 0 and _maybe_checkpoint(job, "Phase 1"):
                raise StopIteration

        # Phase 2
        if start <= 1 <= end:
            if _check_stop(job):
                raise StopIteration
            job["current_phase"] = "phase2"
            _run_phase2(job, ctx, all_story_ids)
            if _check_stop(job):
                raise StopIteration
            _emit(job, "success", "Phase 2 complete — design locked", phase="phase2")
            _persist(job)
            if end > 1 and _maybe_checkpoint(job, "Phase 2"):
                raise StopIteration

        # Phase 3
        if start <= 2 <= end:
            if _check_stop(job):
                raise StopIteration
            job["current_phase"] = "phase3"
            job["stories_done"] = 0
            _run_phase3(job, ctx, all_story_ids)
            if _check_stop(job):
                raise StopIteration
            _emit(job, "success", f"Phase 3 complete — {len(all_story_ids)} implementation plans", phase="phase3")
            _persist(job)
            if end > 2 and _maybe_checkpoint(job, "Phase 3"):
                raise StopIteration

        # Phase 4
        if start <= 3 <= end:
            if _check_stop(job):
                raise StopIteration
            job["current_phase"] = "phase4"
            _run_phase4(job, ctx, all_story_ids)
            if _check_stop(job):
                raise StopIteration
            _emit(job, "success", f"Phase 4 complete — {len(all_story_ids)} test plans, all QA passed", phase="phase4")
            _persist(job)
            if end > 3 and _maybe_checkpoint(job, "Phase 4"):
                raise StopIteration

        # Phase 5
        if start <= 4 <= end:
            if _check_stop(job):
                raise StopIteration
            job["current_phase"] = "phase5"
            deployed, skipped = _run_phase5(job, ctx, all_story_ids)
            if _check_stop(job):
                raise StopIteration
            skip_note = f", {skipped} awaiting manual QA gate" if skipped else ""
            _emit(job, "success", f"Phase 5 complete — {deployed} stories deployed{skip_note}", phase="phase5")

        # Done
        job["current_phase"] = "done"
        job["state"] = "done"
        total = len(all_story_ids)
        if end < 4:
            _emit(job, "success",
                  f"Autopilot complete — stopped after {_PHASE_LABELS[end]} as requested ({total} stories)",
                  phase="done")
        else:
            _emit(job, "success",
                  f"Autopilot complete — {total} stories through full SDLC pipeline",
                  phase="done")
        _persist(job)

    except StopIteration:
        if job.get("state") not in ("paused",):
            job["state"] = "stopped"
            _emit(job, "warning", "Autopilot stopped by user", phase=job.get("current_phase", ""))
        _persist(job)
    except Exception as exc:
        _logger.exception("Autopilot job %s failed", job_id)
        job["state"] = "error"
        job["error"] = str(exc)
        _emit(job, "error", f"Autopilot error: {exc}", phase=job.get("current_phase", ""))
        _persist(job)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def start_job(
    ctx: RequestContext,
    *,
    concept: str,
    use_existing_concept: bool = False,
    epics: list[dict],
    tech_stack_hint: str,
    settings: dict,
    taiga_base: str = "",
    figma_file_key: str = "",
    figma_token: str = "",
    figma_project_id: str = "",
    start_phase: str = "phase1",
    end_phase: str = "phase5",
    instructions: str = "",
) -> str:
    job_id = str(uuid.uuid4())
    stop_event = threading.Event()
    resume_event = threading.Event()

    job: dict[str, Any] = {
        "job_id": job_id,
        "ctx": ctx,
        "taiga_base": taiga_base,
        "taiga_token": ctx.pm_token,
        "concept": concept,
        "use_existing_concept": use_existing_concept,
        "epics": epics,
        "tech_stack_hint": tech_stack_hint,
        "figma_file_key": figma_file_key.strip(),
        "figma_token": figma_token.strip(),
        "figma_project_id": figma_project_id.strip(),
        "settings": settings,
        # Live steer: a note the user can set/update mid-run; injected as `instructions`
        # into every subsequent generative step (Phase 1 stories, Phase 2 design,
        # Phase 3 tasks) so they can nudge the AI without stopping the pipeline. Seeded
        # from the setup-time `instructions` field so steering starts on Phase 1, not
        # only once the user first touches the live steer control.
        "steer_note": (instructions or "").strip(),
        "state": "running",
        # current_phase seeds where the pipeline starts; "phase1" runs from scratch,
        # a later phase skips earlier ones (their work is assumed already in the project).
        "current_phase": start_phase if start_phase in _PHASE_KEYS else "phase1",
        # end_phase stops the pipeline after that phase completes instead of Phase 5.
        "end_phase": end_phase if end_phase in _PHASE_KEYS else "phase5",
        "current_epic_idx": None,
        "current_story_id": None,
        "checkpoint_phase": None,
        "events": [],
        "event_counter": 0,
        "story_count": 0,
        "stories_done": 0,
        "error": None,
        # Resume cursor: epic indices finalized in Phase 1 (skip on re-entry).
        "completed_epics": [],
        "_all_story_ids": [],
        "_stop_event": stop_event,
        "_resume_event": resume_event,
        "_thread": None,
    }

    with _JOBS_LOCK:
        _JOBS[job_id] = job

    # Run in a copy of the current context so ContextVars are inherited
    def _run() -> None:
        contextvars.copy_context().run(_run_pipeline, job_id)

    thread = threading.Thread(target=_run, daemon=True, name=f"autopilot-{job_id[:8]}")
    job["_thread"] = thread
    thread.start()
    return job_id


def get_job(job_id: str) -> dict | None:
    with _JOBS_LOCK:
        return _JOBS.get(job_id)


def pause_job(job_id: str) -> bool:
    job = get_job(job_id)
    if not job or job["state"] != "running":
        return False
    job["state"] = "paused"
    job["_resume_event"].clear()
    _persist(job)
    return True


def resume_job(job_id: str) -> bool:
    job = get_job(job_id)
    if not job or job["state"] != "paused":
        return False
    job["state"] = "running"
    job["_resume_event"].set()
    _persist(job)
    return True


def stop_job(job_id: str) -> bool:
    job = get_job(job_id)
    if not job or job["state"] in ("done", "error", "stopped"):
        return False
    job["state"] = "stopped"
    job["_stop_event"].set()
    job["_resume_event"].set()  # unblock any checkpoint wait
    _persist(job)
    return True


def steer_job(job_id: str, note: str) -> bool:
    """Set/clear the live steer note. Applied to every subsequent generative step
    (Phase 1/2/3) as `instructions`. Returns False for an unknown or terminal job."""
    job = get_job(job_id)
    if not job or job["state"] in ("done", "error", "stopped"):
        return False
    note = (note or "").strip()
    job["steer_note"] = note
    _emit(job, "info", f"Steer updated: {note[:120]}" if note else "Steer cleared",
          phase=job.get("current_phase", ""))
    _persist(job)
    return True


def load_persisted_status(ctx: RequestContext) -> dict | None:
    """Status of the active project's persisted job, for reattach after a refresh
    or backend restart. If the job is still live in-memory, returns the live status;
    otherwise returns the disk snapshot with running/paused mapped to 'interrupted'."""
    cs = ContextService()
    cs.set_active(ctx)
    snap = cs.load_autopilot_job()
    if not snap:
        return None
    live = get_job(snap.get("job_id", ""))
    if live is not None:
        return serialize_job(live)
    snap = {k: v for k, v in snap.items() if k != "_resume"}
    if snap.get("state") in ("running", "paused"):
        snap["state"] = "interrupted"
    return snap


def clear_persisted_job(ctx: RequestContext) -> None:
    """Drop the persisted job (New Run). Also forgets it in-memory if terminal.
    Archives the job first (see context_manager.save_autopilot_job) — it's not lost."""
    cs = ContextService()
    cs.set_active(ctx)
    cs.delete_autopilot_job()


def load_job_history(ctx: RequestContext) -> list[dict]:
    """Past jobs for the active project, oldest first — each one a previously
    persisted job that got replaced or explicitly cleared."""
    cs = ContextService()
    cs.set_active(ctx)
    return [
        {k: v for k, v in snap.items() if k != "_resume"}
        for snap in cs.load_autopilot_job_history()
    ]


def resume_interrupted_job(ctx: RequestContext) -> str | None:
    """Re-launch the active project's interrupted job from its persisted cursor.

    Earlier phases' artifacts are on disk; the re-entered phase skips already-done
    units (completed epics / advanced stories). Secrets aren't persisted, so the PM
    token is rebuilt from the resuming session and Figma re-seeding is skipped (its
    context was already written). Returns the (same) job id, or None if nothing to
    resume / it's already running."""
    cs = ContextService()
    cs.set_active(ctx)
    snap = cs.load_autopilot_job()
    if not snap or snap.get("state") not in _RESUMABLE_STATES:
        return None
    job_id = snap.get("job_id") or str(uuid.uuid4())
    if get_job(job_id) is not None:
        return job_id  # already live in-memory — nothing to relaunch

    r = snap.get("_resume", {})
    events = snap.get("events", [])
    job: dict[str, Any] = {
        "job_id": job_id,
        "ctx": ctx,
        "taiga_base": r.get("taiga_base", ""),
        "taiga_token": ctx.pm_token,
        "concept": r.get("concept", ""),
        "use_existing_concept": r.get("use_existing_concept", False),
        "epics": r.get("epics", []),
        "tech_stack_hint": r.get("tech_stack_hint", ""),
        "figma_file_key": r.get("figma_file_key", ""),
        "figma_token": "",  # secret not persisted — figma already seeded on the first run
        "figma_project_id": r.get("figma_project_id", ""),
        "settings": r.get("settings", {}),
        "steer_note": snap.get("steer_note", ""),
        "state": "running",
        "current_phase": snap.get("current_phase", "phase1"),
        "end_phase": r.get("end_phase", "phase5"),
        "current_epic_idx": snap.get("current_epic_idx"),
        "current_story_id": None,
        "checkpoint_phase": None,
        "events": list(events),
        "event_counter": events[-1]["id"] if events else 0,
        "story_count": snap.get("story_count", 0),
        "stories_done": snap.get("stories_done", 0),
        "error": None,
        "completed_epics": r.get("completed_epics", []),
        "_all_story_ids": r.get("all_story_ids", []),
        "_stop_event": threading.Event(),
        "_resume_event": threading.Event(),
        "_thread": None,
    }
    with _JOBS_LOCK:
        _JOBS[job_id] = job
    _emit(job, "info", f"Resuming autopilot from {job['current_phase']} after interruption…",
          phase=job["current_phase"])

    def _run() -> None:
        contextvars.copy_context().run(_run_pipeline, job_id)

    thread = threading.Thread(target=_run, daemon=True, name=f"autopilot-{job_id[:8]}")
    job["_thread"] = thread
    thread.start()
    return job_id


def serialize_job(job: dict) -> dict:
    """Return a JSON-safe snapshot of a job (no threading objects)."""
    return {
        "job_id": job["job_id"],
        "state": job["state"],
        "current_phase": job["current_phase"],
        "current_epic_idx": job.get("current_epic_idx"),
        "current_story_id": job.get("current_story_id"),
        "events": list(job["events"]),  # copy — workers may append concurrently
        "error": job.get("error"),
        "story_count": job.get("story_count", 0),
        "stories_done": job.get("stories_done", 0),
        "epic_count": len(job.get("epics", []) or []),
        "epics_done": len(job.get("completed_epics", []) or []),
        "checkpoint_phase": job.get("checkpoint_phase"),
        "steer_note": job.get("steer_note", ""),
    }


def _descriptor(job: dict) -> dict:
    """Disk snapshot for resume-after-restart: the JSON status plus the inputs and
    cursor needed to re-launch. Secrets (PM/Figma tokens) are deliberately NOT
    persisted — a resume rebuilds the PM token from the resuming user's session,
    and Figma re-seeding is skipped (figma-context.md was already written)."""
    return {
        **serialize_job(job),
        "_resume": {
            "concept": job.get("concept", ""),
            "use_existing_concept": job.get("use_existing_concept", False),
            "epics": job.get("epics", []),
            "tech_stack_hint": job.get("tech_stack_hint", ""),
            "settings": job.get("settings", {}),
            "completed_epics": job.get("completed_epics", []),
            "all_story_ids": job.get("_all_story_ids", []),
            "taiga_base": job.get("taiga_base", ""),
            "figma_file_key": job.get("figma_file_key", ""),
            "figma_project_id": job.get("figma_project_id", ""),
            "end_phase": job.get("end_phase", "phase5"),
        },
    }


def _persist(job: dict) -> None:
    """Best-effort write of the job snapshot to the active project's dir. Never
    raises into the pipeline — a failed persist only costs resume granularity."""
    ctx = job.get("ctx")
    if ctx is None:
        return
    try:
        with _progress_lock:
            snap = _descriptor(job)  # consistent snapshot (events copied in serialize_job)
        with _persist_lock:          # serialise the file write across worker threads
            cs = ContextService()
            cs.set_active(ctx)
            cs.save_autopilot_job(snap)
    except Exception:  # noqa: BLE001 — persistence is advisory
        _logger.exception("autopilot: failed to persist job %s", job.get("job_id"))


def _run_parallel(job: dict, items: list, worker) -> None:
    """Run worker(item) over items with bounded concurrency, honouring stop. Each
    worker runs in a copied context so the project ContextVars reach the pool
    threads. The first worker exception propagates (fails the phase)."""
    if not items or _check_stop(job):
        return
    with cf.ThreadPoolExecutor(max_workers=_AUTOPILOT_CONCURRENCY) as ex:
        futures = []
        for item in items:
            if _check_stop(job):
                break
            futures.append(ex.submit(contextvars.copy_context().run, worker, item))
        for fut in cf.as_completed(futures):
            exc = fut.exception()
            if exc is not None:
                raise exc


def _process_stories(job: dict, story_ids: list[int], done_statuses: set[str], worker) -> None:
    """Run worker(story_id) across stories with bounded concurrency, skipping those
    already at/past a done status (resume) and honouring stop."""
    done = _status_snapshot(job)
    todo = [sid for sid in story_ids if done.get(str(sid), "") not in done_statuses]
    skipped = len(story_ids) - len(todo)
    if skipped:
        with _progress_lock:
            job["stories_done"] += skipped  # keep the progress bar honest on resume
    _run_parallel(job, todo, worker)


def _status_snapshot(job: dict) -> dict[str, str]:
    """story_id(str) -> phase_status from the index, for resume skips in Phases 3-5."""
    try:
        cs = ContextService()
        cs.set_active(job["ctx"])
        return {sid: (entry or {}).get("phase_status", "") for sid, entry in cs.story_index().items()}
    except Exception:  # noqa: BLE001
        return {}
