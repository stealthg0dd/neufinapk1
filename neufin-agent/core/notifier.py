"""
notifier.py — Slack webhook alerts + SMTP email for critical issues.

Alert triggers:
  notify_critical(issue)          — immediate Slack + email
  notify_fix_applied(issue, pr)   — Slack only (high auto-fix confirmation)
  notify_pr_created(issue, pr)    — Slack only
  notify_scan_complete(report)    — daily summary (always sent if score < 70)
  send_daily_summary(report)      — called by APScheduler at 08:00 SGT (UTC+8 = 00:00 UTC)
"""

import logging
import os
import smtplib
import textwrap
from datetime import datetime, UTC
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

log = logging.getLogger("neufin-agent.notifier")

SLACK_WEBHOOK = os.getenv("SLACK_WEBHOOK_URL", "")
DASHBOARD_URL = os.getenv("DASHBOARD_URL", "http://localhost:8001/dashboard")

# Email / SMTP
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
ALERT_EMAIL = os.getenv("ALERT_EMAIL", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER)


# ── Internal Slack helpers ────────────────────────────────────────────────

async def _post_slack(payload: dict) -> None:
    if not SLACK_WEBHOOK:
        log.warning({"action": "slack_skip", "reason": "SLACK_WEBHOOK_URL not set"})
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(SLACK_WEBHOOK, json=payload)
            r.raise_for_status()
        log.info({"action": "slack_sent"})
    except Exception as exc:
        log.error({"action": "slack_error", "error": str(exc)})


def _sev_emoji(sev: str) -> str:
    return {"critical": ":rotating_light:", "high": ":warning:", "medium": ":large_yellow_circle:", "low": ":white_circle:"}.get(sev, ":question:")


# ── Email helper ──────────────────────────────────────────────────────────

def _send_email(subject: str, body_text: str, body_html: str = "") -> None:
    if not all([SMTP_HOST, SMTP_USER, SMTP_PASS, ALERT_EMAIL]):
        log.warning({"action": "email_skip", "reason": "SMTP not fully configured"})
        return
    try:
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


# ── Public API ────────────────────────────────────────────────────────────

async def notify_critical(issue: dict, pr_url: str = "", stack_trace: str = "") -> None:
    """Immediate alert for critical severity issues — Slack + email."""
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
    await _post_slack({"text": slack_text})

    # Email for critical only
    if sev == "critical":
        subject = f"\U0001f6a8 [Neufin Agent] Critical: {message[:80]}"
        body = textwrap.dedent(f"""\
            CRITICAL issue detected by Neufin Code Health Agent.

            Severity : {sev.upper()}
            Type     : {issue.get('type', '?')}
            File     : {issue.get('file', '?')}:{issue.get('line', 0)}
            Message  : {message}
            Fix hint : {fix_hint}
            {"PR       : " + pr_url if pr_url else ""}
            {"Stack trace:\n" + stack_trace if stack_trace else ""}

            → Dashboard: {DASHBOARD_URL}
            Issue ID: {issue.get('id', '?')}
            Generated: {datetime.now(UTC).isoformat()}
        """)
        _send_email(subject, body)


async def notify_fix_applied(issue: dict, pr_url: str = "", method: str = "auto") -> None:
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


async def send_daily_summary(report: dict, auto_fixed: int = 0, prs_open: int = 0) -> None:
    """
    Full daily health report — intended for 08:00 SGT (00:00 UTC).
    Always sent regardless of scores.
    """
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

    text = (
        f":bar_chart: *Neufin Health Report* \u2014 {date_str}\n"
        f"Backend: {_score_emoji(backend_score)} *{backend_score}/100* | "
        f"Web: {_score_emoji(web_score)} *{web_score}/100* | "
        f"Mobile: {_score_emoji(mobile_score)} *{mobile_score}/100*\n"
        f"\u2500" * 32 + "\n"
        f":red_circle: Critical: {counts.get('critical', 0)} | "
        f":large_yellow_circle: High: {counts.get('high', 0)} | "
        f":large_green_circle: Low: {counts.get('low', 0)}\n"
        f":white_check_mark: Auto-fixed: {auto_fixed} | "
        f":clipboard: PRs awaiting review: {prs_open}\n"
        f"\u2192 Dashboard: {DASHBOARD_URL}"
    )
    await _post_slack({"text": text})
