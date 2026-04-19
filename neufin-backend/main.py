from __future__ import annotations

import asyncio
import datetime
import io
import time
import uuid
import warnings
from contextlib import asynccontextmanager

# ci-validation: 2026-04-03

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

# ── Sentry: initialise before all app imports to capture boot exceptions ───────
import os  # noqa: E402

import sentry_sdk  # noqa: E402
import stripe  # noqa: E402
from sentry_sdk.integrations.fastapi import FastApiIntegration  # noqa: E402
from sentry_sdk.integrations.starlette import StarletteIntegration  # noqa: E402

_SENTRY_ENV: str = os.getenv("ENVIRONMENT", "production")
_SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")
_PII_KEYS: frozenset = frozenset({"password", "token", "api_key", "fernet_key"})


def _scrub(obj: object) -> object:
    """Recursively redact PII field values from Sentry event dicts."""
    if isinstance(obj, dict):
        return {
            k: "[REDACTED]" if k.lower() in _PII_KEYS else _scrub(v)
            for k, v in obj.items()
        }
    return [_scrub(i) for i in obj] if isinstance(obj, list) else obj


def _before_send(event: dict, _hint: dict) -> dict | None:
    """Strip sensitive fields from every Sentry event before transmission."""
    for section in ("request", "extra", "contexts"):
        if section in event:
            event[section] = _scrub(event[section])
    return event


sentry_sdk.init(
    dsn=_SENTRY_DSN or None,
    environment=_SENTRY_ENV,
    release=(
        os.getenv("GIT_COMMIT_SHA") or os.getenv("RAILWAY_GIT_COMMIT_SHA") or "unknown"
    ),
    # 20 % sampling in production keeps quota low; 100 % in dev for full traces
    traces_sample_rate=1.0 if _SENTRY_ENV in ("development", "dev", "local") else 0.2,
    send_default_pii=False,
    before_send=_before_send,
    integrations=[
        StarletteIntegration(transaction_style="endpoint"),
        FastApiIntegration(transaction_style="endpoint"),
    ],
)
# Tag every event with service/company for Sentry issue filtering
sentry_sdk.set_tags({"service": "neufin-backend", "company": "neufin"})

# ── Config — validate required env vars in lifespan, not at import ────────────
# ── Observability: structured logging ─────────────────────────────────────────
import structlog  # noqa: E402

from core.config import settings  # noqa: E402
from services.logging_config import configure_logging  # noqa: E402

configure_logging()
logger = structlog.get_logger("neufin.main")

import pandas as pd  # noqa: E402, I001
from fastapi import FastAPI, File, HTTPException, Request, UploadFile  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from database import supabase  # noqa: E402
from routers import (  # noqa: E402
    admin as admin_router,
    advisor as advisor_router,
    advisors,
    alerts,
    developer as developer_router,
    dna,
    leads as leads_router,
    market,
    payments,
    portfolio,
    profile as profile_router,
    quant as quant_router,
    referrals,
    reports,
    research as research_router,
    revenue as revenue_router,
    risk as risk_router,
    swarm,
    vault,
)
from services.ai_router import get_ai_analysis  # noqa: E402
from services.auth_dependency import get_current_user  # noqa: E402
from services.calculator import (  # noqa: E402
    _beta_score,
    _hhi_score,
    _tax_alpha_score,
    fetch_beta,
    get_price_with_fallback,
    get_tax_impact_analysis,
)
from services.fx_format import indicative_sgd_suffix  # noqa: E402
from services.market_resolver import (  # noqa: E402
    persist_resolution_best_effort,
    resolve_security,
)
from services.jwt_auth import verify_jwt  # noqa: E402
from services.risk_engine import (  # noqa: E402
    build_correlation_matrix,
    correlation_penalty_score,
    find_correlation_clusters,
    format_clusters_for_ai,
)

def _zip_equal_lengths(left: list, right: list) -> list[tuple]:
    """Pair two lists; raises if lengths differ (no zip B905 / Py3.9 strict issues)."""
    if len(left) != len(right):
        raise ValueError("paired iteration length mismatch")
    return [(left[i], right[i]) for i in range(len(left))]


# ── Startup time (for uptime_seconds in /health) ──────────────────────────────
_startup_time: float = time.monotonic()

# ── Supabase connectivity cache (30-second TTL for /health) ───────────────────
_supabase_health_cache: dict = {"ok": None, "checked_at": 0.0}
_SUPABASE_HEALTH_TTL = 30.0


def _check_supabase_connected() -> bool:
    """Return True if Supabase is reachable; cached for 30 seconds."""
    now = time.monotonic()
    if now - _supabase_health_cache["checked_at"] < _SUPABASE_HEALTH_TTL:
        return bool(_supabase_health_cache["ok"])
    try:
        supabase.table("portfolios").select("id").limit(1).execute()
        _supabase_health_cache.update(ok=True, checked_at=now)
        return True
    except Exception as exc:
        logger.warning("health.supabase_check_failed", error=str(exc))
        _supabase_health_cache.update(ok=False, checked_at=now)
        return False


# ── Router-system registration + heartbeat ────────────────────────────────────
_heartbeat_task: asyncio.Task | None = None
_heartbeat_422_logged = False


def _agent_os_headers(api_key: str) -> dict[str, str]:
    """Auth headers accepted by different Agent OS / router-system builds."""
    return {
        "Authorization": f"Bearer {api_key}",
        "x-api-key": api_key,
    }


def _first_present_env(*names: str) -> str:
    """Return first env name that is present/non-empty, else MISSING."""
    for name in names:
        val = os.getenv(name)
        if val and val.strip():
            return name
    return "MISSING"


async def _register_with_router_system() -> None:
    """POST service registration to the Agent OS router-system on startup."""
    base = (settings.AGENT_OS_URL or "").strip().rstrip("/")
    if not base:
        logger.info("router_system.skip", reason="AGENT_OS_URL not set")
        return
    if not settings.AGENT_OS_API_KEY:
        logger.info("router_system.skip", reason="AGENT_OS_API_KEY not set")
        return
    import httpx

    payload = {
        "repo_id": "neufin-backend",
        "service_name": "NeuFin Backend API",
        "health_url": f"{settings.APP_BASE_URL.rstrip('/')}/health",
        "base_url": settings.APP_BASE_URL,
        "version": settings.GIT_COMMIT_SHA,
        "environment": settings.ENVIRONMENT,
    }
    path = settings.AGENT_OS_REGISTER_PATH.strip()
    if not path.startswith("/"):
        path = "/" + path
    url = f"{base}{path}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                url,
                json=payload,
                headers=_agent_os_headers(settings.AGENT_OS_API_KEY),
            )
            resp.raise_for_status()
            logger.info("router_system.registered", status=resp.status_code, url=url)
    except Exception as exc:
        logger.warning("router_system.register_failed", error=str(exc), url=url)


async def _heartbeat_loop() -> None:
    """Send a heartbeat to the Agent OS router-system every 60 seconds."""
    import httpx

    global _heartbeat_422_logged

    base = (settings.AGENT_OS_URL or "").strip().rstrip("/")
    hb_path = settings.AGENT_OS_HEARTBEAT_PATH.strip()
    if not hb_path.startswith("/"):
        hb_path = "/" + hb_path
    heartbeat_url = f"{base}{hb_path}" if base else ""

    while True:
        await asyncio.sleep(60)
        if not base or not settings.AGENT_OS_API_KEY:
            continue
        try:
            payload = {
                "service": "neufin-backend",
                "status": "ok",
                "version": settings.APP_VERSION,
                "environment": settings.ENVIRONMENT,
                "uptime_seconds": round(time.monotonic() - _startup_time, 1),
                "base_url": settings.APP_BASE_URL,
                "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    heartbeat_url,
                    json=payload,
                    headers=_agent_os_headers(settings.AGENT_OS_API_KEY),
                )
                if resp.status_code == 422:
                    if not _heartbeat_422_logged:
                        logger.warning(
                            "router_system.heartbeat_schema_mismatch_with_agent_os",
                            status=resp.status_code,
                        )
                        _heartbeat_422_logged = True
                else:
                    resp.raise_for_status()
                    logger.debug(
                        "router_system.heartbeat_sent",
                        status=resp.status_code,
                        url=heartbeat_url,
                    )
        except httpx.HTTPStatusError as exc:
            detail = (exc.response.text or "")[:300]
            hint = None
            if exc.response.status_code == 404 and "Application not found" in detail:
                hint = (
                    "Railway returned 'Application not found' — AGENT_OS_URL is not a live "
                    "router-system deployment. Set AGENT_OS_URL (and AGENT_OS_HEARTBEAT_PATH if needed) "
                    "to your Agent OS service URL."
                )
            logger.warning(
                "router_system.heartbeat_failed",
                error=str(exc),
                url=heartbeat_url,
                status=exc.response.status_code,
                detail=detail or None,
                hint=hint,
            )
        except Exception as exc:
            logger.warning(
                "router_system.heartbeat_failed",
                error=str(exc),
                url=heartbeat_url or None,
            )


# ── FastAPI lifespan ──────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _startup_time, _heartbeat_task

    # Validate required env vars — exits with clear message if any are missing
    settings.validate_required()

    _startup_time = time.monotonic()
    logger.info(
        "app.startup",
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        sentry_active=bool(settings.SENTRY_DSN),
    )
    logger.info(
        "env.alias_resolution",
        anthropic_key_source=_first_present_env("ANTHROPIC_API_KEY", "ANTHROPIC_KEY_1"),
        gemini_key_source=_first_present_env("GEMINI_KEY", "GOOGLE_API_KEY"),
        openai_key_source=_first_present_env("OPENAI_KEY", "OPENAI_API_KEY"),
        supabase_service_key_source=_first_present_env(
            "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"
        ),
        agent_os_key_source=_first_present_env("AGENT_OS_API_KEY", "ROUTER_SECRET_KEY"),
    )

    # Register with router-system (non-blocking — warning on failure)
    await _register_with_router_system()

    # Start background heartbeat
    _heartbeat_task = asyncio.create_task(_heartbeat_loop())

    # ── APScheduler: Research Intelligence Layer ──────────────────────────────
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger
        from apscheduler.triggers.interval import IntervalTrigger

        from services.research.macro_watcher import run_macro_watcher
        from services.research.news_intelligence import run_news_intelligence
        from services.research.regime_detector import run_regime_detector
        from services.research.synthesiser import run_daily_synthesis

        _scheduler = AsyncIOScheduler(timezone="Asia/Singapore")
        # Macro data: every 4 hours
        _scheduler.add_job(
            run_macro_watcher,
            IntervalTrigger(hours=4),
            id="macro_watcher",
            replace_existing=True,
        )
        # News: every 2 hours
        _scheduler.add_job(
            run_news_intelligence,
            IntervalTrigger(hours=2),
            id="news_intelligence",
            replace_existing=True,
        )
        # Regime detection: every 6 hours
        _scheduler.add_job(
            run_regime_detector,
            IntervalTrigger(hours=6),
            id="regime_detector",
            replace_existing=True,
        )
        # Daily synthesis: 06:00 SGT
        _scheduler.add_job(
            run_daily_synthesis,
            CronTrigger(hour=6, minute=0),
            id="daily_synthesis",
            replace_existing=True,
        )
        # Weekly sales digest: Monday 08:00 SGT
        from services.sales_digest import run_weekly_sales_digest

        _scheduler.add_job(
            run_weekly_sales_digest,
            CronTrigger(day_of_week="mon", hour=8, minute=0),
            id="weekly_sales_digest",
            replace_existing=True,
        )
        _scheduler.start()
        logger.info(
            "scheduler.started",
            jobs=[
                "macro_watcher",
                "news_intelligence",
                "regime_detector",
                "daily_synthesis",
                "weekly_sales_digest",
            ],
        )
    except Exception as _sched_exc:
        logger.warning("scheduler.start_failed", error=str(_sched_exc))

    yield  # ── app is running ─────────────────────────────────────────────────

    # Shutdown
    if _heartbeat_task and not _heartbeat_task.done():
        _heartbeat_task.cancel()
        try:
            await _heartbeat_task
        except asyncio.CancelledError:
            pass
    logger.info("app.shutdown")


# ── Auth config ────────────────────────────────────────────────────────────────
#
# UNAUTHENTICATED ACCESS DOCUMENTATION
# ======================================
# The auth_middleware is SOFT — it never rejects; it only attaches
# request.state.user when a valid token is found. Rejection is enforced
# per-endpoint via FastAPI Depends(get_current_user).
#
# Paths accessible without any authentication (open to the internet):
#   GET  /                        — landing / health redirect
#   GET  /health                  — uptime check, no secrets
#   GET  /docs, /redoc, /openapi.json  — API docs (consider restricting in prod)
#   GET  /metrics                 — Prometheus (consider IP-allow in prod)
#   POST /api/analyze-dna         — guest DNA analysis (rate-limited: 3/IP/24h)
#   GET  /api/dna/share/{id}      — shareable DNA score link
#   GET  /api/dna/leaderboard     — public leaderboard
#   POST /api/reports/checkout    — initiate Stripe checkout (no sensitive data)
#   GET  /api/reports/fulfill     — PDF download (gated by report ownership check)
#   POST /api/stripe/webhook      — Stripe webhook (gated by sig validation)
#   GET  /api/payments/plans      — list public pricing plans
#   GET  /api/portfolio/chart/*   — public chart data
#   GET  /api/referrals/*         — referral landing pages
#   POST /api/emails/*            — email capture / waitlist
#   GET  /api/advisors/*          — public advisor profiles (not private endpoints)
#   GET  /api/market/*            — public market data
#   POST /api/analytics/track     — client-side event tracking
#   GET  /api/swarm/*             — public swarm results
#   GET  /api/admin/health        — internal health check (same as /health)
#   GET  /api/auth/status         — auth status ping (returns null user if unauthed)
#
# COOKIE AUTH DECISION
# =====================
# auth_middleware reads BOTH the `sb-access-token` cookie AND the `neufin-auth`
# cookie. The `neufin-auth` cookie is written by neufin-web/lib/sync-auth-cookie.ts
# and validated by the Next.js middleware for server-side rendering.
# Decision: KEEP the neufin-auth cookie path.
# Rationale: The SSR pages (advisors dashboard, report pages) require a cookie
# that is forwarded with the SSR fetch to this API. Removing it would break SSR
# auth without any security benefit, since both cookies carry the same Supabase
# JWT and are validated identically.
#
PUBLIC_PATHS = {"/", "/health", "/docs", "/redoc", "/openapi.json", "/metrics"}
PUBLIC_PREFIXES = [
    "/api/analyze-dna",
    "/api/dna/share/",
    "/api/dna/leaderboard",
    "/api/reports/checkout",
    "/api/reports/fulfill",
    "/api/stripe/webhook",
    "/api/payments/plans",
    "/api/plans",
    "/api/leads",
    "/api/portfolio/chart/",
    "/api/referrals/",
    "/api/emails/",
    "/api/advisors/",
    "/api/market/",
    "/api/analytics/track",
    "/api/swarm/",
    "/api/admin/health",
    "/api/auth/status",
    "/api/research/regime",
    "/api/research/notes",
]


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Neufin API",
    description="AI Portfolio Intelligence Platform",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    debug=settings.debug,
)


# ── Global exception handler: never leak stack traces to clients ──────────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Catch-all for any exception not handled by a specific route.
    Sends the exception to Sentry, then returns a safe JSON response that
    includes the trace_id so support can correlate logs without exposing
    internal details.
    """
    from fastapi import HTTPException as _HTTPEx
    from starlette.responses import JSONResponse as _JSONResponse

    if isinstance(exc, _HTTPEx):
        raise exc

    trace_id = getattr(getattr(request, "state", None), "trace_id", None) or str(
        uuid.uuid4()
    )
    sentry_sdk.capture_exception(exc)
    logger.error(
        "unhandled_exception",
        trace_id=trace_id,
        path=request.url.path,
        exc=str(exc),
        exc_type=type(exc).__name__,
    )
    return _JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "trace_id": trace_id,
            "message": "An error occurred. Our team has been notified.",
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        },
        headers={"X-Trace-Id": trace_id},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """
    Standardised error shape for all HTTP exceptions:
    {error, message, trace_id, timestamp}
    """
    from starlette.responses import JSONResponse as _JSONResponse

    trace_id = getattr(getattr(request, "state", None), "trace_id", None) or str(
        uuid.uuid4()
    )
    return _JSONResponse(
        status_code=exc.status_code,
        content={
            "error": _http_status_slug(exc.status_code),
            "message": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
            "trace_id": trace_id,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        },
        headers={"X-Trace-Id": trace_id},
    )


# Starlette raises MethodNotAllowedException as a StarletteHTTPException which
# bypasses the FastAPI HTTPException handler above.  Register the same handler
# for the Starlette base class so 405 (and similar) get our standard shape.
from starlette.exceptions import HTTPException as _StarletteHTTPException  # noqa: E402


@app.exception_handler(_StarletteHTTPException)
async def starlette_http_exception_handler(
    request: Request, exc: _StarletteHTTPException
):
    from starlette.responses import JSONResponse as _JSONResponse

    trace_id = getattr(getattr(request, "state", None), "trace_id", None) or str(
        uuid.uuid4()
    )
    return _JSONResponse(
        status_code=exc.status_code,
        content={
            "error": _http_status_slug(exc.status_code),
            "message": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
            "trace_id": trace_id,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        },
        headers={"X-Trace-Id": trace_id},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Standardised error shape for Pydantic / FastAPI request validation errors:
    {error, message, trace_id, timestamp}
    """
    from starlette.responses import JSONResponse as _JSONResponse

    trace_id = getattr(getattr(request, "state", None), "trace_id", None) or str(
        uuid.uuid4()
    )
    first_error = exc.errors()[0] if exc.errors() else {}
    loc = " → ".join(str(part) for part in first_error.get("loc", []))
    message = (
        f"{loc}: {first_error.get('msg', 'Validation error')}"
        if loc
        else first_error.get("msg", "Invalid request")
    )
    return _JSONResponse(
        status_code=422,
        content={
            "error": "validation_error",
            "message": message,
            "trace_id": trace_id,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        },
        headers={"X-Trace-Id": trace_id},
    )


def _http_status_slug(status_code: int) -> str:
    return {
        400: "bad_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        405: "method_not_allowed",
        409: "conflict",
        422: "validation_error",
        429: "too_many_requests",
        500: "internal_error",
        502: "bad_gateway",
        503: "service_unavailable",
    }.get(status_code, f"http_{status_code}")


# ── Observability: Prometheus metrics endpoint (/metrics) ─────────────────────
try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        should_respect_env_var=False,
        excluded_handlers=["/metrics", "/health"],
    ).instrument(app).expose(
        app, endpoint="/metrics", include_in_schema=True, tags=["system"]
    )
except ImportError:
    logger.warning(
        "prometheus.unavailable",
        detail="prometheus_fastapi_instrumentator not installed; /metrics unavailable",
    )

# ── CORS — origins from settings ──────────────────────────────────────────────
_origin_regex = r"https://(www\.)?neufin\.ai|https://[a-zA-Z0-9\-]+\.vercel\.app"

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
# allow_origins is driven by the ALLOWED_ORIGINS env var (see above).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_origin_regex=_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ── Request logging + trace_id middleware (outermost after CORS) ──────────────
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """
    Attach a unique trace_id to every request via structlog contextvars so that
    all log lines emitted during the request carry the same trace_id.
    Logs: method, path, status_code, duration_ms, user_id (if authenticated).
    """
    trace_id = str(uuid.uuid4())
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(trace_id=trace_id)
    request.state.trace_id = trace_id

    t0 = time.monotonic()
    response = await call_next(request)
    duration_ms = round((time.monotonic() - t0) * 1000, 1)

    # Lightweight latency / error samples for GET /api/admin/system (in-process).
    try:
        p = request.url.path
        if p not in (
            "/health",
            "/api/admin/health",
            "/metrics",
            "/favicon.ico",
            "/openapi.json",
        ):
            from services.request_metrics import record_http_sample

            record_http_sample(
                duration_ms=duration_ms,
                status_code=response.status_code,
                path=p,
            )
    except Exception as exc:
        logger.warning(
            "http.request_metrics_sample_failed",
            error=str(exc),
            path=request.url.path,
        )

    user_id = getattr(getattr(request.state, "user", None), "id", None)
    logger.info(
        "http.request",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=duration_ms,
        user_id=user_id,
        trace_id=trace_id,
    )
    response.headers["X-Trace-Id"] = trace_id
    return response


# ── Step 2: auth_middleware (registered last → outermost layer) ───────────────
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """
    Soft-attach a verified JWTUser to request.state.user for every request.
    Never rejects — authentication enforcement is per-endpoint via Depends(get_current_user).
    """
    if request.method == "OPTIONS":
        return await call_next(request)

    if request.url.path in ("/health", "/api/admin/health"):
        return await call_next(request)

    # ── Soft JWT attachment ────────────────────────────────────────────────────
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
    elif request.cookies.get("sb-access-token"):
        token = request.cookies.get("sb-access-token")
    elif request.cookies.get("neufin-auth"):
        token = request.cookies.get("neufin-auth")

    if token:
        token = token.strip().strip('"').strip("'")
    if token:
        try:
            request.state.user = await verify_jwt(token)
            # Attach user identity to all Sentry events for this request
            sentry_sdk.set_user({"id": request.state.user.id})
            sentry_sdk.set_tag("endpoint", request.url.path)
        except Exception as exc:
            logger.warning(
                "auth.token_rejected", path=request.url.path, reason=str(exc)
            )
            request.state.user = None
    else:
        request.state.user = None

    return await call_next(request)


# ── Routers ────────────────────────────────────────────────────────────────────

app.include_router(dna.router)
app.include_router(portfolio.router)
app.include_router(quant_router.router)
app.include_router(reports.router)
app.include_router(payments.router)
app.include_router(referrals.router)
app.include_router(advisors.router)
app.include_router(advisor_router.router)
app.include_router(developer_router.router)
app.include_router(leads_router.router)
app.include_router(market.router)
app.include_router(vault.router)
app.include_router(vault.plans_router)
app.include_router(swarm.router)
app.include_router(alerts.router)
app.include_router(admin_router.router)
app.include_router(revenue_router.router)
app.include_router(research_router.router)
app.include_router(profile_router.router)
app.include_router(risk_router.router)


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
    file: UploadFile | None = File(None),
    csv_file: UploadFile | None = File(None),
    upload: UploadFile | None = File(None),
    data: UploadFile | None = File(None),
):
    """
    Upload CSV → Investor DNA Score.
    Accepts common multipart field names: file, csv_file, upload, data.
    Prices fetched concurrently from Finnhub → Alpha Vantage.
    """
    incoming_file = file or csv_file or upload or data
    if incoming_file is None:
        raise HTTPException(status_code=422, detail="File required.")

    # ── Guest rate-limiting (unauthenticated callers: max 3 analyses per IP per 24h) ─
    # Cookie auth is preserved for SSR (see auth_middleware notes); this limit only
    # applies when NO valid JWT is present.
    _requesting_user = getattr(getattr(request, "state", None), "user", None)
    if _requesting_user is None:
        _client_ip = (
            (
                request.headers.get("X-Forwarded-For")
                or (request.client.host if request.client else "")
            )
            .split(",")[0]
            .strip()
        )
        _today = datetime.date.today().isoformat()
        try:
            _limit_row = (
                supabase.table("guest_analysis_limits")
                .select("count")
                .eq("ip", _client_ip)
                .eq("window_start", _today)
                .limit(1)
                .execute()
            )
            _current_count = _limit_row.data[0]["count"] if _limit_row.data else 0
            if _current_count >= 3:
                raise HTTPException(
                    status_code=429,
                    detail="Guest analysis limit reached (3 per day). Please sign in to continue.",
                )
            # Upsert counter for this IP/day
            if _limit_row.data:
                supabase.table("guest_analysis_limits").update(
                    {"count": _current_count + 1}
                ).eq("ip", _client_ip).eq("window_start", _today).execute()
            else:
                supabase.table("guest_analysis_limits").insert(
                    {"ip": _client_ip, "window_start": _today, "count": 1}
                ).execute()
        except HTTPException:
            raise
        except Exception as _e:
            logger.warning("guest_rate_limit.check_failed", error=str(_e))
            # Fail open — don't block the user if the rate-limit table is unavailable

    # ── 0. Diagnostics ─────────────────────────────────────────────────────────
    logger.debug(
        "analyze_dna.upload",
        content_type=request.headers.get("content-type", "MISSING"),
        filename=incoming_file.filename,
        file_content_type=incoming_file.content_type,
    )

    # ── 1. Read + parse CSV ────────────────────────────────────────────────────
    try:
        contents = await incoming_file.read()
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
        df.columns = [c.lower().strip() for c in df.columns]
    except Exception as e:
        logger.warning("analyze_dna.csv_parse_error", error=str(e))
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
            logger.warning(
                "JWT verification failed for anonymous upload", exc_info=True
            )

    # ── 2.1 Subscription usage gate ─────────────────────────────────────────────
    # Paywall rules:
    # - Viewing existing portfolios/metrics is soft-paywall (handled by other endpoints).
    # - Upload + analysis is hard-paywall after trial expiry: return 402 + checkout_url.
    # - During trial: treat as Advisor-tier (full access).
    if user_id:
        try:
            from routers.vault import PLAN_DNA_LIMITS
            from services.auth_dependency import get_subscription_status as _sub_status
            from services.usage_tracker import check_dna_limit

            sub = _sub_status(user_id)
            status_val = sub.get("status")
            tier_val = str(sub.get("tier") or "").lower()

            if status_val == "expired" and tier_val not in (
                "retail",
                "advisor",
                "enterprise",
            ):
                # Trial expired and no paid subscription: block new analyses and provide Stripe checkout URL.
                price_id = (
                    settings.STRIPE_PRICE_ADVISOR_MONTHLY
                    or settings.STRIPE_PRICE_ADVISOR_REPORT_ONETIME
                )
                if not (settings.STRIPE_SECRET_KEY and price_id):
                    raise HTTPException(
                        status_code=402,
                        detail={
                            "code": "SUBSCRIPTION_REQUIRED",
                            "message": "Trial expired. Subscribe to upload a new portfolio.",
                            "upgrade_url": "/pricing",
                        },
                    )

                stripe.api_key = settings.STRIPE_SECRET_KEY
                mode = (
                    "subscription"
                    if settings.STRIPE_PRICE_ADVISOR_MONTHLY
                    else "payment"
                )
                session_params: dict = {
                    "line_items": [{"price": price_id, "quantity": 1}],
                    "mode": mode,
                    "success_url": f"{settings.APP_BASE_URL}/dashboard?billing=success&session_id={{CHECKOUT_SESSION_ID}}",
                    "cancel_url": f"{settings.APP_BASE_URL}/dashboard/portfolio?billing=cancelled",
                    "metadata": {
                        "plan": "unlimited" if mode == "subscription" else "single",
                        "user_id": user_id,
                    },
                }
                try:
                    session = await asyncio.to_thread(
                        lambda: stripe.checkout.Session.create(**session_params)
                    )
                    raise HTTPException(
                        status_code=402,
                        detail={
                            "code": "SUBSCRIPTION_REQUIRED",
                            "message": "Trial expired. Subscribe to upload a new portfolio.",
                            "checkout_url": session.url,
                        },
                    )
                except stripe.StripeError as e:
                    raise HTTPException(
                        status_code=402,
                        detail={
                            "code": "SUBSCRIPTION_REQUIRED",
                            "message": "Trial expired. Subscribe to continue.",
                            "upgrade_url": "/pricing",
                            "stripe_error": e.user_message,
                        },
                    ) from e

            # Trial override for usage limits (treat as advisor tier).
            if status_val == "trial":
                tier_val = "advisor"

            _profile = (
                supabase.table("user_profiles")
                .select("subscription_tier")
                .eq("id", user_id)
                .limit(1)
                .execute()
            )
            stored_tier = (
                _profile.data[0].get("subscription_tier") if _profile.data else None
            ) or "free"
            _tier = tier_val or str(stored_tier).lower()
            _limit = PLAN_DNA_LIMITS.get(_tier, 3)
            _check = check_dna_limit(user_id, _limit)
            if not _check["allowed"]:
                raise HTTPException(
                    status_code=402,
                    detail={
                        "error": "limit_reached",
                        "message": "Monthly DNA analysis limit reached. Upgrade to continue.",
                        "upgrade_url": "/pricing",
                        "plan": _tier,
                        "used": _check["used"],
                        "limit": _check["limit"],
                    },
                )
        except HTTPException:
            raise
        except Exception as _e:
            logger.warning("usage_gate.check_failed", user_id=user_id, error=str(_e))
            # Fail open — don't block user if usage table is unavailable

    # ── 3. Analytics — disabled until analytics_events table is created ──────────
    # await track("dna_upload_started", {"rows": len(df), "filename": file.filename}, user_id=user_id)

    # ── 4. Data preparation ────────────────────────────────────────────────────
    df["shares"] = pd.to_numeric(df["shares"], errors="coerce").fillna(0)
    symbols = df["symbol"].str.upper().unique().tolist()

    # ── 5. Price fetching — partial success like calculate_portfolio_metrics ───
    # # SEA-TICKER-FIX: never write $0 for missing quotes; exclude unpriced rows
    # from totals; return failed_tickers + warnings instead of failing the upload.
    price_results = await asyncio.gather(
        *[asyncio.to_thread(get_price_with_fallback, sym) for sym in symbols],
        return_exceptions=True,
    )
    failed_tickers: list[str] = []
    price_warnings: list[str] = []
    status_by_sym: dict[str, str] = {}
    price_map: dict[str, float | None] = {}
    for sym, result in _zip_equal_lengths(symbols, price_results):
        if isinstance(result, ValueError) and "DATA_INTEGRITY_ERROR" in str(result):
            failed_tickers.append(sym)
            price_map[sym] = None
            status_by_sym[sym] = "error"
        elif isinstance(result, Exception):
            logger.warning("analyze_dna.price_error", symbol=sym, error=str(result))
            failed_tickers.append(sym)
            price_map[sym] = None
            status_by_sym[sym] = "error"
        else:
            st = getattr(result, "status", "") or ""
            status_by_sym[sym] = st
            if getattr(result, "warning", ""):
                price_warnings.append(str(result.warning))
            if st == "unresolvable" or getattr(result, "price", None) is None:
                failed_tickers.append(sym)
                price_map[sym] = None
            elif isinstance(result.price, (int, float)) and float(result.price) <= 0:  # noqa: UP038
                failed_tickers.append(sym)
                price_map[sym] = None
            else:
                price_map[sym] = float(result.price)  # type: ignore[union-attr]
                persist_resolution_best_effort(resolve_security(sym))

    df["symbol"] = df["symbol"].str.upper()

    def _px_for(sym: str) -> float:
        v = price_map.get(sym)
        return float(v) if v is not None else float("nan")

    df["current_price"] = df["symbol"].map(_px_for)
    df["value"] = (df["shares"] * df["current_price"]).round(2)
    total_value = float(df["value"].sum())
    if total_value <= 0 or not (
        (df["current_price"].notna()) & (df["shares"] > 0)
    ).any():
        raise HTTPException(
            status_code=422,
            detail=(
                "No tickers could be priced. Check symbols/markets and try again. "
                f"Unpriced: {', '.join(failed_tickers) if failed_tickers else 'all'}"
            ),
        )

    prices_available = bool(price_map)
    if total_value > 0:
        df["weight"] = df["value"].fillna(0.0) / total_value
    else:
        df["weight"] = 0.0
    df.loc[df["current_price"].isna(), "weight"] = 0.0
    max_pos = float(df["weight"].max() * 100) if total_value > 0 else 0.0

    # ── 6. Scoring — 4-component model ────────────────────────────────────────
    # HHI concentration (25 pts)
    hhi_pts = _hhi_score(df["weight"])

    # Weighted beta (25 pts)
    beta_results = await asyncio.gather(
        *[asyncio.to_thread(fetch_beta, sym) for sym in df["symbol"].tolist()],
        return_exceptions=True,
    )
    df["beta"] = [b if isinstance(b, float) else 1.0 for b in beta_results]
    weighted_beta = float((df["weight"] * df["beta"]).sum()) if total_value > 0 else 1.0
    beta_pts = _beta_score(weighted_beta)

    # Tax alpha (20 pts)
    tax_pts = _tax_alpha_score(df)

    # Correlation factor (30 pts) — top-5 holdings via Alpha Vantage TIME_SERIES_DAILY
    top5_symbols = (
        df.loc[df["weight"] > 0].nlargest(5, "weight")["symbol"].tolist()
        if total_value > 0
        else df["symbol"].tolist()[:5]
    )
    weights_dict = dict(
        _zip_equal_lengths(df["symbol"].tolist(), df["weight"].tolist())
    )
    corr_matrix = await asyncio.to_thread(build_correlation_matrix, top5_symbols)
    clusters = find_correlation_clusters(corr_matrix, weights_dict)
    corr_pts, avg_corr = correlation_penalty_score(clusters, corr_matrix)

    dna_score = max(5, min(100, int(hhi_pts + beta_pts + tax_pts + corr_pts)))
    score_breakdown = {
        "hhi_concentration": hhi_pts,
        "beta_risk": beta_pts,
        "tax_alpha": tax_pts,
        "correlation": corr_pts,
    }

    # ── 7. AI analysis ─────────────────────────────────────────────────────────
    ccy_set = {resolve_security(s).native_currency for s in df["symbol"].tolist()}
    multi_ccy = len(ccy_set) > 1
    if prices_available:
        price_note = ""
        if multi_ccy:
            price_note = (
                "\nNote: Holdings use multiple listing currencies "
                f"({', '.join(sorted(ccy_set))}); totals are not FX-converted to a single currency.\n"
            )
        if failed_tickers:
            price_note += (
                f"\nNote: No live quote for: {', '.join(sorted(set(failed_tickers)))}. "
                "Those lines are excluded from totals; do not treat them as zero-value by choice.\n"
            )
    else:
        price_note = "\nNote: Live market prices are currently unavailable. Analyze based on share quantities and symbol weights only; do not reference dollar values.\n"

    tax_analysis = get_tax_impact_analysis(df)
    tax_narrative = tax_analysis.get("narrative", "")
    cluster_narrative = format_clusters_for_ai(clusters)

    _prompt_positions = df.assign(
        native_currency=df["symbol"].map(lambda s: resolve_security(s).native_currency)
    )
    _prompt_records = []
    for _, prow in _prompt_positions.iterrows():
        cpp = prow["current_price"]
        vvv = prow["value"]
        _prompt_records.append(
            {
                "symbol": prow["symbol"],
                "shares": float(prow["shares"]),
                "native_currency": prow["native_currency"],
                "current_price": None if pd.isna(cpp) else float(cpp),
                "value": None if pd.isna(vvv) else float(vvv),
            }
        )

    prompt = f"""You are a behavioral finance expert.{price_note}
Portfolio: {_prompt_records}
Total value (mixed-currency sum, not FX-adjusted): {total_value:,.2f}
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
        logger.error("analyze_dna.ai_failed", error=str(e))
        raise HTTPException(
            status_code=503, detail="AI analysis providers are unavailable."
        ) from e

    # ── 8. Format positions ────────────────────────────────────────────────────
    positions_out = []
    for _, row in df[["symbol", "shares", "current_price", "value", "weight"]].iterrows():
        weight = round(float(row["weight"]) * 100, 2) if total_value > 0 else 0.0
        # # SEA-TICKER-FIX: align DNA response with MarketResolver metadata
        _m = resolve_security(str(row["symbol"]))
        cp = row["current_price"]
        vv = row["value"]
        pos = {
            "symbol": row["symbol"],
            "shares": float(row["shares"]),
            "native_currency": _m.native_currency,
            "market_code": _m.market,
            "provider_ticker": _m.provider_ticker,
            "benchmark": _m.benchmark,
            "price": None if pd.isna(cp) else float(cp),
            "value": None if pd.isna(vv) else float(vv),
            "weight": weight,
            "price_status": status_by_sym.get(str(row["symbol"]).upper(), "live"),
        }
        if not pd.isna(vv):
            fx_hint = indicative_sgd_suffix(float(vv), _m.native_currency)
            if fx_hint:
                pos["fx_indicative_sgd"] = fx_hint
        positions_out.append(pos)

    # ── 9. Persist to DB ───────────────────────────────────────────────────────
    logger.info(
        "analyze_dna.score",
        dna_score=dna_score,
        max_pos=round(max_pos, 1),
        hhi=hhi_pts,
        beta=beta_pts,
        tax=tax_pts,
        corr=corr_pts,
        weighted_beta=round(weighted_beta, 2),
        avg_corr=round(avg_corr, 3),
    )

    # ── 9.1. Create Portfolio ─────────────────────────────────────────────
    portfolio_id = None
    try:
        portfolio_name = (
            f"Uploaded {datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d %H:%M')}"
        )
        port_row = {
            "user_id": user_id,
            "name": portfolio_name,
            "total_value": round(total_value, 2),
        }
        port_result = supabase.table("portfolios").insert(port_row).execute()
        if port_result.data and len(port_result.data) > 0:
            portfolio_id = port_result.data[0]["id"]
            logger.debug("analyze_dna.portfolio_inserted", portfolio_id=portfolio_id)
            for pos in positions_out:
                try:
                    # # SEA-TICKER-FIX: optional columns — omit if migration not applied
                    row = {
                        "portfolio_id": portfolio_id,
                        "symbol": pos["symbol"],
                        "shares": pos["shares"],
                        "native_currency": pos.get("native_currency"),
                        "market_code": pos.get("market_code"),
                        "provider_ticker": pos.get("provider_ticker"),
                    }
                    supabase.table("portfolio_positions").insert(row).execute()
                except Exception:
                    try:
                        supabase.table("portfolio_positions").insert(
                            {
                                "portfolio_id": portfolio_id,
                                "symbol": pos["symbol"],
                                "shares": pos["shares"],
                            }
                        ).execute()
                    except Exception:
                        logger.warning(
                            "analyze_dna.position_insert_failed",
                            symbol=pos["symbol"],
                        )
        else:
            logger.warning("analyze_dna.portfolio_empty_response")
            portfolio_id = None
    except Exception as e:
        logger.warning("analyze_dna.portfolio_insert_failed", error=str(e))
        portfolio_id = None

    # ── 9.2. Persist DNA record, link to portfolio ──────────────────────
    share_token = uuid.uuid4().hex[:8]
    record_id = None
    db_payload = {
        "user_id": user_id,
        "portfolio_id": portfolio_id,
        "dna_score": dna_score,
        "investor_type": analysis.get("investor_type"),
        "summary": analysis.get("summary"),
        "strengths": analysis.get("strengths", []),
        "weaknesses": analysis.get("weaknesses", []),
        "recommendation": analysis.get("recommendation"),
        "share_token": share_token,
        "total_value": round(total_value, 2),
    }
    db_payload = {
        k: v
        for k, v in db_payload.items()
        if v is not None or k in ("user_id", "summary")
    }
    try:
        res = supabase.table("dna_scores").insert(db_payload).execute()
        if res.data and len(res.data) > 0:
            record_id = res.data[0].get("id")
            logger.debug("analyze_dna.dna_score_inserted", record_id=record_id)
        else:
            logger.warning("analyze_dna.dna_score_empty_response")
            record_id = None
    except Exception as e:
        logger.warning("analyze_dna.dna_score_insert_failed", error=str(e))
        record_id = None

    # ── 10. Track usage ────────────────────────────────────────────────────────
    if user_id:
        try:
            from services.usage_tracker import track_dna_analysis

            track_dna_analysis(user_id)
        except Exception as _e:
            logger.warning("usage_tracker.track_failed", user_id=user_id, error=str(_e))

    # ── 10b. Fetch market context from research layer ─────────────────────────
    _market_context: dict = {}
    try:
        from services.research.regime_detector import get_current_regime_summary

        _regime = get_current_regime_summary()
        # Fetch latest public macro_outlook note summary
        _note_result = (
            supabase.table("research_notes")
            .select("id,title,executive_summary,regime,generated_at")
            .eq("is_public", True)
            .order("generated_at", desc=True)
            .limit(1)
            .execute()
        )
        _market_context = {
            "regime": _regime.get("regime", "neutral"),
            "regime_confidence": _regime.get("confidence", 0.5),
            "latest_note": _note_result.data[0] if _note_result.data else None,
        }
    except Exception as _ctx_exc:
        logger.debug("analyze_dna.market_context_unavailable", error=str(_ctx_exc))

    # ── 11. Analytics — disabled until analytics_events table is created ─────────
    # await track("dna_upload_started", {"rows": len(df), "filename": file.filename}, user_id=user_id)
    # await track("dna_analysis_complete", {"dna_score": dna_score}, user_id=user_id)

    # ── 12. Response ───────────────────────────────────────────────────────────
    logger.info(
        "analyze_dna.complete",
        dna_score=dna_score,
        record_id=record_id,
        portfolio_id=portfolio_id,
        investor_type=analysis.get("investor_type"),
    )
    num_priced = len([s for s in symbols if s not in set(failed_tickers)])
    out: dict = {
        **analysis,
        "dna_score": dna_score,
        "score_breakdown": score_breakdown,
        "total_value": round(total_value, 2),
        "multi_currency_portfolio": multi_ccy,
        "portfolio_currencies": sorted(ccy_set),
        "num_positions": len(df),
        "num_priced": num_priced,
        "max_position_pct": round(max_pos, 2),
        "weighted_beta": round(weighted_beta, 3),
        "avg_correlation": round(avg_corr, 3),
        "hidden_correlation_clusters": clusters,
        "tax_analysis": tax_analysis,
        "positions": positions_out,
        "share_token": share_token,
        "share_url": f"{settings.APP_BASE_URL}/share/{share_token}",
        "record_id": record_id,
        "portfolio_id": portfolio_id,
        "market_context": _market_context,
    }
    if failed_tickers:
        out["failed_tickers"] = sorted(set(failed_tickers))
    if price_warnings:
        out["warnings"] = price_warnings
    return out


# ── System endpoints ───────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
def health():
    """
    Lightweight liveness + readiness probe.

    Returns:
      status            — "ok" always (unhealthy pods get killed before this runs)
      version           — APP_VERSION from settings
      environment       — ENVIRONMENT from settings
      uptime_seconds    — seconds since last (re)start
      supabase_connected — bool; cached for 30 s (no DB call on every probe)
      sentry_active     — bool; true when SENTRY_DSN is configured
    """
    return {
        "status": "ok",
        "service": "neufin-api",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "uptime_seconds": round(time.monotonic() - _startup_time, 1),
        "supabase_connected": _check_supabase_connected(),
        "sentry_active": bool(settings.SENTRY_DSN),
    }


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
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return {
            "authenticated": False,
            "user_id": None,
            "expires_at": None,
            "error": "No Bearer token supplied",
        }

    token = auth_header.split(" ", 1)[1]
    try:
        from jose import jwt as _jwt

        # Parse unverified claims first so we can always return expires_at
        raw_claims = _jwt.get_unverified_claims(token)
        exp_ts = raw_claims.get("exp")
        expires_at = (
            datetime.datetime.utcfromtimestamp(exp_ts).strftime("%Y-%m-%dT%H:%M:%SZ")
            if exp_ts
            else None
        )

        user = await verify_jwt(token)
        return {
            "authenticated": True,
            "user_id": user.id,
            "expires_at": expires_at,
            "error": None,
        }
    except Exception as exc:
        # Parse expires_at even on failure so callers know whether to refresh
        try:
            raw_claims = _jwt.get_unverified_claims(token)  # type: ignore[possibly-undefined]
            exp_ts = raw_claims.get("exp")
            expires_at = (
                datetime.datetime.utcfromtimestamp(exp_ts).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                )
                if exp_ts
                else None
            )
        except Exception:
            expires_at = None

        return {
            "authenticated": False,
            "user_id": None,
            "expires_at": expires_at,
            "error": str(exc),
        }


@app.get("/api/auth/subscription-status", tags=["auth"])
async def subscription_status(request: Request):
    """
    Return the authenticated user's subscription status.

    Returns:
      status:         'trial' | 'active' | 'expired'
      days_remaining: days left in trial (only when status='trial')
    """
    try:
        user = await get_current_user(request)
    except HTTPException:
        raise

    try:
        result = (
            supabase.table("user_profiles")
            .select("subscription_status, trial_started_at")
            .eq("id", user.id)
            .single()
            .execute()
        )
        data = result.data or {}
    except Exception:
        data = {}

    raw_status = data.get("subscription_status", "trial")
    trial_started_at = data.get("trial_started_at")

    if raw_status == "active":
        return {"status": "active"}

    if raw_status == "expired":
        return {"status": "expired", "days_remaining": 0}

    # Trial: calculate days remaining (14-day trial)
    TRIAL_DAYS = 14
    if trial_started_at:
        try:
            started = datetime.datetime.fromisoformat(
                trial_started_at.replace("Z", "+00:00")
            )
            elapsed = (datetime.datetime.now(datetime.UTC) - started).days
            days_remaining = max(0, TRIAL_DAYS - elapsed)
        except Exception:
            days_remaining = TRIAL_DAYS
    else:
        days_remaining = TRIAL_DAYS

    if days_remaining == 0:
        return {"status": "expired", "days_remaining": 0}

    return {"status": "trial", "days_remaining": days_remaining}


@app.get("/api/admin/health", tags=["system"])
def admin_health():
    """Detailed feature/provider health check — used by frontend useBackendHealth hook."""
    import importlib.util

    def _has(val: str | None) -> bool:
        return bool(val and str(val).strip())

    ai_models = {
        "claude": _has(settings.ANTHROPIC_API_KEY),
        "openai": _has(settings.OPENAI_KEY),
        "gemini": _has(settings.GEMINI_KEY),
        "groq": _has(settings.GROQ_KEY),
    }
    market_providers = {
        "polygon": _has(settings.POLYGON_API_KEY),
        "fmp": _has(settings.FMP_API_KEY),
        "twelvedata": _has(settings.TWELVEDATA_API_KEY),
        "marketstack": _has(settings.MARKETSTACK_API_KEY),
    }
    features = {
        "swarm_engine": True,
        "stress_testing": True,
        "price_verifier": True,
        "alpha_gap": True,
        "agent_chat": True,
        "paywall": True,
        "pdf_reports": bool(importlib.util.find_spec("reportlab")),
        "fernet_encryption": bool(importlib.util.find_spec("cryptography")),
    }
    return {
        "status": "ok",
        "service": "neufin-api",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "ai_models": ai_models,
        "market_providers": market_providers,
        "features": features,
        "active_ai": next((k for k, v in ai_models.items() if v), "none"),
    }


@app.get("/", tags=["system"])
def root():
    return {"message": "Neufin AI Portfolio Intelligence API", "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=True)

# rebuild: activate research intelligence routes
