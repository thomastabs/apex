#!/usr/bin/env python3
"""Smoke-test Plane Cloud's member invite/add/role/remove flow via Apex's proxy.

The only manual step is accepting the workspace invite email. The script then
continues polling Plane Cloud until the invited email appears as a workspace
member, adds that account to a throwaway project, changes its role, removes it,
and verifies Apex-facing inactive-row filtering expectations.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


GUEST = 5
MEMBER = 15
ADMIN = 20
ASSIGNABLE_ROLES = {GUEST: "Guest", MEMBER: "Member", ADMIN: "Admin"}


@dataclass(frozen=True)
class Config:
    apex_url: str
    plane_url: str
    pat: str
    workspace: str
    invite_email: str
    existing_email: str
    keep_project: bool
    poll_seconds: int
    poll_interval: int


class SmokeError(RuntimeError):
    pass


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def load_config() -> Config:
    missing = [name for name in ("PLANE_PAT", "PLANE_WORKSPACE_SLUG", "PLANE_INVITE_EMAIL") if not env(name)]
    if missing:
        raise SmokeError(
            "Missing required env vars: "
            + ", ".join(missing)
            + "\nExample:\n"
            + "  PLANE_PAT=... PLANE_WORKSPACE_SLUG=my-workspace "
            + "PLANE_INVITE_EMAIL=tomassantostaborda@gmail.com "
            + "python3 scripts/plane-cloud-members-smoke.py"
        )
    return Config(
        apex_url=env("APEX_URL", "http://localhost:8000").rstrip("/"),
        plane_url=env("PLANE_URL", "https://api.plane.so").rstrip("/"),
        pat=env("PLANE_PAT"),
        workspace=env("PLANE_WORKSPACE_SLUG"),
        invite_email=env("PLANE_INVITE_EMAIL").lower(),
        existing_email=env("PLANE_EXISTING_MEMBER_EMAIL").lower(),
        keep_project=env("PLANE_KEEP_SMOKE_PROJECT", "").lower() in {"1", "true", "yes"},
        poll_seconds=int(env("PLANE_INVITE_POLL_SECONDS", "600")),
        poll_interval=int(env("PLANE_INVITE_POLL_INTERVAL", "10")),
    )


def proxy_url(cfg: Config, path: str) -> str:
    return f"{cfg.apex_url}/api/pm/plane/{path.lstrip('/')}"


def request(cfg: Config, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        proxy_url(cfg, path),
        data=data,
        method=method,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Api-Key": cfg.pat,
            "X-Plane-Url": cfg.plane_url,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            if resp.status == 204 or not raw:
                return None
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise SmokeError(f"{method} {path} failed with {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise SmokeError(f"{method} {path} failed: {exc}") from exc


def all_rows(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [row for row in value if isinstance(row, dict)]
    if isinstance(value, dict):
        results = value.get("results")
        if isinstance(results, list):
            return [row for row in results if isinstance(row, dict)]
    return []


def get_all(cfg: Config, path: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    next_path = path
    while next_path:
        page = request(cfg, "GET", next_path)
        rows.extend(all_rows(page))
        next_url = page.get("next") if isinstance(page, dict) else None
        if not next_url:
            break
        parsed = urllib.parse.urlparse(str(next_url))
        prefix = "/api/v1/"
        next_path = parsed.path.split(prefix, 1)[1] if prefix in parsed.path else parsed.path.lstrip("/")
        if parsed.query:
            next_path = f"{next_path}?{parsed.query}"
    return rows


def workspace_member_by_email(cfg: Config, email: str) -> dict[str, Any] | None:
    members = get_all(cfg, f"workspaces/{urllib.parse.quote(cfg.workspace)}/members/")
    for member in members:
        if str(member.get("email", "")).lower() == email.lower():
            return member
    return None


def project_members(cfg: Config, project_id: str) -> list[dict[str, Any]]:
    path = f"workspaces/{urllib.parse.quote(cfg.workspace)}/projects/{project_id}/project-members-lite/"
    return get_all(cfg, path)


def active_project_member_by_email(cfg: Config, project_id: str, email: str) -> dict[str, Any] | None:
    for member in project_members(cfg, project_id):
        if member.get("is_active") is False:
            continue
        if str(member.get("email", "")).lower() == email.lower():
            return member
    return None


def create_project(cfg: Config) -> dict[str, Any]:
    suffix = time.strftime("%H%M%S")
    body = {
        "name": f"Apex Cloud Members Smoke {suffix}",
        "identifier": f"CM{suffix[-4:]}",
        "description": "Temporary Apex Plane Cloud member smoke project. Safe to delete.",
    }
    project = request(cfg, "POST", f"workspaces/{urllib.parse.quote(cfg.workspace)}/projects/", body)
    if not isinstance(project, dict) or not project.get("id"):
        raise SmokeError(f"Project create returned an unexpected payload: {project!r}")
    print(f"PASS Project create: {project['name']} {project['id']}")
    return project


def delete_project(cfg: Config, project_id: str) -> None:
    request(cfg, "DELETE", f"workspaces/{urllib.parse.quote(cfg.workspace)}/projects/{project_id}/")
    print("PASS Project cleanup: deleted temporary smoke project")


def add_project_member(cfg: Config, project_id: str, workspace_member_id: str, role: int) -> str:
    path = f"workspaces/{urllib.parse.quote(cfg.workspace)}/projects/{project_id}/project-members/"
    created = request(cfg, "POST", path, {"member": workspace_member_id, "role": role})
    if not isinstance(created, dict) or not created.get("id"):
        raise SmokeError(f"Project member add returned an unexpected payload: {created!r}")
    return str(created["id"])


def invite_workspace_member(cfg: Config, role: int) -> None:
    path = f"workspaces/{urllib.parse.quote(cfg.workspace)}/invitations/"
    request(cfg, "POST", path, {"email": cfg.invite_email, "role": role})


def update_role(cfg: Config, project_id: str, membership_id: str, role: int) -> None:
    path = f"workspaces/{urllib.parse.quote(cfg.workspace)}/projects/{project_id}/project-members/{membership_id}/"
    request(cfg, "PATCH", path, {"role": role})


def remove_member(cfg: Config, project_id: str, membership_id: str) -> None:
    path = f"workspaces/{urllib.parse.quote(cfg.workspace)}/projects/{project_id}/project-members/{membership_id}/"
    request(cfg, "DELETE", path)


def wait_for_acceptance(cfg: Config) -> dict[str, Any]:
    deadline = time.monotonic() + cfg.poll_seconds
    print(f"Waiting for {cfg.invite_email} to appear as a workspace member...")
    while time.monotonic() < deadline:
        member = workspace_member_by_email(cfg, cfg.invite_email)
        if member:
            print(f"PASS Invite accepted: workspace member id {member.get('id')}")
            return member
        time.sleep(cfg.poll_interval)
    raise SmokeError(
        f"Timed out after {cfg.poll_seconds}s waiting for {cfg.invite_email}. "
        "Accept the Plane invite email, then rerun the script."
    )


def assert_roles() -> None:
    if 20 not in ASSIGNABLE_ROLES or any(name.lower() == "owner" for name in ASSIGNABLE_ROLES.values()):
        raise SmokeError("Assignable role model is wrong: Owner must not be assignable.")
    print("PASS Role model: Guest/Member/Admin only; Owner is not assignable")


def main() -> int:
    cfg = load_config()
    project_id = ""
    try:
        me = request(cfg, "GET", "users/me/")
        print(f"PASS Plane auth through Apex proxy: {me.get('email') if isinstance(me, dict) else 'ok'}")
        assert_roles()

        project = create_project(cfg)
        project_id = str(project["id"])

        if cfg.existing_email:
            existing = workspace_member_by_email(cfg, cfg.existing_email)
            if not existing:
                raise SmokeError(f"Existing member {cfg.existing_email} is not in workspace {cfg.workspace}.")
            membership_id = add_project_member(cfg, project_id, str(existing["id"]), MEMBER)
            print(f"PASS Existing workspace member add: {cfg.existing_email}")
            update_role(cfg, project_id, membership_id, GUEST)
            print("PASS Existing member role change: Member -> Guest")
            remove_member(cfg, project_id, membership_id)
            if active_project_member_by_email(cfg, project_id, cfg.existing_email):
                raise SmokeError("Existing member still appears active after removal.")
            print("PASS Existing member remove: no active project row remains")

        invitee = workspace_member_by_email(cfg, cfg.invite_email)
        if invitee:
            print(
                "NOTE Invite email is already a workspace member; skipping workspace-invite assertion "
                "and testing the second-step project add directly."
            )
        else:
            invite_workspace_member(cfg, MEMBER)
            print(f"PASS Workspace invite sent: {cfg.invite_email} (scope: workspace)")
            input("Accept the Plane Cloud invite in Gmail, then press Enter to continue polling...")
            invitee = wait_for_acceptance(cfg)

        membership_id = add_project_member(cfg, project_id, str(invitee["id"]), MEMBER)
        print(f"PASS Accepted/new workspace member project add: {cfg.invite_email}")
        update_role(cfg, project_id, membership_id, ADMIN)
        print("PASS Invited member role change: Member -> Admin")
        remove_member(cfg, project_id, membership_id)
        if active_project_member_by_email(cfg, project_id, cfg.invite_email):
            raise SmokeError("Invited member still appears active after removal.")
        print("PASS Invited member remove: no active project row remains")
        return 0
    except SmokeError as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        return 1
    finally:
        if project_id and not cfg.keep_project:
            try:
                delete_project(cfg, project_id)
            except SmokeError as exc:
                print(f"WARN Project cleanup failed: {exc}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
