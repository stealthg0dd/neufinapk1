import os
from dotenv import load_dotenv

# ── Environment loading — system env first (Railway), .env file second (local) ─
# os.environ holds variables injected by Railway/Docker before Python starts.
# load_dotenv() is a no-op when a key already exists in os.environ (override=False),
# so this is safe to call unconditionally and won't mask production values.
FINNHUB_KEY = os.environ.get("FINNHUB_API_KEY")
AV_KEY      = os.environ.get("ALPHA_VANTAGE_API_KEY")
if not FINNHUB_KEY or not AV_KEY:
    load_dotenv()
    if not FINNHUB_KEY:
        FINNHUB_KEY = os.getenv("FINNHUB_API_KEY")
    if not AV_KEY:
        AV_KEY = os.getenv("ALPHA_VANTAGE_API_KEY")

import asyncio
import sys
import io
import uuid

import httpx
import pandas as pd
from fastapi import FastAPI, UploadFile, HTTPException, Request, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import supabase
from routers import dna, portfolio, reports, payments, referrals
from config import APP_BASE_URL
from services.analytics import track
from services.ai_router import get_ai_analysis

# ── Startup env-var confirmation ───────────────────────────────────────────────
print(f"[Config] FINNHUB_API_KEY      = {'FOUND ✓' if FINNHUB_KEY else 'MISSING ✗'}", file=sys.stderr)
print(f"[Config] ALPHA_VANTAGE_API_KEY = {'FOUND ✓' if AV_KEY else 'MISSING ✗'}", file=sys.stderr)

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


# ── Market data helpers ────────────────────────────────────────────────────────
async def _get_latest_price(symbol: str, client: httpx.AsyncClient) -> float:
    """
    Fetch the latest price for a single symbol.
    Primary:  Finnhub  /quote
    Fallback: Alpha Vantage GLOBAL_QUOTE
    Returns 0.0 if both sources fail — never raises.
    """
    # ── 1. Finnhub ─────────────────────────────────────────────────────────────
    if FINNHUB_KEY:
        print(f"DEBUG: Fetching {symbol} with key {FINNHUB_KEY[:4]}...", file=sys.stderr)
        try:
            r = await client.get(
                "https://finnhub.io/api/v1/quote",
                params={"symbol": symbol, "token": FINNHUB_KEY},
                timeout=5.0,
            )
            data = r.json()
            print(f"[Price] Finnhub raw {symbol}: {data}", file=sys.stderr)
            price = float(data.get("c") or 0)  # "c" = current price
            if price > 0:
                print(f"[Price] Finnhub {symbol}={price}", file=sys.stderr)
                return price
        except Exception as e:
            print(f"[Price] Finnhub {symbol} failed: {e}", file=sys.stderr)
    else:
        print(f"[Price] FINNHUB_API_KEY not set — skipping Finnhub for {symbol}", file=sys.stderr)

    # ── 2. Alpha Vantage ───────────────────────────────────────────────────────
    if AV_KEY:
        print(f"DEBUG: Fetching {symbol} via AlphaVantage with key {AV_KEY[:4]}...", file=sys.stderr)
        try:
            r = await client.get(
                "https://www.alphavantage.co/query",
                params={
                    "function": "GLOBAL_QUOTE",
                    "symbol": symbol,
                    "apikey": AV_KEY,
                },
                timeout=8.0,
            )
            data = r.json()
            print(f"[Price] AlphaVantage raw {symbol}: {data}", file=sys.stderr)
            price_str = data.get("Global Quote", {}).get("05. price", "0")
            price = float(price_str or 0)
            if price > 0:
                print(f"[Price] AlphaVantage {symbol}={price}", file=sys.stderr)
                return price
        except Exception as e:
            print(f"[Price] AlphaVantage {symbol} failed: {e}", file=sys.stderr)
    else:
        print(f"[Price] ALPHA_VANTAGE_API_KEY not set — skipping AlphaVantage for {symbol}", file=sys.stderr)

    print(f"[Price] {symbol} — all sources failed, defaulting to 0.0", file=sys.stderr)
    return 0.0


async def _fetch_all_prices(symbols: list[str]) -> dict[str, float]:
    """Fetch prices for all symbols concurrently. Returns {symbol: price}."""
    async with httpx.AsyncClient() as client:
        prices_list = await asyncio.gather(
            *[_get_latest_price(sym, client) for sym in symbols]
        )
    return dict(zip(symbols, prices_list))


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
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {e}")

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
            jwt = auth_header.split(" ", 1)[1]
            user_resp = supabase.auth.get_user(jwt)  # sync — no await
            user_id = user_resp.user.id if user_resp.user else None
        except Exception:
            pass

    # ── 3. Analytics — disabled until analytics_events table is created ──────────
    # await track("dna_upload_started", {"rows": len(df), "filename": file.filename}, user_id=user_id)

    # ── 4. Data preparation ────────────────────────────────────────────────────
    df["shares"] = pd.to_numeric(df["shares"], errors="coerce").fillna(0)
    symbols = df["symbol"].str.upper().unique().tolist()

    # ── 5. Price fetching — Finnhub → Alpha Vantage, concurrent ───────────────
    price_map = await _fetch_all_prices(symbols)
    prices_available = any(v > 0 for v in price_map.values())

    df["symbol"] = df["symbol"].str.upper()
    df["current_price"] = df["symbol"].map(price_map).fillna(0.0)
    df["value"] = (df["shares"] * df["current_price"]).round(2)
    total_value = float(df["value"].sum())

    # ── 6. Scoring ─────────────────────────────────────────────────────────────
    max_pos = float(df["value"].max() / total_value * 100) if total_value > 0 else 0
    diversification_score = min(len(df) * 10, 50)
    concentration_penalty = max(0, max_pos - 40)
    dna_score = max(5, min(100, int(diversification_score - concentration_penalty)))

    # ── 7. AI analysis ─────────────────────────────────────────────────────────
    if prices_available:
        price_note = ""
    else:
        price_note = "\nNote: Live market prices are currently unavailable. Analyze based on share quantities and symbol weights only; do not reference dollar values.\n"

    prompt = f"""You are a behavioral finance expert.{price_note}
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
    print(f"[Score] dna_score={dna_score}  max_pos={round(max_pos,1)}%  "
          f"diversification={diversification_score}  penalty={concentration_penalty}",
          file=sys.stderr)

    share_token = uuid.uuid4().hex[:8]
    record_id = None
    db_payload = {                          # only columns that exist in dna_scores
        "user_id":        user_id,
        "dna_score":      dna_score,
        "investor_type":  analysis.get("investor_type"),
        "summary":        analysis.get("summary"),
        "strengths":      analysis.get("strengths", []),
        "weaknesses":     analysis.get("weaknesses", []),
        "recommendation": analysis.get("recommendation"),
        "total_value":    round(total_value, 2),
    }
    # Strip None-valued keys that don't have a matching column to avoid Supabase errors
    db_payload = {k: v for k, v in db_payload.items() if v is not None or k in ("user_id", "summary")}
    print(f"[DB] Inserting payload keys: {list(db_payload.keys())}", file=sys.stderr)
    try:
        response = supabase.table("dna_scores").insert(db_payload, returning="representation").execute()
        if hasattr(response, "data") and response.data:
            record_id = response.data[0].get("id")
            print(f"[DB] SUCCESS: Saved to DB with ID {record_id}", file=sys.stderr)
        else:
            print(f"[DB] Insert returned no data (table may not exist yet)", file=sys.stderr)
    except Exception as e:
        print(f"[DB] Insert failed: {e}", file=sys.stderr)

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
        "dna_score":        dna_score,          # computed value — always wins
        "total_value":      round(total_value, 2),
        "num_positions":    len(df),
        "max_position_pct": round(max_pos, 2),
        "positions":        positions_out,
        "share_token":      share_token,
        "share_url":        f"{APP_BASE_URL}/share/{share_token}",
        "record_id":        record_id,
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
