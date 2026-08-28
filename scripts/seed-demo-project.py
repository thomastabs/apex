#!/usr/bin/env python3
"""Seed (or re-seed) the evaluation study's Demo Project on Taiga.

Creates a project called "Demo Project" with 3 epics and 7 user stories:
6 generic backlog stories, left at Taiga's default status, plus one story
named exactly "Export board to CSV" which Task 8 of the evaluation depends
on staying un-QA'd forever. This script never advances any story's status
past creation - QA state is Apex's concern (story-index.json), not Taiga's,
and this script does not touch Apex at all.

Run this yourself. It prompts for the Taiga password interactively (getpass,
never echoed, never logged, never written to disk) - it is not meant to be
run non-interactively with the password baked into an env var or CLI flag.

Usage:
    python3 scripts/seed-demo-project.py [--taiga-url URL] [--username NAME] [--reset]

    --taiga-url   Taiga API base (default: https://api.taiga.io)
    --username    Taiga username (default: prompts, or $TAIGA_USERNAME)
    --reset       If "Demo Project" already exists for this user, delete it
                  and recreate from scratch. Without this flag, an existing
                  project is left untouched and the script just reports it -
                  safe to re-run before every participant to verify state.

See docs/thesis/evaluation/task-set.md ("Environment, reset before every
participant") for what this is standing in for, and
docs/thesis/evaluation/demo-environment.local.md (gitignored) for the
account this project is seeded under.
"""
from __future__ import annotations

import argparse
import getpass
import os
import sys
import urllib.error
import urllib.request
import json

PROJECT_NAME = "Demo Project"
PROJECT_DESCRIPTION = (
    "Seeded demo project for the Apex usability study. Reset before every "
    "participant - see task-set.md."
)

EPICS = [
    "User onboarding",
    "Search and filtering",
    "Notifications",
]

# (epic index into EPICS, story subject) - 2 stories per epic, 6 total.
FILLER_STORIES = [
    (0, "Guided first-run checklist"),
    (0, "Invite a teammate from onboarding"),
    (1, "Filter results by date range"),
    (1, "Save a search as a preset"),
    (2, "Digest email of unread notifications"),
    (2, "Per-project notification mute"),
]

QA_TRAP_STORY = "Export board to CSV"


def api(base_url: str, method: str, path: str, token: str | None, body: dict | None = None) -> dict:
    url = f"{base_url}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Taiga API error {e.code} on {method} {path}: {detail}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--taiga-url", default=os.environ.get("TAIGA_API_URL") or "https://api.taiga.io")
    parser.add_argument("--username", default=os.environ.get("TAIGA_USERNAME"))
    parser.add_argument("--reset", action="store_true", help="Delete and recreate Demo Project if it already exists")
    args = parser.parse_args()

    base_url = args.taiga_url.rstrip("/") + "/api/v1"
    username = args.username or input("Taiga username: ").strip()
    password = getpass.getpass("Taiga password (not echoed, not stored): ")

    print(f"Authenticating to {args.taiga_url} as {username} ...")
    auth = api(base_url, "POST", "/auth", None, {"type": "normal", "username": username, "password": password})
    token = auth["auth_token"]
    user_id = auth["id"]
    print(f"Signed in as user id {user_id}.")

    existing = api(base_url, "GET", f"/projects?member={user_id}&q={PROJECT_NAME.replace(' ', '%20')}", token)
    existing = [p for p in existing if p["name"] == PROJECT_NAME]

    if existing:
        proj = existing[0]
        if not args.reset:
            print(f"'{PROJECT_NAME}' already exists (id={proj['id']}, slug={proj['slug']}). "
                  f"Leaving it as-is. Re-run with --reset to wipe and recreate.")
            report_state(base_url, token, proj["id"])
            return 0
        print(f"--reset given: deleting existing '{PROJECT_NAME}' (id={proj['id']}) ...")
        api(base_url, "DELETE", f"/projects/{proj['id']}", token)

    print(f"Creating project '{PROJECT_NAME}' ...")
    proj = api(base_url, "POST", "/projects", token, {
        "name": PROJECT_NAME,
        "description": PROJECT_DESCRIPTION,
        "is_private": True,
        "is_backlog_activated": True,
        "is_kanban_activated": True,
        "is_epics_activated": True,
    })
    project_id = proj["id"]
    print(f"Created project id={project_id} slug={proj['slug']}")

    epic_ids = []
    for subject in EPICS:
        epic = api(base_url, "POST", "/epics", token, {"project": project_id, "subject": subject})
        epic_ids.append(epic["id"])
        print(f"  epic: {subject} (id={epic['id']})")

    for epic_idx, subject in FILLER_STORIES:
        story = api(base_url, "POST", "/userstories", token, {"project": project_id, "subject": subject})
        api(base_url, "POST", f"/epics/{epic_ids[epic_idx]}/related_userstories", token,
            {"epic": epic_ids[epic_idx], "user_story": story["id"]})
        print(f"  story: {subject} (id={story['id']}, status={story.get('status_extra_info', {}).get('name')})")

    qa_trap = api(base_url, "POST", "/userstories", token, {"project": project_id, "subject": QA_TRAP_STORY})
    print(f"  story: {QA_TRAP_STORY} (id={qa_trap['id']}, status={qa_trap.get('status_extra_info', {}).get('name')})"
          " -- do not touch this story's status, ever.")

    print()
    print(f"Done. Project URL: {args.taiga_url.replace('api.', '')}/project/{proj['slug']}/")
    report_state(base_url, token, project_id)
    return 0


def report_state(base_url: str, token: str, project_id: int) -> None:
    stories = api(base_url, "GET", f"/userstories?project={project_id}", token)
    trap = [s for s in stories if s["subject"] == QA_TRAP_STORY]
    print()
    print(f"Verification: {len(stories)} stories in project.")
    if not trap:
        print(f"WARNING: '{QA_TRAP_STORY}' story not found - Task 8 will not work. Re-run without --reset skipped, "
              f"or check the project manually.")
    else:
        status = trap[0].get("status_extra_info", {}).get("name")
        print(f"'{QA_TRAP_STORY}' present, Taiga status = '{status}'. "
              f"Confirm in Apex this maps to phase_status 'new' (or at least not 'qa_passed') before every session.")


if __name__ == "__main__":
    sys.exit(main())
