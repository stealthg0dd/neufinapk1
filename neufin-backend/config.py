import os
from dotenv import load_dotenv

load_dotenv()

# Supabase
SUPABASE_URL              = os.getenv("SUPABASE_URL")
SUPABASE_KEY              = os.getenv("SUPABASE_KEY")                # anon key (public)
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")   # service role (bypasses RLS)

# Market data — Polygon (primary batch) → Finnhub → FMP → TwelveData → Marketstack → Alpha Vantage
POLYGON_API_KEY       = os.getenv("POLYGON_API_KEY")
FINNHUB_API_KEY       = os.getenv("FINNHUB_API_KEY")
FMP_API_KEY           = os.getenv("FMP_API_KEY")
TWELVEDATA_API_KEY    = os.getenv("TWELVEDATA_API_KEY")
MARKETSTACK_API_KEY   = os.getenv("MARKETSTACK_API_KEY")
ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY")
FRED_API_KEY          = os.getenv("FRED_API_KEY")     # Federal Reserve Economic Data

# AI models — fallback chain: Claude → Gemini → Groq
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
GEMINI_KEY    = os.getenv("GEMINI_KEY")
OPENAI_KEY    = os.getenv("OPENAI_KEY")   # optional, reserved
GROQ_KEY      = os.getenv("GROQ_KEY")

# Stripe
STRIPE_SECRET_KEY       = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET   = os.getenv("STRIPE_WEBHOOK_SECRET")
STRIPE_PRICE_SINGLE     = os.getenv("STRIPE_PRICE_SINGLE_REPORT")     # one-time $29
STRIPE_PRICE_UNLIMITED  = os.getenv("STRIPE_PRICE_UNLIMITED_MONTHLY") # recurring $99/mo

# Referral (create coupon id "REFER20" in Stripe Dashboard → 20% off)
STRIPE_REFERRAL_COUPON_ID = os.getenv("STRIPE_REFERRAL_COUPON_ID", "REFER20")

# Cache
REDIS_URL = os.getenv("REDIS_URL", "")   # e.g. redis://default:password@host:6379

# App
APP_BASE_URL = os.getenv("APP_BASE_URL", "https://neufin.vercel.app")
PORT         = int(os.getenv("PORT", "8000"))
