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

# Internal imports
# Ensure database.py uses 'supabase = create_async_client(...)'
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

# ── App Initialization ────────────────────────────────────────────────────────
app = FastAPI(
    title="Neufin API",
    description="AI Portfolio Intelligence Platform (March 2026 Build)",
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
        # Use await for async supabase client
        user_response = await supabase.auth.get_user(token)
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
async def analyze_dna(request: Request):
    """Upload CSV → Investor DNA. Flexible field detection to prevent 422 errors."""
    form = await request.form()
    uploaded_file = None
    
    # Nuclear field detection: grab the first file regardless of key name
    for key in form:
        if isinstance(form[key], UploadFile):
            uploaded_file = form[key]
            break
            
    if not uploaded_file:
        raise HTTPException(status_code=422, detail="No file detected in multipart form data.")

    contents = await uploaded_file.read()
    try:
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
        df.columns = [c.lower().strip() for c in df.columns]
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid CSV format.")

    if "symbol" not in df.columns or "shares" not in df.columns:
        raise HTTPException(status_code=422, detail="CSV requires 'symbol' and 'shares' columns.")

    # Optional Auth
    user_id = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            jwt = auth_header.split(" ", 1)[1]
            user_resp = await supabase.auth.get_user(jwt)
            user_id = user_resp.user.id
        except: pass

    # Funnel tracking
    await track("dna_upload_started", {"rows": len(df)}, user_id=user_id)

    df["shares"] = pd.to_numeric(df["shares"], errors="coerce").fillna(0)
    symbols = df["symbol"].str.upper().unique().tolist()

    # Price fetching logic
    try:
        ticker_data = yf.download(symbols, period="1d", progress=False, auto_adjust=True)
        prices_raw = ticker_data["Close"]
        
        if isinstance(prices_raw, pd.DataFrame):
            prices = prices_raw.iloc[-1] # Multi-symbol
        else:
            prices = pd.Series({symbols[0]: float(prices_raw.iloc[-1])}) # Single
    except Exception as e:
        print(f"[Price Fetch] Error: {e}", file=sys.stderr)
        raise HTTPException(status_code=502, detail="Market data providers are down.")

    df["symbol"] = df["symbol"].str.upper()
    df["current_price"] = df["symbol"].map(prices).fillna(0.0)
    df["value"] = df["shares"] * df["current_price"]
    total_value = float(df["value"].sum())

    # Math Logic
    diversification_score = min(len(df) * 3, 30)
    max_pos = float(df["value"].max() / total_value * 100) if total_value > 0 else 0
    dna_score = max(0, int(diversification_score - max(0, max_pos - 20)))

    # AI Request
    prompt = f"""Expert Analysis:
    Portfolio: {df[['symbol', 'shares', 'current_price', 'value']].to_dict(orient='records')}
    Total: ${total_value:,.2f} | DNA Score: {dna_score}
    Return JSON: {{'investor_type': '...', 'strengths': [], 'weaknesses': [], 'recommendation': '...'}}"""

    try:
        analysis = await get_ai_analysis(prompt)
    except Exception as e:
        print(f"[AI Chain] Failed: {e}", file=sys.stderr)
        raise HTTPException(status_code=503, detail="AI Analysis Fallback Exhausted.")

    # DB Persistence (Awaited for 2026 Record Consistency)
    share_token = uuid.uuid4().hex[:8]
    record_id = None
    try:
        db_payload = {
            "user_id": user_id,
            "dna_score": dna_score,
            "investor_type": analysis.get("investor_type"),
            "strengths": analysis.get("strengths", []),
            "weaknesses": analysis.get("weaknesses", []),
            "recommendation": analysis.get("recommendation"),
            "share_token": share_token,
            "metadata": {"total_value": total_value, "num_positions": len(df)}
        }
        # MUST AWAIT to get the record_id back correctly
        record = await supabase.table("dna_scores").insert(db_payload).execute()
        if record.data:
            record_id = record.data[0]["id"]
            print(f"[DB] Saved Record: {record_id}")
    except Exception as e:
        print(f"[DB] Write Error: {e}", file=sys.stderr)

    await track("dna_analysis_complete", {"score": dna_score}, user_id=user_id)

    return {
        "dna_score": dna_score,
        "total_value": round(total_value, 2),
        "num_positions": len(df),
        "max_position_pct": round(max_pos, 2),
        "positions": df[["symbol", "shares", "current_price", "value"]].rename(columns={"current_price": "price"}).to_dict("records"),
        "share_token": share_token,
        "share_url": f"{APP_BASE_URL}/share/{share_token}",
        "record_id": record_id,
        **analysis
    }

@app.get("/health")
def health():
    return {"status": "ok", "epoch": 1741939200} # March 14, 2026

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))