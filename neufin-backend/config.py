import os
from dotenv import load_dotenv

load_dotenv()

# Supabase
SUPABASE_URL              = os.getenv("SUPABASE_URL")
SUPABASE_KEY              = os.getenv("SUPABASE_KEY")                # anon key (public)
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")   # service role (bypasses RLS)

# AI models — fallback chain: Claude → Gemini → Groq
ANTHROPIC_KEY = os.getenv("ANTHROPIC_KEY")
GEMINI_KEY    = os.getenv("GEMINI_KEY")
OPENAI_KEY    = os.getenv("OPENAI_KEY")   # optional, reserved
GROQ_KEY      = os.getenv("GROQ_KEY")

# Stripe
STRIPE_SECRET_KEY       = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET   = os.getenv("STRIPE_WEBHOOK_SECRET")
STRIPE_PRICE_SINGLE     = os.getenv("STRIPE_PRICE_SINGLE_REPORT")     # one-time $29
STRIPE_PRICE_UNLIMITED  = os.getenv("STRIPE_PRICE_UNLIMITED_MONTHLY") # recurring $99/mo

# Monitoring
SENTRY_DSN = os.getenv("SENTRY_DSN")  # optional — get from sentry.io

# Referral (create coupon id "REFER20" in Stripe Dashboard → 20% off)
STRIPE_REFERRAL_COUPON_ID = os.getenv("STRIPE_REFERRAL_COUPON_ID", "REFER20")

# App
APP_BASE_URL = os.getenv("APP_BASE_URL", "https://neufin.vercel.app")
PORT         = int(os.getenv("PORT", "8000"))
