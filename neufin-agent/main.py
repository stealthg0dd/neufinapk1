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
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from mcp.server.fastmcp import FastMCP

from core.audit_log import (
    init_db,
    get_open_issues,
    get_fix_history,
    dismiss_issue,
    add_false_positive,
    get_weekly_trend,
)
from core.fix_engine import apply_fix as _apply_fix
from core.scanner import run_all_detectors
from core.runtime_monitor import (
    router as webhook_router,
    init_runtime_db,
    check_railway_health,
    check_vercel_analytics,
    get_runtime_summary,
)
from core.notifier import send_daily_summary, send_weekly_trend

load_dotenv()

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
        log.error({"action": "daily_summary_error", "error": str(e)})


async def weekly_trend_job():
    """Send weekly trend report — scheduled Monday 00:00 UTC (08:00 SGT Mon)."""
    try:
        trend = await get_weekly_trend()
        await send_weekly_trend(trend)
    except Exception as e:
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

if __name__ == "__main__":
    # Priority for Railway's dynamic $PORT
    port = int(os.getenv("PORT", os.getenv("AGENT_PORT", "8001")))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)