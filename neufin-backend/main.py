import os
import json
import io
import re
import uuid
import asyncio

import sentry_sdk
import pandas as pd
import yfinance as yf
from anthropic import Anthropic
from google import genai  # Updated to new SDK
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

# Internal imports (Ensure these files exist in your directory)
from database import supabase
from routers import dna, portfolio, reports, payments, referrals
from config import ANTHROPIC_KEY, GEMINI_KEY, GROQ_KEY, SENTRY_DSN, APP_BASE_URL
from services.analytics import track

# ── Helper Functions ───────────────────────────────────────────────────────────
def _strip_json_fences(text: str) -> str:
    """Strip markdown code fences that models sometimes wrap around JSON."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()

# ── Sentry ─────────────────────────────────────────────────────────────────────
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=0.2,   # 20% of transactions
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
    description="AI Portfolio Intelligence Platform — Investor DNA + Advisor Reports",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Google GenAI Client
google_client = genai.Client(api_key=GEMINI_KEY)

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Verify Supabase JWT on all protected routes."""
    path = request.url.path

    # Skip auth for public paths
    if path in PUBLIC_PATHS or any(path.startswith(p) for p in PUBLIC_PREFIXES):
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(
            {"error": "Unauthorized — include 'Authorization: Bearer <token>' header"},
            status_code=401,
        )

    token = auth_header.split(" ", 1)[1]
    try:
        # In newer Supabase-py versions, auth.get_user returns a response object
        user_response = supabase.auth.get_user(token)
        request.state.user = user_response.user
    except Exception:
        return JSONResponse(
            {"error": "Unauthorized — invalid or expired token"},
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
async def analyze_dna(request: Request, file: UploadFile = File(...)):
    """Upload CSV → Investor DNA Score. Fallback sequence: Claude -> Gemini -> Llama."""
    contents = await file.read()
    try:
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
        df.columns = [c.lower().strip() for c in df.columns]
    except Exception:
        raise HTTPException(status_code=400, detail="Could not parse CSV.")

    if "symbol" not in df.columns or "shares" not in df.columns:
        raise HTTPException(status_code=422, detail="CSV must have 'symbol' and 'shares' columns.")

    # Resolve optional user_id from JWT
    user_id = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        jwt = auth_header.split(" ", 1)[1]
        try:
            user_response = supabase.auth.get_user(jwt)
            user_id = user_response.user.id if user_response.user else None
        except Exception:
            pass

    # Funnel tracking
    await track("dna_upload_started", {
        "num_rows": len(df),
        "filename": file.filename,
    }, user_id=user_id)

    df["shares"] = pd.to_numeric(df["shares"], errors="coerce").fillna(0)
    symbols = df["symbol"].str.upper().tolist()

    # Price fetching
    try:
        raw = yf.download(symbols, period="1d", progress=False, auto_adjust=True)["Close"]
        prices = raw.iloc[-1] if hasattr(raw, "iloc") else raw
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Price fetch failed: {e}")

    df["symbol"] = df["symbol"].str.upper()
    df["current_price"] = df["symbol"].map(prices)
    df["value"] = df["shares"] * df["current_price"]
    total_value = float(df["value"].sum())

    # Scoring Logic
    diversification_score = min(len(df) * 3, 30)
    max_position_pct = float((df["value"].max() / total_value) * 100) if total_value > 0 else 0
    concentration_penalty = max(0.0, max_position_pct - 20)
    dna_score = max(0, int(diversification_score - concentration_penalty))

    prompt = f"""You are a behavioral finance expert.
Portfolio data: {df[['symbol', 'shares', 'current_price', 'value']].to_dict(orient='records')}
Total value: ${total_value:,.0f}
Max position: {max_position_pct:.1f}%
DNA Score: {dna_score}/100

Return ONLY valid JSON:
{{
  "investor_type": "one of: Diversified Strategist, Conviction Growth, Momentum Trader, Defensive Allocator, Speculative Investor",
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2"],
  "recommendation": "one specific actionable suggestion"
}}"""

    analysis = None

    # Fallback 1: Anthropic (Claude)
    if ANTHROPIC_KEY:
        try:
            client = Anthropic(api_key=ANTHROPIC_KEY)
            resp = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}],
            )
            analysis = json.loads(_strip_json_fences(resp.content[0].text))
        except Exception as e:
            print(f"Claude failed: {e}")

    # Fallback 2: Google (Gemini) using NEW SDK
    if analysis is None and GEMINI_KEY:
        try:
            # New SDK usage: client.models.generate_content
            resp = google_client.models.generate_content(
                model="gemini-1.5-flash", 
                contents=prompt
            )
            analysis = json.loads(_strip_json_fences(resp.text))
        except Exception as e:
            print(f"Gemini failed: {e}")

    # Fallback 3: Groq (Llama)
    if analysis is None and GROQ_KEY:
        try:
            from groq import Groq
            groq_client = Groq(api_key=GROQ_KEY)
            resp = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "Return ONLY valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
            )
            analysis = json.loads(_strip_json_fences(resp.choices[0].message.content))
        except Exception as e:
            print(f"Groq failed: {e}")

    if not analysis:
        raise HTTPException(status_code=503, detail="All AI analysis providers are currently unavailable.")

    # Format output
    positions_out = (
        df[["symbol", "shares", "current_price", "value"]]
        .rename(columns={"current_price": "price"})
        .assign(weight=lambda d: (d["value"] / total_value * 100).round(2) if total_value > 0 else 0)
        .to_dict("records")
    )

    share_token = uuid.uuid4().hex[:8]
    record_id = None
    
    # Save to Database
    try:
        record = supabase.table("dna_scores").insert({
            "user_id":        user_id,
            "dna_score":      dna_score,
            "investor_type":  analysis.get("investor_type"),
            "strengths":      analysis.get("strengths", []),
            "weaknesses":     analysis.get("weaknesses", []),
            "recommendation": analysis.get("recommendation"),
            "share_token":    share_token,
        }).execute()
        record_id = record.data[0]["id"] if record.data else None
    except Exception as e:
        print(f"[Supabase] dna_scores insert failed: {e}")

    # Track complete
    await track("dna_analysis_complete", {
        "dna_score":     dna_score,
        "investor_type": analysis.get("investor_type"),
        "share_token":   share_token,
    }, user_id=user_id)

    return {
        "dna_score":        dna_score,
        "total_value":      round(total_value, 2),
        "num_positions":    len(df),
        "max_position_pct": round(max_position_pct, 2),
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

# Ensure Railway/Local listens on the correct port
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)