"""
config.py — Pydantic BaseSettings for neufin-agent.

Validates all environment variables at import time and raises SystemExit
immediately if any *required* variable is missing.  Import `settings` anywhere
in the codebase to access validated config values.
"""

import logging
import sys

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger("neufin-agent.config")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="allow",        # allow arbitrary extra env vars (Railway injects many)
        case_sensitive=True,
    )

    # ── Required ────────────────────────────────────────────────────────────
    GITHUB_TOKEN: str = Field(..., description="GitHub PAT for issue creation and repo access")
    GITHUB_ORG: str = Field(default="stealthg0dd", description="GitHub org/owner for issue creation")
    GITHUB_REPO: str = Field(default="stealthg0dd/neufinapk1", description="Full repo path owner/repo")

    SUPABASE_URL: str = Field(..., description="Supabase project URL")
    SUPABASE_SERVICE_KEY: str = Field(..., description="Supabase service role key (not anon key)")

    SLACK_WEBHOOK_NEUFIN_ALERTS: str = Field(..., description="Slack webhook — #neufin-alerts (CRITICAL)")
    SLACK_WEBHOOK_NEUFIN_DEV: str = Field(..., description="Slack webhook — #neufin-dev (HIGH + digests)")
    SLACK_WEBHOOK_CTECH_COMMAND: str = Field(..., description="Slack webhook — #ctech-command (CRITICAL)")

    SENTRY_DSN: str = Field(..., description="Sentry DSN for neufin-agent instrumentation")
    SENTRY_AUTH_TOKEN: str = Field(..., description="Sentry auth token for release tracking")

    AGENT_OS_URL: str = Field(..., description="Router-system base URL (ctech-production.up.railway.app)")
    AGENT_OS_API_KEY: str = Field(..., description="Bearer token for router-system API calls")

    # ── Optional / backward-compat ──────────────────────────────────────────
    SLACK_WEBHOOK_URL: str = Field(default="", description="Legacy single Slack webhook (backward compat)")

    ANTHROPIC_API_KEY: str = Field(default="", description="Anthropic API key for LLM fix generation")
    DASHBOARD_URL: str = Field(default="http://localhost:8001/dashboard")
    ENVIRONMENT: str = Field(default="production")
    SCAN_INTERVAL_HOURS: int = Field(default=6)
    AGENT_PORT: int = Field(default=8001)
    LOG_LEVEL: str = Field(default="INFO")
    REPO_ROOT: str = Field(default="/app/repo_to_scan")
    SENTRY_SCAN_ISSUE_LIMIT: int = Field(default=121)
    SLACK_ALERT_COOLDOWN_SECONDS: int = Field(default=900)
    SLACK_CRITICAL_WINDOW_SECONDS: int = Field(default=60)
    SLACK_CRITICAL_WINDOW_LIMIT: int = Field(default=6)

    # SMTP (optional — for critical email alerts)
    SMTP_HOST: str = Field(default="")
    SMTP_PORT: int = Field(default=587)
    SMTP_USER: str = Field(default="")
    SMTP_PASS: str = Field(default="")
    ALERT_EMAIL: str = Field(default="")
    FROM_EMAIL: str = Field(default="")

    # Vercel / Railway runtime monitor
    VERCEL_TOKEN: str = Field(default="")
    VERCEL_PROJECT_ID: str = Field(default="")
    RAILWAY_HEALTH_URL: str = Field(default="https://neufin101-production.up.railway.app/health")


def _load() -> Settings:
    """Validate settings, fail fast on missing required vars."""
    try:
        s = Settings()
        log.info({"action": "config_loaded", "environment": s.ENVIRONMENT})
        return s
    except Exception as exc:
        # Print clearly so Railway/Docker logs surface the problem immediately
        msg = f"\n[neufin-agent] ❌ Missing or invalid environment variables:\n{exc}\n"
        print(msg, file=sys.stderr)
        raise SystemExit(1) from exc


settings = _load()
