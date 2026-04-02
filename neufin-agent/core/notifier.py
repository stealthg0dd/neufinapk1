
import os
import asyncio
import logging
import textwrap
from datetime import datetime, UTC
import httpx
from fastapi import APIRouter

DASHBOARD_URL = os.getenv("DASHBOARD_URL", "http://localhost:8001/dashboard")

log = logging.getLogger("neufin-agent.notifier")

SLACK_WEBHOOK = os.getenv("SLACK_WEBHOOK_URL", "")

# ── Multi-channel webhooks (Prompt 6) ─────────────────────────────────────
# CRITICAL  → #neufin-alerts + #ctech-command
# HIGH      → #neufin-dev
# MEDIUM/LOW→ digest only
SLACK_WEBHOOK_ALERTS = os.getenv("SLACK_WEBHOOK_NEUFIN_ALERTS", "")
SLACK_WEBHOOK_DEV    = os.getenv("SLACK_WEBHOOK_NEUFIN_DEV", "")
SLACK_WEBHOOK_CMD    = os.getenv("SLACK_WEBHOOK_CTECH_COMMAND", "")

# In-memory Slack throttling to prevent noisy startup bursts.
_SLACK_SENT_AT: dict[str, float] = {}
_CRIT_WINDOW_START: float = 0.0
_CRIT_WINDOW_COUNT: int = 0
_THROTTLE_COUNTERS: dict[str, int] = {
    "allowed": 0,
    "suppressed_cooldown": 0,
    "suppressed_burst": 0,
    "skipped_no_webhook": 0,
}

router = APIRouter()


def _allow_slack_event(event_key: str, cooldown_seconds: int) -> bool:
    import time

    now = time.time()
    last = _SLACK_SENT_AT.get(event_key, 0.0)
    if now - last < cooldown_seconds:
        _THROTTLE_COUNTERS["suppressed_cooldown"] += 1
        return False
    _SLACK_SENT_AT[event_key] = now
    _THROTTLE_COUNTERS["allowed"] += 1
    return True


def _allow_critical_burst() -> bool:
    import time

    global _CRIT_WINDOW_START, _CRIT_WINDOW_COUNT

    window_seconds = int(os.getenv("SLACK_CRITICAL_WINDOW_SECONDS", "60"))
    window_limit = int(os.getenv("SLACK_CRITICAL_WINDOW_LIMIT", "6"))
    now = time.time()

    if _CRIT_WINDOW_START == 0.0 or now - _CRIT_WINDOW_START > window_seconds:
        _CRIT_WINDOW_START = now
        _CRIT_WINDOW_COUNT = 0

    if _CRIT_WINDOW_COUNT >= window_limit:
        _THROTTLE_COUNTERS["suppressed_burst"] += 1
        return False

    _CRIT_WINDOW_COUNT += 1
    return True


def get_notifier_throttle_counters() -> dict:
    import time

    window_seconds = int(os.getenv("SLACK_CRITICAL_WINDOW_SECONDS", "60"))
    window_limit = int(os.getenv("SLACK_CRITICAL_WINDOW_LIMIT", "6"))
    cooldown_seconds = int(os.getenv("SLACK_ALERT_COOLDOWN_SECONDS", "900"))
    now = time.time()
    seconds_until_window_reset = 0
    if _CRIT_WINDOW_START:
        seconds_until_window_reset = max(0, int(window_seconds - (now - _CRIT_WINDOW_START)))

    return {
        "enabled": bool(os.getenv("SLACK_WEBHOOK_URL")),
        "counters": dict(_THROTTLE_COUNTERS),
        "config": {
            "cooldown_seconds": cooldown_seconds,
            "critical_window_seconds": window_seconds,
            "critical_window_limit": window_limit,
        },
        "state": {
            "critical_window_count": _CRIT_WINDOW_COUNT,
            "tracked_event_keys": len(_SLACK_SENT_AT),
            "seconds_until_window_reset": seconds_until_window_reset,
        },
    }

async def send_slack(text: str):
    await _post_slack({"text": text})


async def _post_slack_to(url: str, payload: dict) -> None:
    """Post to a specific Slack webhook URL (ignores empty URLs silently)."""
    if not url:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url, json=payload)
            r.raise_for_status()
    except Exception as exc:
        log.error({"action": "slack_error", "error": str(exc)})

# --- GitHub Actions CI Webhook ---
@router.post("/webhooks/github-actions")
async def github_actions_webhook(payload: dict):
    """Receive GitHub Actions failure notifications"""
    workflow = payload.get("workflow", {})
    conclusion = workflow.get("conclusion", "")
    if conclusion == "failure":
        failed_jobs = payload.get("failed_jobs", [])
        message = f"❌ CI FAILED — {payload.get('repo')}\n"
        message += f"Branch: {payload.get('branch')}\n"
        message += f"Failed jobs: {', '.join(failed_jobs)}\n"
        message += "→ Triggering agent scan...\n"
        message += f"View: {payload.get('run_url')}"
        await send_slack(message)
        # Auto-trigger a scan to diagnose
        from core.scanner import run_all_detectors
        asyncio.create_task(run_all_detectors())
    return {"received": True}
"""
notifier.py — Slack webhook alerts + SMTP email for critical issues.

Routing rules (Prompt 6):
  CRITICAL → #neufin-alerts + #ctech-command (immediate)
  HIGH     → #neufin-dev (immediate)
  MEDIUM/LOW → scheduled digest only

Alert functions:
  notify_critical(issue)          — immediate Slack (alerts+command) + email
  notify_high(issue)              — immediate Slack (#neufin-dev)
  notify_fix_applied(issue, pr)   — Slack only
  notify_pr_created(issue, pr)    — Slack only
  notify_scan_complete(report)    — alert if any score < 70
  send_daily_digest(report, open_findings) — 08:30 SGT daily digest
  send_daily_summary(report)      — legacy alias kept for backward compat
  send_weekly_trend(trend)        — Monday 08:00 SGT weekly report
"""

# Email / SMTP
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
ALERT_EMAIL = os.getenv("ALERT_EMAIL", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER)



# ── Internal Slack helpers ────────────────────────────────────────────────
def _sev_emoji(sev: str) -> str:
    return {"critical": ":rotating_light:", "high": ":warning:", "medium": ":large_yellow_circle:", "low": ":white_circle:"}.get(sev, ":question:")

def _send_email(subject: str, body_text: str, body_html: str = "") -> None:
    if not all([SMTP_HOST, SMTP_USER, SMTP_PASS, ALERT_EMAIL]):
        if not getattr(_send_email, "_warned", False):
            log.warning({"action": "email_skip", "reason": "SMTP not fully configured"})
            _send_email._warned = True
        return
    try:
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        import smtplib
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = FROM_EMAIL
        msg["To"] = ALERT_EMAIL
        msg.attach(MIMEText(body_text, "plain"))
        if body_html:
            msg.attach(MIMEText(body_html, "html"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(FROM_EMAIL, [ALERT_EMAIL], msg.as_string())
        log.info({"action": "email_sent", "to": ALERT_EMAIL, "subject": subject})
    except Exception as exc:
        log.error({"action": "email_error", "error": str(exc)})

async def _post_slack(payload: dict) -> None:
    if not SLACK_WEBHOOK:
        if not getattr(_post_slack, "_warned", False):
            log.warning({"action": "slack_skip", "reason": "SLACK_WEBHOOK_URL not set"})
            _post_slack._warned = True
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(SLACK_WEBHOOK, json=payload)
            r.raise_for_status()
        log.info({"action": "slack_sent"})
    except Exception as exc:
        log.error({"action": "slack_error", "error": str(exc)})


# ── Public API ────────────────────────────────────────────────────────────

async def notify_critical(issue: dict, pr_url: str = "", stack_trace: str = "") -> None:
    """Immediate alert for CRITICAL issues — posts to #neufin-alerts + #ctech-command + email."""
    # Require at least one critical channel before throttle check
    if not any([SLACK_WEBHOOK_ALERTS, SLACK_WEBHOOK_CMD, os.getenv("SLACK_WEBHOOK_URL")]):
        _THROTTLE_COUNTERS["skipped_no_webhook"] += 1
        return

    key = f"critical:{issue.get('severity','')}:{issue.get('file','')}:{issue.get('line',0)}:{issue.get('message','')}"
    cooldown = int(os.getenv("SLACK_ALERT_COOLDOWN_SECONDS", "900"))
    if not _allow_slack_event(key, cooldown):
        return
    if not _allow_critical_burst():
        if not getattr(notify_critical, "_burst_warned", False):
            log.warning({"action": "slack_throttle", "reason": "critical_burst_limit"})
            notify_critical._burst_warned = True
        return

    sev = issue.get("severity", "critical")
    emoji = _sev_emoji(sev)
    file_loc = f"`{issue.get('file', '?')}:{issue.get('line', 0)}`"
    message = issue.get("message", "")
    fix_hint = issue.get("suggested_fix", "")
    pr_part = f"\n→ PR: {pr_url} | Requires your review" if pr_url else ""

    slack_text = (
        f"{emoji} *{sev.upper()}* | {file_loc}\n"
        f"*{message}*\n"
        f"Suggested: {fix_hint}"
        f"{pr_part}"
    )
    payload = {"text": slack_text}

    # CRITICAL → #neufin-alerts + #ctech-command (multi-channel)
    await _post_slack_to(SLACK_WEBHOOK_ALERTS, payload)
    await _post_slack_to(SLACK_WEBHOOK_CMD, payload)
    # Fall back to legacy single webhook if multi-channel not configured
    if not (SLACK_WEBHOOK_ALERTS or SLACK_WEBHOOK_CMD):
        await _post_slack(payload)

    # Email for critical only
    if sev == "critical":
        subject = f"\U0001f6a8 [Neufin Agent] Critical: {message[:80]}"
        pr_line = f"PR       : {pr_url}\n" if pr_url else ""
        stack_line = f"Stack trace:\n{stack_trace}\n" if stack_trace else ""
        body = textwrap.dedent(f"""
            CRITICAL issue detected by Neufin Code Health Agent.

            Severity : {sev.upper()}
            Type     : {issue.get('type', '?')}
            File     : {issue.get('file', '?')}:{issue.get('line', 0)}
            Message  : {message}
            Fix hint : {fix_hint}
            {pr_line}{stack_line}
            → Dashboard: {DASHBOARD_URL}
            Issue ID: {issue.get('id', '?')}
            Generated: {datetime.now(UTC).isoformat()}
        """)
        _send_email(subject, body)


async def notify_high(issue: dict, pr_url: str = "") -> None:
    """Immediate alert for HIGH severity issues — posts to #neufin-dev."""
    if not any([SLACK_WEBHOOK_DEV, os.getenv("SLACK_WEBHOOK_URL")]):
        _THROTTLE_COUNTERS["skipped_no_webhook"] += 1
        return

    key = f"high:{issue.get('file','')}:{issue.get('line',0)}:{issue.get('message','')}"
    cooldown = int(os.getenv("SLACK_ALERT_COOLDOWN_SECONDS", "900"))
    if not _allow_slack_event(key, cooldown):
        return

    emoji = _sev_emoji("high")
    file_loc = f"`{issue.get('file', '?')}:{issue.get('line', 0)}`"
    pr_part = f"\n→ PR: {pr_url}" if pr_url else ""
    payload = {
        "text": (
            f"{emoji} *HIGH* | {file_loc}\n"
            f"{issue.get('message', '')}\n"
            f"Suggested: {issue.get('suggested_fix', '')}"
            f"{pr_part}"
        )
    }
    await _post_slack_to(SLACK_WEBHOOK_DEV, payload)
    if not SLACK_WEBHOOK_DEV:
        await _post_slack(payload)




async def notify_fix_applied(issue: dict, pr_url: str = "", method: str = "auto") -> None:
    if not os.getenv("SLACK_WEBHOOK_URL"):
        _THROTTLE_COUNTERS["skipped_no_webhook"] += 1
        return

    key = f"fix_applied:{issue.get('id','')}:{method}:{pr_url}"
    cooldown = int(os.getenv("SLACK_ALERT_COOLDOWN_SECONDS", "900"))
    if not _allow_slack_event(key, cooldown):
        return
    """Slack notification when a HIGH issue is auto-fixed."""
    sev = issue.get("severity", "high")
    if sev not in ("critical", "high"):
        return
    file_loc = f"`{issue.get('file', '?')}:{issue.get('line', 0)}`"
    pr_part = f"→ Diff: {pr_url}" if pr_url else "→ Applied directly"
    text = (
        f":white_check_mark: *Auto-fixed* [{method}] | {file_loc}\n"
        f"{issue.get('message', '')}\n"
        f"{pr_part}"
    )
    await _post_slack({"text": text})


async def notify_pr_created(issue: dict, pr_url: str) -> None:
    if not os.getenv("SLACK_WEBHOOK_URL"):
        _THROTTLE_COUNTERS["skipped_no_webhook"] += 1
        return

    key = f"pr_created:{issue.get('id','')}:{pr_url}"
    cooldown = int(os.getenv("SLACK_ALERT_COOLDOWN_SECONDS", "900"))
    if not _allow_slack_event(key, cooldown):
        return
    """Slack notification when a PR is opened for human review."""
    sev = issue.get("severity", "high")
    emoji = _sev_emoji(sev)
    text = (
        f"{emoji} *PR opened* | `{sev.upper()}`\n"
        f"`{issue.get('file', '?')}:{issue.get('line', 0)}`\n"
        f"{issue.get('message', '')}\n"
        f"→ {pr_url}"
    )
    await _post_slack({"text": text})


async def notify_scan_complete(report: dict) -> None:
    if not os.getenv("SLACK_WEBHOOK_URL"):
        _THROTTLE_COUNTERS["skipped_no_webhook"] += 1
        return

    key = f"scan_complete:{report.get('run_id','')}"
    cooldown = int(os.getenv("SLACK_ALERT_COOLDOWN_SECONDS", "900"))
    if not _allow_slack_event(key, cooldown):
        return
    """Post alert if any score has dropped below 70 after a scan."""
    scores = report.get("scores", {})
    if not any(v < 70 for v in scores.values()):
        return
    counts = report.get("issue_count", {})
    score_lines = " | ".join(f"{repo}: *{score}/100*" for repo, score in scores.items())
    text = (
        f":warning: *Code Health Alert*\n"
        f"{score_lines}\n"
        f":red_circle: {counts.get('critical', 0)} critical  "
        f":large_yellow_circle: {counts.get('high', 0)} high  "
        f":large_green_circle: {counts.get('low', 0)} low\n"
        f"→ {DASHBOARD_URL}"
    )
    await _post_slack({"text": text})


async def send_weekly_trend(trend: dict) -> None:
    if not os.getenv("SLACK_WEBHOOK_URL"):
        return
    """
    Monday 08:00 SGT (00:00 UTC Mon) weekly Slack + email summary.
    `trend` is the dict returned by audit_log.get_weekly_trend().
    """
    if "error" in trend:
        return

    def _delta_str(d: dict) -> str:
        delta = d["delta"]
        arrow = "✅ Improving" if delta > 0 else ("⚠️ Degrading" if delta < 0 else "→ Stable")
        sign = "+" if delta > 0 else ""
        return f"{d['start']} → {d['end']} ({sign}{delta}) {arrow}"

    fix_pct = int(trend.get("fix_success_rate", 0) * 100)
    cost = trend.get("llm_cost_usd", 0)
    prs = trend.get("prs_open", 0)
    top_type = trend.get("top_issue_type", "none")
    top_n = trend.get("top_issue_count", 0)
    date_str = datetime.now(UTC).strftime("%d %b %Y")

    slack_text = (
        f":chart_with_upwards_trend: *Weekly Health Trend \u2014 Neufin* ({date_str})\n"
        f"Backend: {_delta_str(trend['backend'])}\n"
        f"Web:     {_delta_str(trend['web'])}\n"
        f"Mobile:  {_delta_str(trend['mobile'])}\n"
        f"\u2500" * 32 + "\n"
        f"Most common issue this week: `{top_type}` ({top_n} occurrences)\n"
        f"Auto-fix success rate: *{fix_pct}%*\n"
        f"LLM cost this week: ~${cost:.2f} (estimated)\n"
        f"PRs awaiting your review: *{prs}*\n"
        f"\u2192 {DASHBOARD_URL}"
    )
    await _post_slack({"text": slack_text})

    # Email the weekly summary too
    subject = f"📈 [Neufin Agent] Weekly Health Trend — {date_str}"
    body = (
        f"Weekly Health Trend — {date_str}\n\n"
        f"Backend : {_delta_str(trend['backend'])}\n"
        f"Web     : {_delta_str(trend['web'])}\n"
        f"Mobile  : {_delta_str(trend['mobile'])}\n\n"
        f"Most common issue : {top_type} ({top_n})\n"
        f"Auto-fix rate     : {fix_pct}%\n"
        f"LLM cost estimate : ~${cost:.2f}\n"
        f"PRs open          : {prs}\n\n"
        f"Dashboard: {DASHBOARD_URL}\n"
    )
    _send_email(subject, body)


async def send_daily_summary(report: dict, auto_fixed: int = 0, prs_open: int = 0,
                             open_findings: list[dict] | None = None) -> None:
    """
    Daily digest — 08:30 SGT (00:30 UTC). Posts to #neufin-dev.
    Includes per-repo scores, counts, top 5 open findings,
    and flags any unresolved CRITICAL or HIGH items.
    """
    if not any([SLACK_WEBHOOK_DEV, os.getenv("SLACK_WEBHOOK_URL")]):
        return

    scores = report.get("scores", {})
    counts = report.get("issue_count", {})
    date_str = datetime.now(UTC).strftime("%d %b %Y")

    backend_score = scores.get("neufin-backend", "?")
    web_score = scores.get("neufin-web", "?")
    mobile_score = scores.get("neufin-mobile", "?")

    def _score_emoji(v) -> str:
        if not isinstance(v, int):
            return ":grey_question:"
        return ":large_green_circle:" if v >= 80 else (":large_yellow_circle:" if v >= 60 else ":red_circle:")

    # Build top-5 findings block
    top_block = ""
    if open_findings:
        lines = []
        for f in open_findings[:5]:
            sev = f.get("severity", "?").upper()
            emoji = _sev_emoji(f.get("severity", "low"))
            repo = f.get("repo", "?")
            msg = (f.get("message") or "")[:80]
            lines.append(f"  {emoji} [{sev}] {repo}: {msg}")
        top_block = "\n*Top open findings:*\n" + "\n".join(lines)

    # Unresolved CRITICAL/HIGH notice
    unresolved = [f for f in (open_findings or []) if f.get("severity") in ("critical", "high")]
    alert_block = ""
    if unresolved:
        alert_block = (
            f"\n:rotating_light: *{len(unresolved)} unresolved CRITICAL/HIGH "
            f"issue{'s' if len(unresolved) != 1 else ''} require attention*"
        )

    text = (
        f":bar_chart: *Neufin Daily Digest* \u2014 {date_str}\n"
        f"Backend: {_score_emoji(backend_score)} *{backend_score}/100* | "
        f"Web: {_score_emoji(web_score)} *{web_score}/100* | "
        f"Mobile: {_score_emoji(mobile_score)} *{mobile_score}/100*\n"
        f"\u2500" * 32 + "\n"
        f":red_circle: Critical: {counts.get('critical', 0)} | "
        f":large_yellow_circle: High: {counts.get('high', 0)} | "
        f":large_green_circle: Low: {counts.get('low', 0)}\n"
        f":white_check_mark: Auto-fixed: {auto_fixed} | "
        f":clipboard: PRs awaiting review: {prs_open}"
        f"{top_block}"
        f"{alert_block}\n"
        f"\u2192 Dashboard: {DASHBOARD_URL}"
    )
    await _post_slack_to(SLACK_WEBHOOK_DEV, {"text": text})
    if not SLACK_WEBHOOK_DEV:
        await _post_slack({"text": text})


# Backward-compat alias — send_daily_summary used to be the daily job name
send_daily_digest = send_daily_summary

