"""
core/config.py — Single source of truth for all environment variables.

Usage:
    from core.config import settings

    print(settings.SUPABASE_URL)
    origins = settings.allowed_origins_list

All env vars are declared here with types, defaults, and descriptions.
Call settings.validate_required() once at application startup to refuse
start if any required variable is absent.
"""

from __future__ import annotations

import sys

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # ── Supabase (core — required at startup) ─────────────────────────────────
    SUPABASE_URL: str = Field(
        default="",
        description="Supabase project URL. Dashboard → Settings → API → URL.",
    )
    SUPABASE_SERVICE_ROLE_KEY: str = Field(
        default="",
        validation_alias=AliasChoices(
            "SUPABASE_SERVICE_ROLE_KEY",
            "SUPABASE_SECRET_KEY",
        ),
        description=(
            "Supabase service-role key — bypasses RLS. Dashboard → Settings → API → service_role."
        ),
    )
    SUPABASE_KEY: str | None = Field(
        default=None,
        description="Supabase anon key (public). Dashboard → Settings → API → anon public.",
    )
    SUPABASE_JWT_SECRET: str | None = Field(
        default=None,
        description="Supabase JWT secret for HS256 token verification.",
    )
    SUPABASE_PUBLIC_KEY: str | None = Field(
        default=None,
        description="Supabase ES256 public key PEM (optional; JWKS is preferred).",
    )
    SUPABASE_ANON_KEY: str | None = Field(
        default=None,
        description="Alias for SUPABASE_KEY used by some Supabase SDK versions.",
    )
    NEXT_PUBLIC_SUPABASE_ANON_KEY: str | None = Field(
        default=None,
        description="Browser-side Supabase anon key (mirrored from the frontend build).",
    )
    JWT_SECRET: str | None = Field(
        default=None,
        description="Alias for SUPABASE_JWT_SECRET.",
    )
    BYPASS_AUTH_IN_DEV: bool = Field(
        default=False,
        description="Skip JWT verification in development. NEVER set true in production.",
    )

    # ── Encryption (required at startup) ─────────────────────────────────────
    FERNET_MASTER_KEY: str = Field(
        default="",
        description=(
            "Fernet key for field-level AES-128 encryption. "
            'Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        ),
    )

    # ── Stripe (required at startup) ──────────────────────────────────────────
    STRIPE_SECRET_KEY: str = Field(
        default="",
        description="Stripe secret key. Dashboard → Developers → API keys → Secret key.",
    )
    STRIPE_WEBHOOK_SECRET: str = Field(
        default="",
        description="Stripe webhook signing secret. Dashboard → Webhooks → Signing secret.",
    )
    STRIPE_PRICE_SINGLE_REPORT: str | None = Field(
        default=None,
        description="Stripe Price ID for single report ($29). Dashboard → Products.",
    )
    STRIPE_PRICE_UNLIMITED_MONTHLY: str | None = Field(
        default=None,
        description="Stripe Price ID for unlimited monthly ($99/mo). Dashboard → Products.",
    )
    STRIPE_PRICE_RETAIL_MONTHLY: str | None = Field(
        default=None,
        description="Stripe Price ID for Retail Investor plan ($29/mo). Dashboard → Products.",
    )
    STRIPE_PRICE_ADVISOR_MONTHLY: str | None = Field(
        default=None,
        description="Stripe Price ID for Financial Advisor plan ($299/mo). Dashboard → Products.",
    )
    STRIPE_PRICE_ENTERPRISE_MONTHLY: str | None = Field(
        default=None,
        description="Stripe Price ID for Enterprise/API plan ($999/mo). Dashboard → Products.",
    )
    STRIPE_PRICE_ADVISOR_REPORT_ONETIME: str | None = Field(
        default=None,
        description="Stripe Price ID for individual advisor report one-time ($49). Dashboard → Products.",
    )
    STRIPE_REFERRAL_COUPON_ID: str = Field(
        default="REFER20",
        description="Stripe coupon ID for referral discount. Dashboard → Coupons.",
    )

    # ── Slack webhooks ────────────────────────────────────────────────────────
    SLACK_WEBHOOK_NEUFIN_ALERTS: str | None = Field(
        default=None,
        description="Slack incoming webhook URL for #neufin-alerts.",
    )
    SLACK_WEBHOOK_NEUFIN_DEV: str | None = Field(
        default=None,
        description="Slack incoming webhook URL for #neufin-dev.",
    )
    SLACK_WEBHOOK_CTECH_COMMAND: str | None = Field(
        default=None,
        description="Slack incoming webhook URL for #ctech-command.",
    )
    RESEND_API_KEY: str | None = Field(
        default=None,
        description="Resend transactional email API key. resend.com → API Keys. Free tier: 100 emails/day.",
    )

    # ── Observability (SENTRY_DSN required at startup) ────────────────────────
    SENTRY_DSN: str | None = Field(
        default=None,
        description="Sentry DSN for error tracking. sentry.io → Project → Settings → Client Keys.",
    )
    SENTRY_TRACES_SAMPLE_RATE: float = Field(
        default=0.1,
        description="Sentry performance traces sample rate (0.0-1.0).",
    )
    APP_ENV: str = Field(
        default="production",
        description="Sentry/observability environment tag.",
    )
    APP_VERSION: str = Field(
        default="1.1.0",
        description="Application version string reported to Sentry.",
    )
    LOG_LEVEL: str = Field(
        default="INFO",
        description="Logging level: DEBUG | INFO | WARNING | ERROR.",
    )
    LOG_FORMAT: str = Field(
        default="json",
        description='Log format: "json" (production) | "console" (development).',
    )

    # ── Admin access control ─────────────────────────────────────────────────
    ADMIN_EMAILS: str = Field(
        default="stealthgodd@gmail.com,info@neufin.ai",
        description=(
            "Comma-separated list of email addresses that always have is_admin access, "
            "regardless of the user_profiles.is_admin DB column. "
            "E.g. admin@neufin.ai,varun@neufin.ai"
        ),
    )

    @property
    def admin_emails_set(self) -> frozenset[str]:
        """Lowercased, stripped frozenset of admin emails for O(1) lookup."""
        return frozenset(
            e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()
        )

    # ── Deployment environment (required at startup) ──────────────────────────
    ENVIRONMENT: str = Field(
        default="production",
        description="Deployment environment: development | staging | production.",
    )

    # ── CORS (required at startup) ────────────────────────────────────────────
    ALLOWED_ORIGINS: str = Field(
        default="http://localhost:3000",
        description=(
            "Comma-separated list of allowed CORS origins. "
            "E.g. https://neufin.ai,https://neufin-web.vercel.app"
        ),
    )

    # ── Market data providers (all optional) ──────────────────────────────────
    POLYGON_API_KEY: str | None = Field(
        default=None,
        description="Polygon.io API key. polygon.io → Dashboard → API Keys.",
    )
    FINNHUB_API_KEY: str | None = Field(
        default=None,
        description="Finnhub API key. finnhub.io → Dashboard → API key.",
    )
    FMP_API_KEY: str | None = Field(
        default=None,
        description="Financial Modeling Prep API key. financialmodelingprep.com → Dashboard.",
    )
    NEWSAPI_KEY: str | None = Field(
        default=None,
        description="NewsAPI.org API key. newsapi.org → Get API Key (free tier: 100 req/day).",
    )
    TWELVEDATA_API_KEY: str | None = Field(
        default=None,
        description="Twelve Data API key. twelvedata.com → Dashboard.",
    )
    MARKETSTACK_API_KEY: str | None = Field(
        default=None,
        description="Marketstack API key. marketstack.com → Dashboard.",
    )
    ALPHA_VANTAGE_API_KEY: str | None = Field(
        default=None,
        description="Alpha Vantage API key. alphavantage.co → Get Free API Key.",
    )
    FRED_API_KEY: str | None = Field(
        default=None,
        description="FRED (Federal Reserve Economic Data) API key. fred.stlouisfed.org → My Account → API Keys.",
    )
    AV_REQUEST_DELAY: float = Field(
        default=0.0,
        description="Delay (seconds) between Alpha Vantage API requests to avoid rate limits.",
    )

    # ── AI providers (all optional — fallback chain used) ─────────────────────
    ANTHROPIC_API_KEY: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "ANTHROPIC_API_KEY",
            "ANTHROPIC_KEY_1",
        ),
        description="Anthropic Claude API key. console.anthropic.com → API Keys.",
    )
    GEMINI_KEY: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "GEMINI_KEY",
            "GOOGLE_API_KEY",
        ),
        description="Google Gemini API key. aistudio.google.com → Get API key.",
    )
    OPENAI_KEY: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "OPENAI_KEY",
            "OPENAI_API_KEY",
        ),
        description="OpenAI API key. platform.openai.com → API keys.",
    )
    GROQ_KEY: str | None = Field(
        default=None,
        description="Groq API key. console.groq.com → API Keys.",
    )
    GEMINI_FALLBACK_MODEL: str = Field(
        default="gemini-2.0-flash",
        description="Gemini fallback model name when the primary model is unavailable.",
    )

    # ── Cache / task queue ────────────────────────────────────────────────────
    REDIS_URL: str = Field(
        default="",
        description="Redis connection URL. e.g. redis://default:password@host:6379. Empty disables Redis.",
    )

    # ── App ───────────────────────────────────────────────────────────────────
    APP_BASE_URL: str = Field(
        default="https://neufin.vercel.app",
        description="Frontend base URL used in share links. e.g. https://neufin.ai",
    )
    PORT: int = Field(
        default=8000,
        description="HTTP port the server listens on.",
    )

    # ── Agent OS / router-system ──────────────────────────────────────────────
    AGENT_OS_URL: str = Field(
        default="",
        description=(
            "Agent OS / router-system base URL (no trailing slash), e.g. the Railway URL of the "
            "router app. Leave empty to skip registration + heartbeats. "
            "Do not point at a dead hostname — Railway returns 404 Application not found."
        ),
    )
    AGENT_OS_API_KEY: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "AGENT_OS_API_KEY",
            "ROUTER_SECRET_KEY",
        ),
        description=(
            "Machine credential for the Agent OS router-system (not the Supabase service_role key). "
            "Sent as Authorization: Bearer … and x-api-key for compatibility with router builds."
        ),
    )
    AGENT_OS_REGISTER_PATH: str = Field(
        default="/api/register",
        description="POST path for service registration (appended to AGENT_OS_URL).",
    )
    AGENT_OS_HEARTBEAT_PATH: str = Field(
        default="/api/heartbeat/neufin-backend",
        description=(
            "POST path for this service's heartbeat (appended to AGENT_OS_URL). "
            "Override if your router exposes a different route (see repositories.yaml / ui_router)."
        ),
    )

    # ── SEA / FX / optional quote fallback (# SEA-TICKER-FIX) ─────────────────
    FX_DISPLAY_ENABLE: bool = Field(
        default=True,
        description="Show indicative SGD conversion next to native CCY in PDF/Swarm when FX API succeeds.",
    )
    ENABLE_ITICK_VN_FALLBACK: bool = Field(
        default=False,
        description="When True and ITICK_API_KEY is set, try iTick for .VN/.L after Yahoo fails.",
    )
    ITICK_API_KEY: str | None = Field(
        default=None,
        description="Optional iTick API bearer token for VN/international quote fallback.",
    )

    # ── Git / deployment metadata ─────────────────────────────────────────────
    GIT_COMMIT_SHA: str = Field(
        default="unknown",
        description="Git commit SHA injected at build time via Railway environment variable.",
    )

    # ── Admin control tower (optional — no secrets in client) ─────────────────
    OPS_GITHUB_TOKEN: str | None = Field(
        default=None,
        description="GitHub PAT for repo intelligence (repo read scope).",
    )
    OPS_GITHUB_REPO: str = Field(
        default="stealthg0dd/neufin",
        description="owner/repo for GitHub REST stats.",
    )
    OPS_VERCEL_TOKEN: str | None = Field(
        default=None,
        description="Vercel API token for deployment list (optional).",
    )
    OPS_VERCEL_TEAM_ID: str | None = Field(
        default=None,
        description="Vercel team ID when project is under a team.",
    )
    OPS_VERCEL_PROJECT_ID: str | None = Field(
        default=None,
        description="Vercel project ID for /v6/deployments queries.",
    )
    OPS_RAILWAY_TOKEN: str | None = Field(
        default=None,
        description="Railway API token — reserved for future deploy/health adapters.",
    )
    OPS_CONTROL_TOWER_MANUAL_JSON: str | None = Field(
        default=None,
        description=(
            "Optional JSON merged into GET /api/admin/control-tower (ai_accounts, github overrides, etc.)."
        ),
    )

    # ── Derived helpers ───────────────────────────────────────────────────────
    @property
    def allowed_origins_list(self) -> list[str]:
        """Parse ALLOWED_ORIGINS comma-separated string into a list."""
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @property
    def is_staging(self) -> bool:
        return self.ENVIRONMENT.lower() == "staging"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT.lower() in ("development", "dev", "local")

    @property
    def effective_log_format(self) -> str:
        """
        Return the active log format.

        Defaults to "console" in development when LOG_FORMAT has not been
        explicitly set to anything other than the default "json".  This
        means developers get human-readable output automatically without
        needing to set LOG_FORMAT in their .env file.
        """
        if self.is_development and self.LOG_FORMAT.lower() == "json":
            return "console"
        return self.LOG_FORMAT.lower()

    @property
    def debug(self) -> bool:
        """Enable FastAPI/Starlette debug mode in non-production environments."""
        return self.is_development

    # ── Startup validation ────────────────────────────────────────────────────
    def validate_required(self) -> None:
        """
        Enforce that all truly-required variables have non-empty values.

        Called once from the FastAPI lifespan startup hook — NOT at import
        time, so unit tests can import the app without all keys present.

        Exits the process (code 1) with a clear error message on failure.
        """
        required: dict[str, str] = {
            "SUPABASE_URL": self.SUPABASE_URL,
            "SUPABASE_SERVICE_ROLE_KEY": self.SUPABASE_SERVICE_ROLE_KEY,
            "FERNET_MASTER_KEY": self.FERNET_MASTER_KEY,
            "STRIPE_SECRET_KEY": self.STRIPE_SECRET_KEY,
            "STRIPE_WEBHOOK_SECRET": self.STRIPE_WEBHOOK_SECRET,
            "ENVIRONMENT": self.ENVIRONMENT,
            "ALLOWED_ORIGINS": self.ALLOWED_ORIGINS,
        }
        # SENTRY_DSN: required but empty-string is acceptable (disables Sentry)
        missing = [k for k, v in required.items() if not v or not v.strip()]
        if missing:
            lines = [
                "",
                "=" * 64,
                "STARTUP FAILED — Missing required environment variables:",
                "",
            ]
            for var in missing:
                lines.append(f"  ✗  {var}")
            lines += [
                "",
                "Set these in Railway → your service → Variables,",
                "or in a local .env file (copy .env.example → .env).",
                "=" * 64,
                "",
            ]
            print("\n".join(lines), file=sys.stderr, flush=True)
            sys.exit(1)


# Module-level singleton — imported throughout the app.
# Constructed at import time from the process environment (+ .env if present).
settings = Settings()
