"""Extended GitHub REST metrics for admin repo intelligence."""

from __future__ import annotations

import datetime
import re
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)

GITHUB_API = "https://api.github.com"


def _utc_iso() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


async def fetch_extended_github_metrics(token: str, repo: str) -> dict[str, Any]:
    owner, _, name = repo.partition("/")
    if not name:
        return {"ok": False, "error": "bad repo slug"}
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    base = f"{GITHUB_API}/repos/{owner}/{name}"
    out: dict[str, Any] = {
        "ok": True,
        "repository": repo,
        "last_synced_at": _utc_iso(),
        "source_type": "direct_api",
    }

    try:
        async with httpx.AsyncClient(timeout=35.0) as client:
            r = await client.get(base, headers=headers)
            if r.status_code != 200:
                return {
                    "ok": False,
                    "status": r.status_code,
                    "error": r.text[:300],
                }
            repo_json = r.json()
            out["open_issues_count"] = repo_json.get("open_issues_count")
            out["description"] = repo_json.get("description")
            out["size_kb"] = repo_json.get("size")
            out["forks"] = repo_json.get("forks_count")
            out["stars"] = repo_json.get("stargazers_count")
            out["default_branch"] = repo_json.get("default_branch")
            out["pushed_at"] = repo_json.get("pushed_at")

            lang_r = await client.get(f"{base}/languages", headers=headers)
            langs: dict[str, int] = {}
            if lang_r.status_code == 200:
                langs = {str(k): int(v) for k, v in (lang_r.json() or {}).items()}
            out["languages_bytes"] = langs
            out["languages_total_bytes"] = sum(langs.values()) if langs else None

            part_r = await client.get(f"{base}/stats/participation", headers=headers)
            weeks: list[int] = []
            if part_r.status_code == 200:
                weeks = list((part_r.json() or {}).get("all") or [])[-12:]
            out["commit_activity_last_12_weeks"] = weeks

            # Open PR count (pagination header)
            pr_r = await client.get(
                f"{base}/pulls?state=open&per_page=1",
                headers=headers,
            )
            open_prs = None
            if pr_r.status_code == 200:
                link = pr_r.headers.get("link") or ""
                if 'rel="last"' in link:
                    m = re.search(r"page=(\d+)>; rel=\"last\"", link)
                    if m:
                        open_prs = int(m.group(1))
                elif isinstance(pr_r.json(), list):
                    open_prs = len(pr_r.json())
            out["open_pull_requests"] = open_prs

            # Merged PRs last 30d (search API)
            since = (
                datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=30)
            ).strftime("%Y-%m-%d")
            q = f"repo:{owner}/{name} is:pr is:merged merged:>{since}"
            sr = await client.get(
                GITHUB_API + "/search/issues",
                headers=headers,
                params={"q": q, "per_page": 1},
            )
            merged_30d = None
            if sr.status_code == 200:
                merged_30d = (sr.json() or {}).get("total_count")
            out["merged_pull_requests_30d"] = merged_30d

            # Recent commits (default branch)
            branch = repo_json.get("default_branch") or "main"
            cr = await client.get(
                f"{base}/commits",
                headers=headers,
                params={"sha": branch, "per_page": 10},
            )
            recent_commits: list[dict[str, Any]] = []
            if cr.status_code == 200:
                for c in cr.json() or []:
                    recent_commits.append(
                        {
                            "sha": (c.get("sha") or "")[:7],
                            "message": (c.get("commit") or {})
                            .get("message", "")
                            .split("\n")[0][:120],
                            "date": (c.get("commit") or {})
                            .get("author", {})
                            .get("date"),
                            "author": ((c.get("commit") or {}).get("author") or {}).get(
                                "name"
                            ),
                        }
                    )
            out["recent_commits"] = recent_commits

            # Contributors (expensive endpoint — capped)
            ctr = await client.get(
                f"{base}/contributors",
                headers=headers,
                params={"per_page": 100},
            )
            contributors = None
            if ctr.status_code == 200:
                contributors = len(ctr.json() or [])
            out["contributors_count"] = contributors

            # Branches (first page)
            br = await client.get(
                f"{base}/branches",
                headers=headers,
                params={"per_page": 30},
            )
            branches: list[str] = []
            if br.status_code == 200:
                branches = [b.get("name") for b in br.json() or [] if b.get("name")]
            out["branches_sample"] = branches[:20]
            out["branches_total_hint"] = len(branches)

            # Tags
            tr = await client.get(
                f"{base}/tags",
                headers=headers,
                params={"per_page": 15},
            )
            tags: list[str] = []
            if tr.status_code == 200:
                tags = [t.get("name") for t in tr.json() or [] if t.get("name")]
            out["release_tags_sample"] = tags

            # CI: latest workflow run on default branch
            wr = await client.get(
                f"{base}/actions/runs",
                headers=headers,
                params={"branch": branch, "per_page": 5},
            )
            ci_runs: list[dict[str, Any]] = []
            if wr.status_code == 200:
                for run in (wr.json() or {}).get("workflow_runs") or []:
                    ci_runs.append(
                        {
                            "name": run.get("name"),
                            "status": run.get("status"),
                            "conclusion": run.get("conclusion"),
                            "created_at": run.get("created_at"),
                            "html_url": run.get("html_url"),
                        }
                    )
            out["ci_workflow_runs_recent"] = ci_runs

    except Exception as exc:
        logger.warning("github_metrics.error", error=str(exc))
        return {"ok": False, "error": str(exc)}

    return out
