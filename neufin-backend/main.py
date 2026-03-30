import asyncio
import io
import os
import sys
import uuid
import warnings

# Suppress library version mismatch and dependency warnings
warnings.filterwarnings("ignore", message=".*urllib3.*")
warnings.filterwarnings("ignore", message=".*chardet.*")
warnings.filterwarnings("ignore", category=DeprecationWarning, module="requests")
try:
    from requests.packages.urllib3.exceptions import (
        RequestsDependencyWarning,  # type: ignore[import]
    )
    warnings.filterwarnings("ignore", category=RequestsDependencyWarning)
except ImportError:
    pass

# ── Observability: Sentry (initialise before any app code) ────────────────────
import sentry_sdk  # noqa: E402
from sentry_sdk.integrations.fastapi import FastApiIntegration  # noqa: E402
from sentry_sdk.integrations.starlette import StarletteIntegration  # noqa: E402

_SENTRY_DSN = os.getenv("SENTRY_DSN")
if _SENTRY_DSN:
    sentry_sdk.init(
        dsn=_SENTRY_DSN,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
        # Capture 10 % of transactions for performance monitoring in production.
        # Increase to 1.0 in staging/dev via SENTRY_TRACES_SAMPLE_RATE env var.
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        environment=os.getenv("APP_ENV", "production"),
        release=os.getenv("APP_VERSION", "1.1.0"),
        # Strip PII from events
        send_default_pii=False,
    )

# ── Observability: structured logging ─────────────────────────────────────────
import structlog  # noqa: E402

from services.logging_config import configure_logging  # noqa: E402

configure_logging()
logger = structlog.get_logger("neufin.main")

import pandas as pd  # noqa: E402
from fastapi import FastAPI, File, HTTPException, Request, UploadFile  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from config import APP_BASE_URL  # noqa: E402
from database import supabase  # noqa: E402
from routers import (  # noqa: E402
    advisors,
    alerts,
    dna,
    market,
    payments,
    portfolio,
    referrals,
    reports,
    swarm,
    vault,
)
from services.ai_router import get_ai_analysis  # noqa: E402
from services.calculator import (  # noqa: E402
    _beta_score,
    _hhi_score,
    _tax_alpha_score,
    fetch_beta,
    fetch_spot_price,
    get_tax_impact_analysis,
)
from services.jwt_auth import verify_jwt  # noqa: E402
from services.risk_engine import (  # noqa: E402
    build_correlation_matrix,
    correlation_penalty_score,
    find_correlation_clusters,
    format_clusters_for_ai,
)

# calculator.py prints its own key confirmation on import — no need to repeat here

# ── Auth config ────────────────────────────────────────────────────────────────
PUBLIC_PATHS = {"/", "/health", "/docs", "/redoc", "/openapi.json", "/metrics"}
PUBLIC_PREFIXES = [
    "/api/analyze-dna",
    "/api/dna/share/",
    "/api/dna/leaderboard",
    "/api/reports/checkout",
    "/api/reports/fulfill",
    "/api/stripe/webhook",
    "/api/payments/plans",
    "/api/portfolio/chart/",
    "/api/referrals/",
    "/api/emails/",
    "/api/advisors/",
    "/api/market/",
    "/api/analytics/track",
    "/api/swarm/",          # Swarm endpoints are public (demo-accessible)
    "/api/admin/health",    # Health diagnostics — no auth required
    "/api/auth/status",     # Auth status probe — unauthenticated callers get authenticated=false
]

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Neufin API",
    description="AI Portfolio Intelligence Platform",
    version="1.1.0",
)

# ── Observability: Prometheus metrics endpoint (/metrics) ─────────────────────
# Tracks HTTP request count, latency histograms, and in-flight requests by
# default.  Exposed at GET /metrics — excluded from auth middleware via
# PUBLIC_PATHS above.
try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        should_respect_env_var=False,
        excluded_handlers=["/metrics", "/health"],
    ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=True, tags=["system"])
except ImportError:
    logger.warning("prometheus_fastapi_instrumentator not installed; /metrics unavailable")

# ── CORS origins — dynamic: base set + optional ALLOWED_ORIGINS env var ─────────
# Add production domains to Railway env: ALLOWED_ORIGINS=https://myapp.vercel.app,https://custom.domain.com
_extra_origins = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]
origins = list({
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",   # Vite dev server
    "https://neufin-web.vercel.app",
    "https://neufinapk1.vercel.app",
    "https://neufinapk1-git-master-varuns-projects-6fad10b9.vercel.app",
    "https://neufin.ai",
    "https://www.neufin.ai",
    *_extra_origins,
})
# Regex covers all Vercel preview deployments (https://*.vercel.app)
# Starlette does not support glob wildcards in allow_origins — use allow_origin_regex instead.
_origin_regex = r"https://[a-zA-Z0-9\-]+\.vercel\.app"

# ── Middleware ordering ────────────────────────────────────────────────────────
#
# Starlette builds the stack with each add_middleware() call prepending to the
# internal list, then reversing it at startup. Result: the LAST registration
# becomes the OUTERMOST layer (first to receive every request).
#
# Desired execution order (outermost → innermost):
#   auth_middleware  →  CORSMiddleware  →  router
#
# To achieve this:
#   1. Register CORSMiddleware FIRST (inner position after reversal).
#   2. Register auth_middleware SECOND via @app.middleware (outermost after reversal).
#
# Consequence: auth_middleware receives ALL requests first, including CORS
# preflights (OPTIONS).  The explicit OPTIONS bypass below is therefore required —
# it passes preflights directly to CORSMiddleware, which returns 200 with the
# correct Access-Control-* headers without ever calling app logic.

# ── Step 1: CORSMiddleware (registered first → inner position) ────────────────
# allow_origin_regex covers all Vercel preview deployments (https://*.vercel.app).
# allow_origins lists every explicit origin; ALLOWED_ORIGINS env var extends it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ── Step 2: auth_middleware (registered last → outermost layer) ───────────────
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """
    Outermost HTTP middleware — runs before every request including preflights.

    Explicit bypass rules (no JWT work, no state mutation):
      • OPTIONS  — CORS preflight; must reach CORSMiddleware which returns 200.
      • /health, /api/admin/health — monitoring probes; zero-overhead path.

    All other requests: soft-attach a verified JWTUser to request.state.user.
    Never rejects — authentication enforcement is per-endpoint via
    Depends(get_current_user) in each router.
    """
    # ── Bypass 1: CORS preflight ───────────────────────────────────────────────
    # CORSMiddleware (next in chain) intercepts OPTIONS and returns 200 with
    # Access-Control-* headers.  Do NOT inspect or modify the request here.
    if request.method == "OPTIONS":
        return await call_next(request)

    # ── Bypass 2: health-check endpoints ──────────────────────────────────────
    if request.url.path in ("/health", "/api/admin/health"):
        return await call_next(request)

    # ── Soft JWT attachment ────────────────────────────────────────────────────
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        try:
            request.state.user = await verify_jwt(token)
            # Attach user identity to all Sentry events for this request
            sentry_sdk.set_user({"id": request.state.user.id})
            sentry_sdk.set_tag("endpoint", request.url.path)
        except Exception as exc:
            logger.warning("auth.token_rejected", path=request.url.path, reason=str(exc))
            request.state.user = None
    else:
        request.state.user = None

    return await call_next(request)


# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(dna.router)
app.include_router(portfolio.router)
app.include_router(reports.router)
app.include_router(payments.router)
app.include_router(referrals.router)
app.include_router(advisors.router)
app.include_router(market.router)
app.include_router(vault.router)
app.include_router(swarm.router)
app.include_router(alerts.router)


# ── Global OPTIONS handler ─────────────────────────────────────────────────────
# Safety net for non-preflight OPTIONS requests (missing Access-Control-Request-Method
# header) that Starlette's CORSMiddleware does not short-circuit itself.
# CORSMiddleware wraps this response and adds the Access-Control-* headers.
@app.options("/{full_path:path}", include_in_schema=False)
async def global_options_handler(full_path: str):
    from fastapi.responses import Response
    return Response(status_code=200)


# ── Public DNA endpoint ────────────────────────────────────────────────────────
@app.post("/api/analyze-dna", tags=["dna"])
async def analyze_dna(
    request: Request,
    file: UploadFile = File(...),
):
    """
    Upload CSV → Investor DNA Score.
    Multipart field name must be 'file'.
    Prices fetched concurrently from Finnhub → Alpha Vantage.
    """
    # ── 0. Diagnostics ─────────────────────────────────────────────────────────
    print(f"[DIAG] content-type: {request.headers.get('content-type', 'MISSING')}", file=sys.stderr)
    print(f"[DIAG] file.filename={file.filename!r}  content_type={file.content_type!r}", file=sys.stderr)

    # ── 1. Read + parse CSV ────────────────────────────────────────────────────
    try:
        contents = await file.read()
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
        df.columns = [c.lower().strip() for c in df.columns]
    except Exception as e:
        print(f"[CSV] Parse error: {e}", file=sys.stderr)
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {e}") from e

    if "symbol" not in df.columns or "shares" not in df.columns:
        raise HTTPException(
            status_code=422,
            detail="CSV must contain 'symbol' and 'shares' columns.",
        )

    # ── 2. Resolve optional user_id from JWT ───────────────────────────────────
    user_id = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            user = await verify_jwt(auth_header.split(" ", 1)[1])
            user_id = user.id
        except Exception:
            logger.warning("JWT verification failed for anonymous upload", exc_info=True)

    # ── 3. Analytics — disabled until analytics_events table is created ──────────
    # await track("dna_upload_started", {"rows": len(df), "filename": file.filename}, user_id=user_id)

    # ── 4. Data preparation ────────────────────────────────────────────────────
    df["shares"] = pd.to_numeric(df["shares"], errors="coerce").fillna(0)
    symbols = df["symbol"].str.upper().unique().tolist()

    # ── 5. Price fetching — strict validation (DATA_INTEGRITY_ERROR on 0) ──────
    price_results = await asyncio.gather(
        *[asyncio.to_thread(fetch_spot_price, sym) for sym in symbols],
        return_exceptions=True,
    )
    failed_tickers: list[str] = []
    price_map: dict[str, float] = {}
    for sym, result in zip(symbols, price_results, strict=False):
        if isinstance(result, ValueError) and "DATA_INTEGRITY_ERROR" in str(result):
            failed_tickers.append(sym)
        elif isinstance(result, Exception):
            print(f"[Price] {sym} unexpected error: {result}", file=sys.stderr)
            failed_tickers.append(sym)
        else:
            price_map[sym] = float(result)

    if failed_tickers:
        raise HTTPException(
            status_code=422,
            detail=(
                f"DATA_INTEGRITY_ERROR: Could not verify price for "
                f"{', '.join(failed_tickers)}. "
                "Please check these ticker symbols and try again."
            ),
        )

    prices_available = bool(price_map)
    df["symbol"]        = df["symbol"].str.upper()
    df["current_price"] = df["symbol"].map(price_map).fillna(0.0)
    df["value"]         = (df["shares"] * df["current_price"]).round(2)
    total_value         = float(df["value"].sum())
    df["weight"]        = df["value"] / total_value if total_value > 0 else 0.0
    max_pos             = float(df["weight"].max() * 100) if total_value > 0 else 0.0

    # ── 6. Scoring — 4-component model ────────────────────────────────────────
    # HHI concentration (25 pts)
    hhi_pts = _hhi_score(df["weight"])

    # Weighted beta (25 pts)
    beta_results = await asyncio.gather(
        *[asyncio.to_thread(fetch_beta, sym) for sym in df["symbol"].tolist()],
        return_exceptions=True,
    )
    df["beta"]     = [b if isinstance(b, float) else 1.0 for b in beta_results]
    weighted_beta  = float((df["weight"] * df["beta"]).sum()) if total_value > 0 else 1.0
    beta_pts       = _beta_score(weighted_beta)

    # Tax alpha (20 pts)
    tax_pts = _tax_alpha_score(df)

    # Correlation factor (30 pts) — top-5 holdings via Alpha Vantage TIME_SERIES_DAILY
    top5_symbols    = (
        df.nlargest(5, "weight")["symbol"].tolist()
        if total_value > 0 else df["symbol"].tolist()[:5]
    )
    weights_dict    = dict(zip(df["symbol"].tolist(), df["weight"].tolist(), strict=False))
    corr_matrix     = await asyncio.to_thread(build_correlation_matrix, top5_symbols)
    clusters        = find_correlation_clusters(corr_matrix, weights_dict)
    corr_pts, avg_corr = correlation_penalty_score(clusters, corr_matrix)

    dna_score = max(5, min(100, int(hhi_pts + beta_pts + tax_pts + corr_pts)))
    score_breakdown = {
        "hhi_concentration": hhi_pts,
        "beta_risk":         beta_pts,
        "tax_alpha":         tax_pts,
        "correlation":       corr_pts,
    }

    # ── 7. AI analysis ─────────────────────────────────────────────────────────
    if prices_available:
        price_note = ""
    else:
        price_note = "\nNote: Live market prices are currently unavailable. Analyze based on share quantities and symbol weights only; do not reference dollar values.\n"

    tax_analysis     = get_tax_impact_analysis(df)
    tax_narrative    = tax_analysis.get("narrative", "")
    cluster_narrative = format_clusters_for_ai(clusters)

    prompt = f"""You are a behavioral finance expert.{price_note}
Portfolio: {df[['symbol', 'shares', 'current_price', 'value']].to_dict(orient='records')}
Total value: ${total_value:,.2f}
Max position: {max_pos:.1f}%
Weighted beta: {weighted_beta:.2f}
DNA Score: {dna_score}/100
Score breakdown: HHI={hhi_pts}/25, Beta={beta_pts}/25, TaxAlpha={tax_pts}/20, Correlation={corr_pts}/30

Hidden correlation clusters: {cluster_narrative}
Tax analysis: {tax_narrative}

Return ONLY valid JSON:
{{
  "investor_type": "one of: Diversified Strategist, Conviction Growth, Momentum Trader, Defensive Allocator, Speculative Investor",
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2"],
  "recommendation": "one specific actionable suggestion"
}}"""

    try:
        analysis = await get_ai_analysis(prompt)
    except Exception as e:
        print(f"[AI] All providers failed: {e}", file=sys.stderr)
        raise HTTPException(status_code=503, detail="AI analysis providers are unavailable.") from e

    # ── 8. Format positions ────────────────────────────────────────────────────
    positions_out = []
    for _, row in df[["symbol", "shares", "current_price", "value"]].iterrows():
        weight = round(float(row["value"]) / total_value * 100, 2) if total_value > 0 else 0.0
        positions_out.append({
            "symbol": row["symbol"],
            "shares": row["shares"],
            "price":  row["current_price"],
            "value":  row["value"],
            "weight": weight,
        })

    # ── 9. Persist to DB ───────────────────────────────────────────────────────
    print(
        f"[Score] dna_score={dna_score}  max_pos={round(max_pos,1)}%  "
        f"hhi={hhi_pts}  beta={beta_pts}  tax={tax_pts}  corr={corr_pts}  "
        f"weighted_beta={round(weighted_beta,2)}  avg_corr={round(avg_corr,3)}",
        file=sys.stderr,
    )

    share_token = uuid.uuid4().hex[:8]
    record_id = None
    db_payload = {
        "user_id":        user_id,
        "dna_score":      dna_score,
        "investor_type":  analysis.get("investor_type"),
        "summary":        analysis.get("summary"),
        "strengths":      analysis.get("strengths", []),
        "weaknesses":     analysis.get("weaknesses", []),
        "recommendation": analysis.get("recommendation"),
        "share_token":    share_token,
        "total_value":    round(total_value, 2),
    }
    # Drop None values (except user_id and summary which may legitimately be null)
    db_payload = {k: v for k, v in db_payload.items() if v is not None or k in ("user_id", "summary")}

    try:
        res = supabase.table("dna_scores").insert(db_payload).execute()
        if res.data and len(res.data) > 0:
            record_id = res.data[0].get("id")
            print(f"[DB] dna_scores insert ok id={record_id}", file=sys.stderr)
        else:
            print("[DB] dna_scores insert returned empty data", file=sys.stderr)
            record_id = None
    except Exception as e:
        print(f"[DB] dna_scores insert failed: {e}", file=sys.stderr)
        record_id = None

    # ── 10. Analytics — disabled until analytics_events table is created ─────────
    # await track("dna_upload_started", {"rows": len(df), "filename": file.filename}, user_id=user_id)
    # await track("dna_analysis_complete", {"dna_score": dna_score}, user_id=user_id)

    # ── 11. Response ───────────────────────────────────────────────────────────
    # IMPORTANT: **analysis is spread FIRST so that our explicitly computed values
    # (dna_score, total_value, etc.) always override any keys the AI may return.
    print(f"[Final] Payload being sent: dna_score={dna_score}, record_id={record_id}, "
          f"investor_type={analysis.get('investor_type')}", file=sys.stderr)
    return {
        **analysis,
        "dna_score":                  dna_score,           # computed — always wins
        "score_breakdown":            score_breakdown,
        "total_value":                round(total_value, 2),
        "num_positions":              len(df),
        "max_position_pct":           round(max_pos, 2),
        "weighted_beta":              round(weighted_beta, 3),
        "avg_correlation":            round(avg_corr, 3),
        "hidden_correlation_clusters": clusters,
        "tax_analysis":               tax_analysis,
        "positions":                  positions_out,
        "share_token":                share_token,
        "share_url":                  f"{APP_BASE_URL}/share/{share_token}",
        "record_id":                  record_id,
    }


# ── System endpoints ───────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
def health():
    return {"status": "ok", "service": "neufin-api"}


@app.get("/api/auth/status", tags=["auth"])
async def auth_status(request: Request):
    """
    Auth status probe — safe to call unauthenticated.

    Returns:
      authenticated: true if a valid, non-expired JWT was supplied.
      user_id:       Supabase UUID of the authenticated user, or null.
      expires_at:    ISO-8601 UTC timestamp when the token expires, or null.
      error:         Human-readable rejection reason when authenticated=false.

    Use this endpoint to:
      - Debug auth issues from the frontend/mobile app.
      - Gate protected UI sections before attempting protected API calls.
    """
    import datetime

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return {
            "authenticated": False,
            "user_id":       None,
            "expires_at":    None,
            "error":         "No Bearer token supplied",
        }

    token = auth_header.split(" ", 1)[1]
    try:
        from jose import jwt as _jwt
        # Parse unverified claims first so we can always return expires_at
        raw_claims = _jwt.get_unverified_claims(token)
        exp_ts     = raw_claims.get("exp")
        expires_at = (
            datetime.datetime.utcfromtimestamp(exp_ts).strftime("%Y-%m-%dT%H:%M:%SZ")
            if exp_ts else None
        )

        user = await verify_jwt(token)
        return {
            "authenticated": True,
            "user_id":       user.id,
            "expires_at":    expires_at,
            "error":         None,
        }
    except Exception as exc:
        # Parse expires_at even on failure so callers know whether to refresh
        try:
            raw_claims = _jwt.get_unverified_claims(token)   # type: ignore[possibly-undefined]
            exp_ts     = raw_claims.get("exp")
            expires_at = (
                datetime.datetime.utcfromtimestamp(exp_ts).strftime("%Y-%m-%dT%H:%M:%SZ")
                if exp_ts else None
            )
        except Exception:
            expires_at = None

        return {
            "authenticated": False,
            "user_id":       None,
            "expires_at":    expires_at,
            "error":         str(exc),
        }


@app.get("/api/admin/health", tags=["system"])
def admin_health():
    """Detailed feature/provider health check — used by frontend useBackendHealth hook."""
    import importlib
    import importlib.util

    from config import (
        ANTHROPIC_API_KEY,
        FMP_API_KEY,
        GEMINI_KEY,
        GROQ_KEY,
        MARKETSTACK_API_KEY,
        OPENAI_KEY,
        POLYGON_API_KEY,
        TWELVEDATA_API_KEY,
    )

    def _has(val: str) -> bool:
        return bool(val and val.strip())

    ai_models = {
        "claude":  _has(ANTHROPIC_API_KEY),
        "openai":  _has(OPENAI_KEY),
        "gemini":  _has(GEMINI_KEY),
        "groq":    _has(GROQ_KEY),
    }
    market_providers = {
        "polygon":     _has(POLYGON_API_KEY),
        "fmp":         _has(FMP_API_KEY),
        "twelvedata":  _has(TWELVEDATA_API_KEY),
        "marketstack": _has(MARKETSTACK_API_KEY),
    }
    features = {
        "swarm_engine":      True,
        "stress_testing":    True,
        "price_verifier":    True,
        "alpha_gap":         True,
        "agent_chat":        True,
        "paywall":           True,
        "pdf_reports":       bool(importlib.util.find_spec("reportlab")),
        "fernet_encryption": bool(importlib.util.find_spec("cryptography")),
    }
    return {
        "status":           "ok",
        "service":          "neufin-api",
        "ai_models":        ai_models,
        "market_providers": market_providers,
        "features":         features,
        "active_ai":        next((k for k, v in ai_models.items() if v), "none"),
    }


@app.get("/", tags=["system"])
def root():
    return {"message": "Neufin AI Portfolio Intelligence API", "docs": "/docs"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
