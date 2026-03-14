import os
import sys
import io
import uuid

import sentry_sdk
import pandas as pd
import yfinance as yf
from fastapi import FastAPI, UploadFile, HTTPException, Request, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

from database import supabase
from routers import dna, portfolio, reports, payments, referrals
from config import SENTRY_DSN, APP_BASE_URL
from services.analytics import track
from services.ai_router import get_ai_analysis

# ── Sentry ─────────────────────────────────────────────────────────────────────
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=0.2,
        profiles_sample_rate=0.1,
        send_default_pii=False,
    )

# ── Auth config ────────────────────────────────────────────────────────────────
PUBLIC_PATHS = {"/", "/health", "/docs", "/redoc", "/openapi.json"}
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
]

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Neufin API",
    description="AI Portfolio Intelligence Platform",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Verify Supabase JWT on all protected routes."""
    path = request.url.path
    if path in PUBLIC_PATHS or any(path.startswith(p) for p in PUBLIC_PREFIXES):
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(
            {"error": "Unauthorized — missing Bearer token"},
            status_code=401,
        )

    token = auth_header.split(" ", 1)[1]
    try:
        user_response = supabase.auth.get_user(token)  # sync client — no await
        request.state.user = user_response.user
    except Exception:
        return JSONResponse(
            {"error": "Unauthorized — invalid session"},
            status_code=401,
        )

    return await call_next(request)


# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(dna.router)
app.include_router(portfolio.router)
app.include_router(reports.router)
app.include_router(payments.router)
app.include_router(referrals.router)


# ── Public DNA endpoint ────────────────────────────────────────────────────────
@app.post("/api/analyze-dna", tags=["dna"])
async def analyze_dna(
    request: Request,
    file: UploadFile = File(...),
):
    """
    Upload CSV → Investor DNA Score.
    Multipart field name must be 'file'.
    FastAPI/python-multipart handles boundary parsing before this function runs.
    """
    # ── 0. Absolute diagnostics — log on every request so Railway logs show headers ──
    print(f"[DIAG] content-type: {request.headers.get('content-type', 'MISSING')}", file=sys.stderr)
    print(f"[DIAG] content-length: {request.headers.get('content-length', 'MISSING')}", file=sys.stderr)
    print(f"[DIAG] file.filename={file.filename!r}  file.content_type={file.content_type!r}", file=sys.stderr)
    print(f"[DIAG] scope type={request.scope.get('type')}  http_version={request.scope.get('http_version')}", file=sys.stderr)

    # ── 1. Read + parse CSV ────────────────────────────────────────────────────
    try:
        contents = await file.read()
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
        df.columns = [c.lower().strip() for c in df.columns]
    except Exception as e:
        print(f"[CSV] Parse error: {e}", file=sys.stderr)
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {e}")

    if "symbol" not in df.columns or "shares" not in df.columns:
        raise HTTPException(
            status_code=422,
            detail="CSV must contain 'symbol' and 'shares' columns.",
        )

    # ── 3. Resolve optional user_id from JWT ───────────────────────────────────
    user_id = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            jwt = auth_header.split(" ", 1)[1]
            user_resp = supabase.auth.get_user(jwt)  # sync — no await
            user_id = user_resp.user.id if user_resp.user else None
        except Exception:
            pass

    # ── 4. Funnel tracking ─────────────────────────────────────────────────────
    await track("dna_upload_started", {
        "rows": len(df),
        "filename": file.filename,
    }, user_id=user_id)

    # ── 5. Data preparation ────────────────────────────────────────────────────
    df["shares"] = pd.to_numeric(df["shares"], errors="coerce").fillna(0)
    symbols = df["symbol"].str.upper().unique().tolist()

    # ── 6. Price fetching ──────────────────────────────────────────────────────
    # yfinance ≥0.2: list input always returns MultiIndex DataFrame → ["Close"] is DataFrame.
    # Older yfinance with single-symbol list may return Series for ["Close"].
    # Both cases handled explicitly via isinstance() to avoid NaN cascade.
    try:
        ticker_data = yf.download(symbols, period="1d", progress=False, auto_adjust=True)
        prices_raw = ticker_data["Close"]
        if isinstance(prices_raw, pd.DataFrame):
            prices = prices_raw.iloc[-1]                                   # multi-symbol path
        elif isinstance(prices_raw, pd.Series):
            prices = pd.Series({symbols[0]: float(prices_raw.iloc[-1])})  # single-symbol fallback
        else:
            prices = pd.Series(dtype=float)
    except Exception as e:
        print(f"[Price] Fetch error: {e}", file=sys.stderr)
        raise HTTPException(status_code=502, detail=f"Market data unavailable: {e}")

    df["symbol"] = df["symbol"].str.upper()
    # fillna(0.0) prevents NaN from propagating into the JSON response.
    # json.dumps(float('nan')) produces invalid JSON; 0.0 is a safe sentinel.
    df["current_price"] = df["symbol"].map(prices).fillna(0.0)
    df["value"] = df["shares"] * df["current_price"]
    total_value = float(df["value"].sum())

    # ── 7. Scoring ─────────────────────────────────────────────────────────────
    diversification_score = min(len(df) * 3, 30)
    max_pos = float(df["value"].max() / total_value * 100) if total_value > 0 else 0
    dna_score = max(0, int(diversification_score - max(0.0, max_pos - 20)))

    # ── 8. AI analysis ─────────────────────────────────────────────────────────
    prompt = f"""You are a behavioral finance expert.
Portfolio: {df[['symbol', 'shares', 'current_price', 'value']].to_dict(orient='records')}
Total value: ${total_value:,.2f}
Max position: {max_pos:.1f}%
DNA Score: {dna_score}/100

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
        raise HTTPException(status_code=503, detail="AI analysis providers are unavailable.")

    # ── 9. Format positions ────────────────────────────────────────────────────
    positions_out = (
        df[["symbol", "shares", "current_price", "value"]]
        .rename(columns={"current_price": "price"})
        .assign(weight=lambda d: (d["value"] / total_value * 100).round(2) if total_value > 0 else 0)
        .to_dict("records")
    )

    # ── 10. Persist to DB ──────────────────────────────────────────────────────
    share_token = uuid.uuid4().hex[:8]
    record_id = None
    try:
        record = supabase.table("dna_scores").insert({  # sync — no await
            "user_id":        user_id,
            "dna_score":      dna_score,
            "investor_type":  analysis.get("investor_type"),
            "strengths":      analysis.get("strengths", []),
            "weaknesses":     analysis.get("weaknesses", []),
            "recommendation": analysis.get("recommendation"),
            "share_token":    share_token,
        }).execute()
        record_id = record.data[0]["id"] if record.data else None
        print(f"[DB] Record saved: {record_id}", file=sys.stderr)
    except Exception as e:
        print(f"[DB] Insert failed: {e}", file=sys.stderr)

    # ── 11. Analytics ──────────────────────────────────────────────────────────
    await track("dna_analysis_complete", {
        "dna_score":     dna_score,
        "investor_type": analysis.get("investor_type"),
        "share_token":   share_token,
    }, user_id=user_id)

    # ── 12. Response ───────────────────────────────────────────────────────────
    return {
        "dna_score":        dna_score,
        "total_value":      round(total_value, 2),
        "num_positions":    len(df),
        "max_position_pct": round(max_pos, 2),
        "positions":        positions_out,
        "share_token":      share_token,
        "share_url":        f"{APP_BASE_URL}/share/{share_token}",
        "record_id":        record_id,
        **analysis,
    }


# ── System endpoints ───────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
def health():
    return {"status": "ok", "service": "neufin-api"}

@app.get("/", tags=["system"])
def root():
    return {"message": "Neufin AI Portfolio Intelligence API", "docs": "/docs"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
