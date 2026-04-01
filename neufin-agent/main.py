import asyncio
import json
import logging
import os
import sys
import subprocess
from contextlib import asynccontextmanager
from datetime import datetime, UTC
from pathlib import Path

import uvicorn
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.logging import LoggingIntegration
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from mcp.server.fastmcp import FastMCP

from core.audit_log import (
    init_db,
    get_open_issues,
    get_fix_history,
    get_issue,
    cache_root_cause,
    dismiss_issue,
    add_false_positive,
    get_weekly_trend,
)
from core.fix_engine import apply_fix as _apply_fix, can_auto_fix, _create_review_pr
from core.scanner import run_all_detectors
from core.runtime_monitor import (
    router as webhook_router,
    init_runtime_db,
    check_railway_health,
    check_vercel_analytics,
    poll_sentry_issues,
    get_runtime_summary,
)
from core.notifier import send_daily_summary, send_weekly_trend

load_dotenv()

_AGENT_SENTRY_ENV: str = os.getenv("ENVIRONMENT", "production")
_AGENT_SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")
_AGENT_PII_KEYS: frozenset = frozenset({"password", "token", "api_key", "fernet_key", "secret"})


def _agent_scrub(obj: object) -> object:
    if isinstance(obj, dict):
        return {k: "[REDACTED]" if k.lower() in _AGENT_PII_KEYS else _agent_scrub(v) for k, v in obj.items()}
    return [_agent_scrub(i) for i in obj] if isinstance(obj, list) else obj


def _agent_before_send(event: dict, _hint: dict) -> dict | None:
    for section in ("request", "extra", "contexts"):
        if section in event:
            event[section] = _agent_scrub(event[section])
    return event


sentry_sdk.init(
    dsn=_AGENT_SENTRY_DSN or None,
    integrations=[
        FastApiIntegration(),
        LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
    ],
    traces_sample_rate=1.0 if _AGENT_SENTRY_ENV in ("development", "dev", "local") else 0.2,
    profiles_sample_rate=0.1,
    environment=_AGENT_SENTRY_ENV,
    release=os.getenv("GIT_COMMIT_SHA") or os.getenv("RAILWAY_GIT_COMMIT_SHA") or "unknown",
    send_default_pii=False,
    before_send=_agent_before_send,
)
sentry_sdk.set_tags({"service": "neufin-agent", "company": "neufin"})

# ── Structured JSON logging ────────────────────────────────────────────────
class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps({
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            **({"exc": self.formatException(record.exc_info)} if record.exc_info else {}),
        })

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JSONFormatter())
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), handlers=[handler])
log = logging.getLogger("neufin-agent")

# ── Git Sync Logic (Railway Fix) ──────────────────────────────────────────
def sync_repository():
    """Clones the target repo into the container at startup to avoid Errno 2."""
    repo = os.getenv("GITHUB_REPO", "stealthg0dd/neufinapk1")
    token = os.getenv("GITHUB_TOKEN", "")
    repo_path = Path("/app/repo_to_scan")
    
    # Ensure parent dir exists
    repo_path.parent.mkdir(parents=True, exist_ok=True)
    
    if not repo_path.exists() or not any(repo_path.iterdir()):
        log.info({"action": "repo_clone_start", "repo": repo})
        try:
            clone_url = f"https://{token}@github.com/{repo}.git" if token else f"https://github.com/{repo}.git"
            subprocess.run(["git", "clone", clone_url, str(repo_path)], check=True)
            log.info({"action": "repo_clone_success", "path": str(repo_path)})
        except subprocess.CalledProcessError as e:
            log.error({"action": "repo_clone_failed", "error": str(e)})
    else:
        log.info({"action": "repo_exists", "path": str(repo_path)})
    
    # Set the environment variable so core.scanner knows where to look
    os.environ["REPO_ROOT"] = str(repo_path.absolute())

# ── MCP Server ─────────────────────────────────────────────────────────────
mcp = FastMCP("neufin-code-health")

@mcp.tool()
async def run_full_scan() -> dict:
    """Scan all three Neufin repos and return a full health report."""
    log.info({"action": "scan_start"})
    report = await run_all_detectors()
    log.info({"action": "scan_complete", "issues": len(report.get("issues", []))})
    return report

@mcp.tool()
async def get_latest_errors(limit: int = 50) -> dict:
    """Return the last N detected issues from the audit log."""
    issues = await get_open_issues(limit=limit)
    return {"issues": issues, "count": len(issues)}

@mcp.tool()
async def apply_fix(issue_id: str) -> dict:
    """Apply a queued fix for the given issue ID."""
    log.info({"action": "apply_fix", "issue_id": issue_id})
    result = await _apply_fix(issue_id)
    return result

@mcp.tool()
async def get_audit_log(limit: int = 100) -> dict:
    """Return fix history from the audit log."""
    history = await get_fix_history(limit=limit)
    return {"history": history, "count": len(history)}

@mcp.tool()
async def dismiss_issue_tool(issue_id: str, reason: str = "") -> dict:
    """Dismiss an issue and optionally suppress similar patterns in future scans."""
    await dismiss_issue(issue_id, reason)
    return {"dismissed": True, "issue_id": issue_id}


@mcp.tool()
async def add_false_positive_tool(
    pattern: str,
    issue_type: str = "",
    file_glob: str = "",
    reason: str = "",
) -> dict:
    """Record a known false-positive pattern so the agent skips it on future scans."""
    fp_id = await add_false_positive(
        pattern,
        issue_type=issue_type or None,
        file_glob=file_glob or None,
        reason=reason,
    )
    return {"created": True, "id": fp_id, "pattern": pattern}


@mcp.tool()
async def get_health_score() -> dict:
    """Return per-repo health scores (0-100)."""
    report_path = Path(__file__).parent / "health_report.json"
    if report_path.exists():
        data = json.loads(report_path.read_text())
        return {"scores": data.get("scores", {}), "generated_at": data.get("generated_at")}
    return {"scores": {}, "generated_at": None, "note": "No scan run yet"}

# ── Scheduler ─────────────────────────────────────────────────────────────
scheduler = AsyncIOScheduler()

async def scheduled_scan():
    # Safety check for repository presence
    repo_path = Path(os.getenv("REPO_ROOT", "/app/repo_to_scan"))
    if not repo_path.exists():
        log.warning({"action": "scan_skip", "reason": "Repository not cloned yet"})
        return

    log.info({"action": "scheduled_scan_start"})
    try:
        await run_all_detectors()
    except Exception as e:
        sentry_sdk.capture_exception(e)
        log.error({"action": "scheduled_scan_error", "error": str(e)})


async def daily_summary_job():
    """Send daily Slack summary — scheduled at 00:00 UTC (08:00 SGT)."""
    report_path = Path(__file__).parent / "health_report.json"
    if not report_path.exists():
        return
    try:
        report = json.loads(report_path.read_text())
        await send_daily_summary(report)
    except Exception as e:
        sentry_sdk.capture_exception(e)
        log.error({"action": "daily_summary_error", "error": str(e)})


async def weekly_trend_job():
    """Send weekly trend report — scheduled Monday 00:00 UTC (08:00 SGT Mon)."""
    try:
        trend = await get_weekly_trend()
        await send_weekly_trend(trend)
    except Exception as e:
        sentry_sdk.capture_exception(e)
        log.error({"action": "weekly_trend_error", "error": str(e)})

# ── App lifespan ───────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Railway/Deployment Sync
    sync_repository()
    
    await init_db()
    await init_runtime_db()
    log.info({"action": "db_init_complete"})

    interval = int(os.getenv("SCAN_INTERVAL_HOURS", "6"))
    scheduler.add_job(scheduled_scan, "interval", hours=interval, id="full_scan")
    scheduler.add_job(check_railway_health, "interval", minutes=5, id="railway_health")
    scheduler.add_job(check_vercel_analytics, "interval", hours=1, id="vercel_analytics")
    scheduler.add_job(poll_sentry_issues, "interval", minutes=5, id="sentry_poll")
    # 08:00 SGT = 00:00 UTC daily
    scheduler.add_job(daily_summary_job, "cron", hour=0, minute=0, id="daily_summary")
    # Weekly trend: Monday 00:00 UTC (08:00 SGT Mon)
    scheduler.add_job(weekly_trend_job, "cron", day_of_week="mon", hour=0, minute=0, id="weekly_trend")
    scheduler.start()
    log.info({"action": "scheduler_started", "interval_hours": interval})

    # Initial scan on startup (non-blocking)
    asyncio.create_task(scheduled_scan())

    yield

    scheduler.shutdown()
    log.info({"action": "shutdown"})

# ── FastAPI App ────────────────────────────────────────────────────────────
app = FastAPI(title="Neufin Code Health Agent", lifespan=lifespan)
app.include_router(webhook_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount MCP server
app.mount("/mcp", mcp.streamable_http_app())

@app.get("/health")
@app.get("/api/health")
async def health():
    score_data = await get_health_score()
    issues = await get_open_issues(limit=50)
    return {
        "status": "ok",
        "ts": datetime.now(UTC).isoformat(),
        "repo_root": os.getenv("REPO_ROOT"),
        "scores": score_data.get("scores", {}),
        "issues": issues,
    }


@app.post("/api/scan/trigger")
async def trigger_scan_api():
    report = await run_all_detectors()
    return {"status": "scan_complete", "report": report}


@app.get("/api/fixes")
async def fixes(limit: int = 50):
    history = await get_fix_history(limit=limit)
    return {"fixes": history}


@app.post("/api/fixes/{issue_id}/apply")
async def apply_fix_endpoint(issue_id: str):
    result = await _apply_fix(issue_id)
    return result


@app.get("/api/score")
async def score_api():
    return await get_health_score()


@app.get("/api/scan")
async def trigger_scan():
    return {
        "note": "Use POST /api/scan/trigger",
    }

@app.get("/api/errors")
async def errors(limit: int = 50):
    issues = await get_open_issues(limit=limit)
    return {"issues": issues, "count": len(issues)}

@app.post("/api/issues/{issue_id}/dismiss")
async def dismiss(issue_id: str, reason: str = ""):
    await dismiss_issue(issue_id, reason)
    return {"dismissed": True, "issue_id": issue_id}


@app.post("/api/false-positives")
async def create_false_positive(pattern: str, issue_type: str = "", file_glob: str = "", reason: str = ""):
    fp_id = await add_false_positive(
        pattern,
        issue_type=issue_type or None,
        file_glob=file_glob or None,
        reason=reason,
    )
    return {"created": True, "id": fp_id}


@app.get("/api/trend/weekly")
async def weekly_trend():
    return await get_weekly_trend()


@app.get("/api/runtime/summary")
async def runtime_summary(hours: int = 24):
    return await get_runtime_summary(hours=hours)

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard():
    widget = Path(__file__).parent / "dashboard" / "widget.html"
    return widget.read_text()


# ── Triage endpoints ───────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str


@app.post("/api/issues/{issue_id}/analyze")
async def analyze_issue_endpoint(issue_id: str):
    """LLM root-cause analysis for an issue. Caches result in DB."""
    issue = await get_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    # Return cached result if available
    if issue.get("root_cause"):
        return {
            "root_cause": issue["root_cause"],
            "confidence": issue.get("root_cause_confidence", "medium"),
            "cached": True,
        }

    # Read ±10 lines of file context
    repo_root = Path(os.getenv("REPO_ROOT", "/app/repo_to_scan"))
    code_context = ""
    try:
        file_path = repo_root / issue["file"]
        if file_path.exists():
            lines = file_path.read_text(errors="ignore").splitlines()
            line_no = max(0, (issue.get("line") or 1) - 1)
            start = max(0, line_no - 10)
            end = min(len(lines), line_no + 11)
            code_context = "\n".join(
                f"{start + i + 1}: {line_text}" for i, line_text in enumerate(lines[start:end])
            )
    except Exception:
        pass

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return {"root_cause": "ANTHROPIC_API_KEY not set", "confidence": "low", "cached": False}

    try:
        import anthropic

        def _call() -> str:
            client = anthropic.Anthropic(api_key=api_key)
            resp = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=200,
                system=(
                    "You are a senior engineer reviewing a bug in the Neufin codebase "
                    "(FastAPI + Next.js + Expo). Be concise. Reply in one sentence."
                ),
                messages=[{
                    "role": "user",
                    "content": (
                        f"Issue: {issue['message']}\n"
                        f"File: {issue['file']}\n"
                        f"Code:\n{code_context}\n\n"
                        "What is the root cause in one sentence?"
                    ),
                }],
            )
            return resp.content[0].text.strip()

        root_cause = await asyncio.to_thread(_call)
        confidence = "high" if issue.get("severity") in ("critical", "high") else "medium"
        await cache_root_cause(issue_id, root_cause, confidence)
        return {"root_cause": root_cause, "confidence": confidence, "cached": False}
    except Exception as exc:
        log.error({"action": "analyze_error", "issue_id": issue_id, "error": str(exc)})
        return {"root_cause": f"Analysis error: {exc}", "confidence": "low", "cached": False}


@app.post("/api/issues/{issue_id}/chat")
async def chat_issue_endpoint(issue_id: str, body: ChatRequest):
    """Ask Claude anything about a specific issue with full context."""
    issue = await get_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return {"answer": "ANTHROPIC_API_KEY not set — cannot call Claude."}

    # Read file context
    repo_root = Path(os.getenv("REPO_ROOT", "/app/repo_to_scan"))
    code_context = ""
    try:
        fp = repo_root / issue["file"]
        if fp.exists():
            lines = fp.read_text(errors="ignore").splitlines()
            line_no = max(0, (issue.get("line") or 1) - 1)
            start = max(0, line_no - 15)
            end = min(len(lines), line_no + 16)
            code_context = "\n".join(
                f"{start + i + 1}: {line_text}" for i, line_text in enumerate(lines[start:end])
            )
    except Exception:
        pass

    context_block = (
        f"Issue ID: {issue_id}\n"
        f"File: {issue.get('file','?')}\nLine: {issue.get('line','?')}\n"
        f"Severity: {issue.get('severity','?')}\nType: {issue.get('type','?')}\n"
        f"Message: {issue.get('message','?')}\n"
        f"Suggested fix: {issue.get('suggested_fix','?')}\n"
        f"Root cause: {issue.get('root_cause','not yet analyzed')}\n\n"
        f"Code context:\n{code_context}"
    )

    try:
        import anthropic

        def _call() -> str:
            client = anthropic.Anthropic(api_key=api_key)
            resp = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=400,
                system=(
                    "You are a senior engineer helping triage issues in the Neufin codebase "
                    "(FastAPI backend, Next.js 15 frontend, Expo mobile). "
                    "Answer concisely and practically. Max 300 tokens."
                ),
                messages=[
                    {"role": "user", "content": f"Context:\n{context_block}\n\nQuestion: {body.question}"},
                ],
            )
            return resp.content[0].text.strip()

        answer = await asyncio.to_thread(_call)
        log.info({"action": "issue_chat", "issue_id": issue_id})
        return {"answer": answer}
    except Exception as exc:
        log.error({"action": "chat_error", "issue_id": issue_id, "error": str(exc)})
        return {"answer": f"Error calling Claude: {exc}"}


@app.post("/api/fixes/apply-safe")
async def apply_safe_endpoint():
    """Auto-fix all issues where auto_fixable=True and requires_human=False."""
    all_issues = await get_open_issues(limit=500)
    safe_issues = [i for i in all_issues if await can_auto_fix(i)]
    applied = failed = skipped = 0
    for issue in safe_issues:
        result = await _apply_fix(issue["id"])
        if result.get("method") == "skipped":
            skipped += 1
        elif result.get("success"):
            applied += 1
        else:
            failed += 1
    log.info({"action": "apply_safe_all", "applied": applied, "failed": failed, "skipped": skipped})
    return {"applied": applied, "failed": failed, "skipped": skipped, "total": len(safe_issues)}


@app.post("/api/fixes/{issue_id}/create-pr")
async def create_pr_endpoint(issue_id: str):
    """Force-create a GitHub review PR for an issue without auto-applying."""
    issue = await get_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    result = await _create_review_pr(issue, issue.get("message", ""))
    return result


@app.post("/api/scan/file")
async def scan_file_endpoint(path: str = Query(..., description="Relative file path")):
    """Run all relevant detectors on a single file and update the DB."""
    import detectors.secret_scanner as _secret
    import detectors.mock_data_detector as _mock
    import detectors.auth_detector as _auth

    repo_root = Path(os.getenv("REPO_ROOT", "/app/repo_to_scan"))
    abs_path = repo_root / path
    if not abs_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    repo = path.split("/")[0] if "/" in path else "unknown"
    raw_issues: list = []

    _secret._scan_file(abs_path, repo, raw_issues)

    if abs_path.suffix.lower() in (".ts", ".tsx", ".js", ".jsx"):
        if not _mock._is_test_file(abs_path):
            _mock._scan_file(abs_path, repo, raw_issues)
        _auth._scan_file(abs_path, raw_issues, set())

    issue_dicts = [i.to_dict() if hasattr(i, "to_dict") else i for i in raw_issues]
    from core.audit_log import upsert_issues
    await upsert_issues(issue_dicts)

    log.info({"action": "scan_file", "path": path, "issues_found": len(issue_dicts)})
    return {"path": path, "issues_found": len(issue_dicts), "issues": issue_dicts}


if __name__ == "__main__":
    # Priority for Railway's dynamic $PORT
    port = int(os.getenv("PORT", os.getenv("AGENT_PORT", "8001")))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)