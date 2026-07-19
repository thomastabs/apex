"""Server-side GitHub Actions dispatch and run status helpers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import re
from typing import Any

import httpx

_GITHUB_API_BASE = "https://api.github.com"
_TIMEOUT = httpx.Timeout(20.0, connect=5.0)
_REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


class GithubActionsError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class GithubRepo:
    owner: str
    repo: str

    @property
    def full_name(self) -> str:
        return f"{self.owner}/{self.repo}"


def parse_repo(full_name: str) -> GithubRepo:
    repo = (full_name or "").strip().removeprefix("https://github.com/").removesuffix(".git")
    if not _REPO_RE.match(repo):
        raise GithubActionsError("GitHub repository must be in owner/repo format.")
    owner, _, name = repo.partition("/")
    return GithubRepo(owner=owner, repo=name)


def workflow_api_id(workflow_id: str | int) -> str:
    raw = str(workflow_id or "").strip()
    if not raw:
        raise GithubActionsError("GitHub Actions workflow is not configured.")
    if raw.isdigit():
        return raw
    # GitHub's workflow_id path parameter accepts the workflow file name, not
    # the full .github/workflows/ path. Keep path support in Apex's UI/config
    # because that is what users naturally paste from the repo tree.
    return raw.rsplit("/", 1)[-1]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class GithubActionsClient:
    def __init__(self, pat: str, repo_full_name: str):
        self.pat = (pat or "").strip()
        if not self.pat:
            raise GithubActionsError("GitHub PAT is not configured for this project.")
        self.repo = parse_repo(repo_full_name)

    def _headers(self) -> dict[str, str]:
        return {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {self.pat}",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        url = f"{_GITHUB_API_BASE}{path}"
        try:
            with httpx.Client(follow_redirects=False, timeout=_TIMEOUT) as client:
                resp = client.request(method, url, headers=self._headers(), **kwargs)
        except httpx.RequestError as exc:
            raise GithubActionsError(f"Failed to reach GitHub Actions: {exc}") from exc
        if resp.status_code in (401, 403):
            raise GithubActionsError("GitHub rejected the token or lacks Actions permissions.", status_code=resp.status_code)
        if resp.status_code == 404:
            raise GithubActionsError("GitHub Actions workflow or repository was not found.", status_code=404)
        if resp.status_code == 422:
            detail = _github_detail(resp)
            raise GithubActionsError(f"GitHub rejected the workflow dispatch: {detail}", status_code=422)
        if resp.status_code >= 400:
            raise GithubActionsError(f"GitHub returned {resp.status_code}: {_github_detail(resp)}", status_code=resp.status_code)
        return resp

    def list_workflows(self) -> list[dict]:
        resp = self._request("GET", f"/repos/{self.repo.full_name}/actions/workflows")
        data = resp.json()
        workflows = data.get("workflows") if isinstance(data, dict) else []
        return workflows if isinstance(workflows, list) else []

    def workflow(self, workflow_id: str | int) -> dict | None:
        api_id = workflow_api_id(workflow_id)
        try:
            resp = self._request("GET", f"/repos/{self.repo.full_name}/actions/workflows/{api_id}")
        except GithubActionsError as exc:
            if exc.status_code == 404:
                return None
            raise
        data = resp.json()
        return data if isinstance(data, dict) else None

    def dispatch(self, workflow_id: str | int, *, ref: str, inputs: dict[str, str]) -> None:
        api_id = workflow_api_id(workflow_id)
        clean_inputs = {str(k): str(v) for k, v in (inputs or {}).items() if str(k).strip()}
        body: dict[str, Any] = {"ref": ref.strip() or "main"}
        if clean_inputs:
            body["inputs"] = clean_inputs
        self._request("POST", f"/repos/{self.repo.full_name}/actions/workflows/{api_id}/dispatches", json=body)

    def list_runs(self, workflow_id: str | int, *, branch: str = "", event: str = "workflow_dispatch", per_page: int = 10) -> list[dict]:
        api_id = workflow_api_id(workflow_id)
        params: dict[str, str | int] = {"per_page": per_page}
        if branch.strip():
            params["branch"] = branch.strip()
        if event.strip():
            params["event"] = event.strip()
        resp = self._request("GET", f"/repos/{self.repo.full_name}/actions/workflows/{api_id}/runs", params=params)
        data = resp.json()
        runs = data.get("workflow_runs") if isinstance(data, dict) else []
        return runs if isinstance(runs, list) else []

    def run(self, run_id: int | str) -> dict | None:
        try:
            resp = self._request("GET", f"/repos/{self.repo.full_name}/actions/runs/{int(run_id)}")
        except (TypeError, ValueError) as exc:
            raise GithubActionsError("Invalid GitHub Actions run id.") from exc
        except GithubActionsError as exc:
            if exc.status_code == 404:
                return None
            raise
        data = resp.json()
        return data if isinstance(data, dict) else None


def _github_detail(resp: httpx.Response) -> str:
    try:
        data = resp.json()
    except ValueError:
        return resp.text[:500]
    if isinstance(data, dict):
        msg = data.get("message")
        if isinstance(msg, str) and msg:
            return msg
        errors = data.get("errors")
        if isinstance(errors, list) and errors:
            return "; ".join(str(e) for e in errors[:3])
    return str(data)[:500]
