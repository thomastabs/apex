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

import contextvars
import logging
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


# ---------------------------------------------------------------------------
# Event helpers
# ---------------------------------------------------------------------------

def _emit(job: dict, level: str, msg: str, phase: str = "", artifact: str = "") -> None:
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
          artifact=context_md[:400])


def _seed_figma_project(job: dict, cs: ContextService, token: str) -> None:
    """Stage 3: ingest a whole Figma project → one epic per file, each grounded in its
    own file's frames + images. Aggregates the per-file context into figma-context.md
    and unions the frames (ids namespaced by file key) for the Phase-2 screen flow."""
    project_id = job["figma_project_id"]
    from backend.app.services.figma_fetch import (
        FigmaFetchError,
        build_project_context_markdown,
        fetch_project_designs,
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

    total_imgs = sum(len(b["images"]) for b in bundles)
    _emit(job, "success",
          f"  Figma project seeded — {len(bundles)} files → epics, {total_imgs} frame images",
          phase="phase1", artifact=context_md[:400])


def _run_phase1(job: dict, ctx: RequestContext) -> list[int]:
    """Run Phase 1 for all epics. Returns all story IDs created."""
    p1 = Phase1Service()
    cs = ContextService()
    cs.set_active(ctx)
    cs.init_context()
    cs.write_context_file("project-concept.md", job["concept"])
    _emit(job, "info", "Project concept saved", phase="phase1")
    _seed_figma(job, cs)

    all_story_ids: list[int] = []
    epics: list[dict] = job["epics"]

    for epic_idx, epic in enumerate(epics):
        if _check_stop(job):
            break

        epic_title = epic["title"]
        epic_description = epic.get("description", "")
        job["current_epic_idx"] = epic_idx
        _emit(job, "info", f"Phase 1 · Epic {epic_idx + 1}/{len(epics)}: {epic_title!r}", phase="phase1")

        # Taiga epic creation
        epic_taiga_id: int | None = None
        if job["settings"].get("create_epics_in_taiga") and job.get("taiga_base") and job.get("taiga_token"):
            try:
                taiga_proj_id = ctx.project_id
                result = _taiga_post(
                    f"{job['taiga_base']}/epics",
                    job["taiga_token"],
                    {"project": taiga_proj_id, "subject": epic_title, "description": epic_description},
                )
                epic_taiga_id = result.get("id")
                _emit(job, "info", f"  Created Taiga epic #{epic_taiga_id}", phase="phase1")
            except Exception as exc:
                _emit(job, "warning", f"  Taiga epic creation failed: {exc} — using synthetic ID", phase="phase1")

        epic_id = epic_taiga_id if epic_taiga_id else (epic_idx + 1)

        # Generate NL stories. Project mode (file-as-epic): ground this epic with its
        # OWN file's images; otherwise use the single-file images (today's behaviour).
        epic_file_key = epic.get("_figma_file_key")
        if epic_file_key and job.get("_figma_by_file"):
            epic_images = job["_figma_by_file"].get(epic_file_key, {}).get("images") or None
        else:
            epic_images = job.get("_figma_images") or None
        _emit(job, "info", f"  Generating user stories for {epic_title!r}…", phase="phase1")
        nl_draft, story_count = p1.generate_nl_stories(
            ctx,
            epic_subject=epic_title,
            epic_description=epic_description,
            images=epic_images,
        )
        _emit(job, "info", f"  NL draft ready (~{story_count} stories)", phase="phase1",
              artifact=nl_draft[:500])

        if _check_stop(job):
            break

        # Compile Gherkin
        _emit(job, "info", "  Compiling Gherkin…", phase="phase1")
        stories = p1.compile_gherkin(nl_draft=nl_draft)
        _emit(job, "info", f"  {len(stories)} Gherkin stories compiled", phase="phase1")

        if _check_stop(job):
            break

        # Assign real IDs
        if job["settings"].get("create_epics_in_taiga") and job.get("taiga_base") and job.get("taiga_token") and epic_taiga_id:
            # Create user stories in Taiga and use their IDs
            remapped: list[dict] = []
            for s in stories:
                try:
                    sr = _taiga_post(
                        f"{job['taiga_base']}/userstories",
                        job["taiga_token"],
                        {"project": ctx.project_id, "subject": s["title"], "epic": epic_taiga_id},
                    )
                    remapped.append({**s, "id": sr["id"]})
                except Exception as exc:
                    _emit(job, "warning", f"  Taiga story creation failed: {exc} — using synthetic ID", phase="phase1")
                    remapped.append({**s, "id": _next_synthetic_id()})
            stories = remapped
        else:
            # Assign synthetic IDs (unique across all epics)
            stories = [{**s, "id": _next_synthetic_id()} for s in stories]

        # Finalize
        result = p1.finalize_stories(ctx, epic_id=epic_id, epic_subject=epic_title, stories=stories)
        story_ids = result["story_ids"]
        all_story_ids.extend(story_ids)
        job["story_count"] += len(story_ids)
        _emit(job, "success", f"  Epic {epic_title!r}: {len(story_ids)} stories locked (Gherkin)", phase="phase1")

    return all_story_ids


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
        result = p2.generate_design_section(ctx, section=section, prior_sections=prior_sections)
        prior_sections[section] = result["content"]
        _emit(job, "info", f"  Section {section!r} ready", phase="phase2",
              artifact=result["content"][:400])

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
            )
            _emit(job, "success",
                  f"  Screen flow built from Figma ({len(diagram['nodes'])} screens, {len(diagram['edges'])} flows)",
                  phase="phase2")
        except Exception as exc:  # noqa: BLE001 — advisory; don't fail the pipeline
            _emit(job, "warning", f"  Figma screen-flow build skipped: {exc}", phase="phase2")


def _run_phase3(job: dict, ctx: RequestContext, all_story_ids: list[int]) -> None:
    """Run Phase 3: task decomposition + developer packs."""
    p3 = Phase3Service()
    _emit(job, "info", f"Phase 3 · Implementation plans for {len(all_story_ids)} stories…", phase="phase3")

    for story_id in all_story_ids:
        if _check_stop(job):
            return

        job["current_story_id"] = story_id
        _emit(job, "info", f"  Story {story_id}: generating tasks…", phase="phase3")

        tasks = p3.generate_tasks(ctx, story_id)
        _emit(job, "info", f"  Story {story_id}: {len(tasks)} tasks", phase="phase3")

        for task in tasks:
            if _check_stop(job):
                return
            task_id = task["id"]
            task_subject = task["subject"]
            task_description = task.get("description", "")
            _emit(job, "info", f"    Task {task_id}: {task_subject[:60]}…", phase="phase3")

            proposal_md = p3.generate_proposal(
                ctx, story_id, task_id, task_subject, task_description,
                all_tasks=tasks,
            )
            p3.save_proposal(ctx, story_id, task_id, proposal_md)

        task_ids = [t["id"] for t in tasks]
        p3.lock_story(ctx, story_id, task_ids)
        job["stories_done"] += 1
        _emit(job, "success", f"  Story {story_id}: implementation plan locked", phase="phase3")


def _run_phase4(job: dict, ctx: RequestContext, all_story_ids: list[int]) -> None:
    """Run Phase 4: test plan generation + auto QA pass."""
    p4 = Phase4Service()
    job["stories_done"] = 0
    _emit(job, "info", f"Phase 4 · Test plans for {len(all_story_ids)} stories…", phase="phase4")

    for story_id in all_story_ids:
        if _check_stop(job):
            return

        job["current_story_id"] = story_id
        _emit(job, "info", f"  Story {story_id}: generating test plan…", phase="phase4")

        test_plan = p4.generate_test_plan(ctx, story_id)
        p4.save_test_plan(ctx, story_id, test_plan)
        p4.pass_gate(ctx, story_id)
        job["stories_done"] += 1
        _emit(job, "success", f"  Story {story_id}: QA passed (test plan saved)", phase="phase4",
              artifact=test_plan[:400])


def _run_phase5(job: dict, ctx: RequestContext, all_story_ids: list[int]) -> None:
    """Run Phase 5: infra delta bypass + auto deployment gate."""
    p5 = Phase5Service()
    job["stories_done"] = 0
    _emit(job, "info", f"Phase 5 · Deployment gate for {len(all_story_ids)} stories…", phase="phase5")

    for story_id in all_story_ids:
        if _check_stop(job):
            return

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
        _emit(job, "success", f"  Story {story_id}: deployed", phase="phase5")


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------

def _run_pipeline(job_id: str) -> None:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if job is None:
        return

    ctx: RequestContext = job["ctx"]
    all_story_ids: list[int] = []

    try:
        job["state"] = "running"
        job["current_phase"] = "init"
        _emit(job, "info", "Autopilot started", phase="init")

        # Phase 1
        if _check_stop(job):
            raise StopIteration
        job["current_phase"] = "phase1"
        all_story_ids = _run_phase1(job, ctx)
        if _check_stop(job):
            raise StopIteration
        job["_all_story_ids"] = all_story_ids
        _emit(job, "success",
              f"Phase 1 complete — {len(all_story_ids)} stories across {len(job['epics'])} epic(s)",
              phase="phase1")
        if _maybe_checkpoint(job, "Phase 1"):
            raise StopIteration

        # Phase 2
        if _check_stop(job):
            raise StopIteration
        job["current_phase"] = "phase2"
        _run_phase2(job, ctx, all_story_ids)
        if _check_stop(job):
            raise StopIteration
        _emit(job, "success", "Phase 2 complete — design locked", phase="phase2")
        if _maybe_checkpoint(job, "Phase 2"):
            raise StopIteration

        # Phase 3
        if _check_stop(job):
            raise StopIteration
        job["current_phase"] = "phase3"
        job["stories_done"] = 0
        _run_phase3(job, ctx, all_story_ids)
        if _check_stop(job):
            raise StopIteration
        _emit(job, "success", f"Phase 3 complete — {len(all_story_ids)} implementation plans", phase="phase3")
        if _maybe_checkpoint(job, "Phase 3"):
            raise StopIteration

        # Phase 4
        if _check_stop(job):
            raise StopIteration
        job["current_phase"] = "phase4"
        _run_phase4(job, ctx, all_story_ids)
        if _check_stop(job):
            raise StopIteration
        _emit(job, "success", f"Phase 4 complete — {len(all_story_ids)} test plans, all QA passed", phase="phase4")
        if _maybe_checkpoint(job, "Phase 4"):
            raise StopIteration

        # Phase 5
        if _check_stop(job):
            raise StopIteration
        job["current_phase"] = "phase5"
        _run_phase5(job, ctx, all_story_ids)
        if _check_stop(job):
            raise StopIteration
        _emit(job, "success", f"Phase 5 complete — {len(all_story_ids)} stories deployed", phase="phase5")

        # Done
        job["current_phase"] = "done"
        job["state"] = "done"
        total = len(all_story_ids)
        _emit(job, "success",
              f"Autopilot complete — {total} stories through full SDLC pipeline",
              phase="done")

    except StopIteration:
        if job.get("state") not in ("paused",):
            job["state"] = "stopped"
            _emit(job, "warning", "Autopilot stopped by user", phase=job.get("current_phase", ""))
    except Exception as exc:
        _logger.exception("Autopilot job %s failed", job_id)
        job["state"] = "error"
        job["error"] = str(exc)
        _emit(job, "error", f"Autopilot error: {exc}", phase=job.get("current_phase", ""))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def start_job(
    ctx: RequestContext,
    *,
    concept: str,
    epics: list[dict],
    tech_stack_hint: str,
    settings: dict,
    taiga_base: str = "",
    figma_file_key: str = "",
    figma_token: str = "",
    figma_project_id: str = "",
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
        "epics": epics,
        "tech_stack_hint": tech_stack_hint,
        "figma_file_key": figma_file_key.strip(),
        "figma_token": figma_token.strip(),
        "figma_project_id": figma_project_id.strip(),
        "settings": settings,
        "state": "running",
        "current_phase": "init",
        "current_epic_idx": None,
        "current_story_id": None,
        "checkpoint_phase": None,
        "events": [],
        "event_counter": 0,
        "story_count": 0,
        "stories_done": 0,
        "error": None,
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
    return True


def resume_job(job_id: str) -> bool:
    job = get_job(job_id)
    if not job or job["state"] != "paused":
        return False
    job["state"] = "running"
    job["_resume_event"].set()
    return True


def stop_job(job_id: str) -> bool:
    job = get_job(job_id)
    if not job or job["state"] in ("done", "error", "stopped"):
        return False
    job["state"] = "stopped"
    job["_stop_event"].set()
    job["_resume_event"].set()  # unblock any checkpoint wait
    return True


def serialize_job(job: dict) -> dict:
    """Return a JSON-safe snapshot of a job (no threading objects)."""
    return {
        "job_id": job["job_id"],
        "state": job["state"],
        "current_phase": job["current_phase"],
        "current_epic_idx": job.get("current_epic_idx"),
        "current_story_id": job.get("current_story_id"),
        "events": job["events"],
        "error": job.get("error"),
        "story_count": job.get("story_count", 0),
        "stories_done": job.get("stories_done", 0),
        "checkpoint_phase": job.get("checkpoint_phase"),
    }
