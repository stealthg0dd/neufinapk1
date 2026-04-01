"""
config.py — Backward-compatibility shim.

All environment variables are now declared and validated in core/config.py.
This module re-exports individual constants so existing imports keep working:

    from config import SUPABASE_URL, APP_BASE_URL   # still works
"""
from core.config import settings

# ── Supabase ──────────────────────────────────────────────────────────────────
SUPABASE_URL: str = settings.SUPABASE_URL
SUPABASE_KEY: str | None = settings.SUPABASE_KEY
SUPABASE_SERVICE_ROLE_KEY: str = settings.SUPABASE_SERVICE_ROLE_KEY

# ── Market data ───────────────────────────────────────────────────────────────
POLYGON_API_KEY: str | None = settings.POLYGON_API_KEY
FINNHUB_API_KEY: str | None = settings.FINNHUB_API_KEY
FMP_API_KEY: str | None = settings.FMP_API_KEY
TWELVEDATA_API_KEY: str | None = settings.TWELVEDATA_API_KEY
MARKETSTACK_API_KEY: str | None = settings.MARKETSTACK_API_KEY
ALPHA_VANTAGE_API_KEY: str | None = settings.ALPHA_VANTAGE_API_KEY
FRED_API_KEY: str | None = settings.FRED_API_KEY

# ── AI models ─────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY: str | None = settings.ANTHROPIC_API_KEY
GEMINI_KEY: str | None = settings.GEMINI_KEY
OPENAI_KEY: str | None = settings.OPENAI_KEY
GROQ_KEY: str | None = settings.GROQ_KEY

# ── Stripe ────────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY: str = settings.STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET: str = settings.STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_SINGLE: str | None = settings.STRIPE_PRICE_SINGLE_REPORT
STRIPE_PRICE_UNLIMITED: str | None = settings.STRIPE_PRICE_UNLIMITED_MONTHLY
STRIPE_REFERRAL_COUPON_ID: str = settings.STRIPE_REFERRAL_COUPON_ID

# ── Cache ─────────────────────────────────────────────────────────────────────
REDIS_URL: str = settings.REDIS_URL

# ── App ───────────────────────────────────────────────────────────────────────
APP_BASE_URL: str = settings.APP_BASE_URL
PORT: int = settings.PORT
