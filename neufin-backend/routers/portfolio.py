import datetime

import requests
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import ALPHA_VANTAGE_API_KEY, FINNHUB_API_KEY
from database import decrypt_value, encrypt_value, supabase
from services.ai_router import get_ai_analysis
from services.auth_dependency import get_current_user
from services.calculator import _fetch_prices, calculate_portfolio_metrics, verify_price_integrity
from services.jwt_auth import JWTUser
from services.risk_engine import build_risk_report

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


# ─── Models ────────────────────────────────────────────────────────────────────

class PortfolioCreate(BaseModel):
    user_id:    str
    name:       str
    positions:  list[dict]              # [{symbol, shares, cost_basis?, purchase_date?}]
    session_id: str | None = None   # guest session from localStorage (for claim flow)


class SignalRequest(BaseModel):
    user_id: str
    portfolio_id: str
    symbols: list[str]


class RiskReportRequest(BaseModel):
    symbols: list[str]
    weights: dict[str, float] | None = None   # optional; defaults to equal weight
    threshold: float = 0.70
    days: int = 60


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _candle(symbol: str, period_days: int) -> dict | None:
    """
    Fetch OHLCV candle data for *symbol* over the last *period_days* days.
    Returns a dict with lists: {t, o, h, l, c, v} or None on failure.
    Primary: Finnhub /stock/candle   Fallback: AlphaVantage TIME_SERIES_DAILY
    """
    unix_to = int(datetime.datetime.utcnow().timestamp())
    unix_from = unix_to - period_days * 86400

    # ── 1. Finnhub ─────────────────────────────────────────────────────────────
    if FINNHUB_API_KEY:
        try:
            r = requests.get(
                "https://finnhub.io/api/v1/stock/candle",
                params={
                    "symbol": symbol,
                    "resolution": "D",
                    "from": unix_from,
                    "to": unix_to,
                    "token": FINNHUB_API_KEY,
                },
                timeout=8.0,
            )
            data = r.json()
            if data.get("s") == "ok" and data.get("c"):
                return data
        except Exception:
            logger.warning("Finnhub OHLC fetch failed", exc_info=True)

    # ── 2. Alpha Vantage ───────────────────────────────────────────────────────
    if ALPHA_VANTAGE_API_KEY:
        try:
            r = requests.get(
                "https://www.alphavantage.co/query",
                params={
                    "function": "TIME_SERIES_DAILY",
                    "symbol": symbol,
                    "outputsize": "compact",
                    "apikey": ALPHA_VANTAGE_API_KEY,
                },
                timeout=10.0,
            )
            data = r.json()
            ts_data = data.get("Time Series (Daily)", {})
            if ts_data:
                cutoff = datetime.date.fromtimestamp(unix_from).isoformat()
                rows = sorted(
                    [(k, v) for k, v in ts_data.items() if k >= cutoff],
                    key=lambda x: x[0],
                )
                if rows:
                    return {
                        "t": [int(datetime.datetime.fromisoformat(k).timestamp()) for k, _ in rows],
                        "o": [float(v["1. open"]) for _, v in rows],
                        "h": [float(v["2. high"]) for _, v in rows],
                        "l": [float(v["3. low"]) for _, v in rows],
                        "c": [float(v["4. close"]) for _, v in rows],
                        "v": [int(float(v["5. volume"])) for _, v in rows],
                    }
        except Exception:
            logger.warning("AlphaVantage OHLC fetch failed", exc_info=True)

    return None


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/create")
async def create_portfolio(body: PortfolioCreate):
    """Create a portfolio and calculate initial metrics."""
    try:
        metrics = calculate_portfolio_metrics(body.positions)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    try:
        port_row: dict = {
            "user_id":    body.user_id or None,
            "name":       body.name,
            "total_value": metrics["total_value"],
        }
        if body.session_id:
            port_row["session_id"] = body.session_id
        port_result = supabase.table("portfolios").insert(port_row).execute()
        portfolio_id = port_result.data[0]["id"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save portfolio: {e}") from e

    # Insert positions
    for pos in metrics["positions"]:
        try:
            supabase.table("portfolio_positions").insert({
                "portfolio_id": portfolio_id,
                "symbol": pos["symbol"],
                "shares": pos["shares"],
                "cost_basis": encrypt_value(pos["cost_basis"]) if pos.get("cost_basis") is not None else None,
            }).execute()
        except Exception:
            logger.warning("Position insert failed", exc_info=True)

    return {"portfolio_id": portfolio_id, "metrics": metrics}


@router.get("/{portfolio_id}/metrics")
async def get_portfolio_metrics(portfolio_id: str):
    """Recalculate live metrics for an existing portfolio."""
    try:
        positions_result = (
            supabase.table("portfolio_positions")
            .select("symbol, shares, cost_basis")
            .eq("portfolio_id", portfolio_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    if not positions_result.data:
        raise HTTPException(status_code=404, detail="Portfolio or positions not found.")

    # Decrypt cost_basis in-memory before passing to calculator
    positions_decrypted = []
    for row in positions_result.data:
        row = dict(row)
        if row.get("cost_basis") is not None:
            row["cost_basis"] = decrypt_value(row["cost_basis"])
        positions_decrypted.append(row)

    try:
        metrics = calculate_portfolio_metrics(positions_decrypted)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    # Update cached total_value
    try:
        supabase.table("portfolios").update(
            {"total_value": metrics["total_value"]}
        ).eq("id", portfolio_id).execute()
    except Exception:
        logger.warning("Portfolio total_value update failed", exc_info=True)

    return metrics


@router.post("/signals")
async def generate_trading_signals(body: SignalRequest):
    """Generate AI trading signals for a list of symbols."""
    price_summary = {}
    for symbol in body.symbols[:10]:  # cap at 10
        try:
            candle = _candle(symbol, 90)  # 3-month
            if candle and candle.get("c"):
                closes = candle["c"]
                volumes = candle.get("v", [])
                price_summary[symbol] = {
                    "current": round(float(closes[-1]), 2),
                    "change_3mo_pct": round(
                        (closes[-1] - closes[0]) / closes[0] * 100, 2
                    ) if closes[0] else 0,
                    "avg_volume": int(sum(volumes) / len(volumes)) if volumes else 0,
                }
        except Exception:
            logger.warning("Price summary fetch failed", exc_info=True)

    prompt = f"""You are a quantitative analyst generating trading signals.

Analyse these securities with recent price data:
{price_summary}

For each symbol return a signal. Return ONLY valid JSON:
{{
  "signals": [
    {{
      "symbol": "<TICKER>",
      "signal_type": "<BUY | SELL | HOLD>",
      "confidence": <0-100>,
      "reasoning": "<concise 1-sentence rationale>",
      "target_price": <number or null>,
      "time_horizon": "<1W | 1M | 3M>"
    }}
  ]
}}"""

    try:
        analysis = await get_ai_analysis(prompt)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI signal generation failed: {e}") from e

    # Persist signals to Supabase
    saved = []
    for signal in analysis.get("signals", []):
        try:
            result = supabase.table("trading_signals").insert({
                "user_id": body.user_id,
                "symbol": signal["symbol"],
                "signal_type": signal["signal_type"],
                "confidence": signal["confidence"],
                "reasoning": signal["reasoning"],
            }).execute()
            saved.append(result.data[0])
        except Exception:
            saved.append(signal)

    return {"signals": saved, "price_data": price_summary}


@router.get("/{portfolio_id}/sentiment")
async def get_portfolio_sentiment(portfolio_id: str):
    """Return cached sentiment data for all symbols in a portfolio."""
    try:
        positions_result = (
            supabase.table("portfolio_positions")
            .select("symbol")
            .eq("portfolio_id", portfolio_id)
            .execute()
        )
        symbols = [p["symbol"] for p in positions_result.data]

        sentiment_result = (
            supabase.table("sentiment_data")
            .select("*")
            .in_("symbol", symbols)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return {"sentiment": sentiment_result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/list")
async def list_portfolios(user: JWTUser = Depends(get_current_user)):
    """
    List all portfolios for the authenticated user.

    Returns a PortfolioSummary array matching the mobile app interface:
      portfolio_id, portfolio_name, total_value, dna_score,
      positions_count, created_at

    positions_count is derived from portfolio_positions rows.
    dna_score is pulled from the user's most recent DNA analysis record.
    """
    # ── 1. Fetch portfolios ────────────────────────────────────────────────────
    try:
        port_result = (
            supabase.table("portfolios")
            .select("id, name, total_value, created_at")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not fetch portfolios: {exc}") from exc

    portfolios = port_result.data or []
    if not portfolios:
        return []

    portfolio_ids = [p["id"] for p in portfolios]

    # ── 2. Fetch position counts in a single query ─────────────────────────────
    counts: dict[str, int] = {}
    try:
        pos_result = (
            supabase.table("portfolio_positions")
            .select("portfolio_id")
            .in_("portfolio_id", portfolio_ids)
            .execute()
        )
        for row in (pos_result.data or []):
            pid = row["portfolio_id"]
            counts[pid] = counts.get(pid, 0) + 1
    except Exception:
        logger.warning("Failed to fetch position counts", exc_info=True)

    # ── 3. Fetch latest DNA score for this user ────────────────────────────────
    # dna_scores are stored per-analysis, not per-portfolio.  Return the most
    # recent score as a best-effort value; null if none exist yet.
    latest_dna: int | None = None
    try:
        dna_result = (
            supabase.table("dna_scores")
            .select("dna_score")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if dna_result.data:
            latest_dna = dna_result.data[0].get("dna_score")
    except Exception:
        logger.warning("Failed to fetch latest DNA score", exc_info=True)

    # ── 4. Shape response ──────────────────────────────────────────────────────
    return [
        {
            "portfolio_id":    p["id"],
            "portfolio_name":  p["name"],
            "total_value":     p.get("total_value") or 0,
            "dna_score":       latest_dna,
            "positions_count": counts.get(p["id"], 0),
            "created_at":      p["created_at"],
        }
        for p in portfolios
    ]


@router.get("/user/{user_id}")
async def get_user_portfolios(user_id: str):
    """List all portfolios for a user."""
    try:
        result = (
            supabase.table("portfolios")
            .select("id, name, total_value, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"portfolios": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/chart/{symbol}")
async def get_stock_chart(symbol: str, period: str = "3mo"):
    """Return OHLCV candlestick data for a symbol (lightweight-charts format)."""
    period_days = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365}.get(period, 90)
    candle = _candle(symbol.upper(), period_days)
    if not candle or not candle.get("c"):
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")

    data = [
        {
            "time": datetime.date.fromtimestamp(t).isoformat(),
            "open": round(o, 2),
            "high": round(h, 2),
            "low": round(lam, 2),
            "close": round(c, 2),
            "volume": v,
        }
        for t, o, h, lam, c, v in zip(
            candle["t"], candle["o"], candle["h"], candle["l"], candle["c"], candle.get("v", [0] * len(candle["c"])), strict=False
        )
    ]
    return {"symbol": symbol.upper(), "period": period, "data": data}


@router.post("/risk-report")
async def get_risk_report(body: RiskReportRequest):
    """
    Institutional risk report for a list of symbols.

    Returns correlation matrix, high-correlation pairs (|rho| > threshold),
    and the Effective Number of Bets diversification index.

    If *weights* are omitted, equal weighting is assumed.
    """
    if not body.symbols:
        raise HTTPException(status_code=400, detail="symbols list must not be empty.")

    symbols = [s.strip().upper() for s in body.symbols[:30]]  # cap at 30

    # Resolve weights: use provided map, fall back to equal weight
    if body.weights:
        weights = {s.upper(): body.weights.get(s, body.weights.get(s.upper(), 1.0)) for s in symbols}
    else:
        eq = 1.0 / len(symbols)
        weights = dict.fromkeys(symbols, eq)

    import asyncio
    report = await asyncio.to_thread(
        build_risk_report,
        symbols,
        weights,
        body.threshold,
        body.days,
    )
    return report


@router.get("/value-history")
async def get_portfolio_value_history(symbols: str, shares: str, period: str = "1mo"):
    """
    Compute portfolio value over time for a line chart.
    symbols: comma-separated e.g. AAPL,MSFT
    shares:  comma-separated e.g. 10,5
    """
    sym_list = [s.strip().upper() for s in symbols.split(",")]
    try:
        shares_list = [float(s.strip()) for s in shares.split(",")]
    except ValueError as e:
        raise HTTPException(status_code=400, detail="shares must be numeric values.") from e

    if len(sym_list) != len(shares_list):
        raise HTTPException(status_code=400, detail="symbols and shares counts must match.")

    try:
        prices = _fetch_prices(sym_list, period)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Price fetch failed: {e}") from e

    weight_map = dict(zip(sym_list, shares_list, strict=False))
    history = []
    for date_idx, row in prices.iterrows():
        day_value = sum(
            float(row.get(sym, 0) or 0) * wt
            for sym, wt in weight_map.items()
        )
        history.append({
            "time": date_idx.isoformat() if hasattr(date_idx, "isoformat") else str(date_idx),
            "value": round(day_value, 2),
        })

    return {"history": history}


# ── Price integrity verification ───────────────────────────────────────────────

class VerifyPricesRequest(BaseModel):
    positions:   list[dict]
    total_value: float = 0.0


@router.post("/verify-prices")
async def verify_prices(body: VerifyPricesRequest):
    """
    For any position representing >15% of the portfolio, cross-verify the spot
    price using Polygon and Finnhub. Returns a DATA_INTEGRITY_WARNING if the
    spread between providers exceeds 5%.

    Used by the smoke test and optionally by the frontend to surface bad data.
    """
    if len(body.positions) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 symbols per request.")
    try:
        checks = verify_price_integrity(body.positions)
        return {
            "integrity_checks": checks,
            "warnings": [c for c in checks if c.get("warned")],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Price integrity check failed: {e}") from e
