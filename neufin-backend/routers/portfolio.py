import datetime
import requests
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from database import supabase
from services.calculator import calculate_portfolio_metrics, _fetch_prices
from services.ai_router import get_ai_analysis
from config import FINNHUB_API_KEY, ALPHA_VANTAGE_API_KEY

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


# ─── Models ────────────────────────────────────────────────────────────────────

class PortfolioCreate(BaseModel):
    user_id: str
    name: str
    positions: list[dict]  # [{symbol, shares, cost_basis?, purchase_date?}]


class SignalRequest(BaseModel):
    user_id: str
    portfolio_id: str
    symbols: list[str]


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
            pass

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
            pass

    return None


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/create")
async def create_portfolio(body: PortfolioCreate):
    """Create a portfolio and calculate initial metrics."""
    try:
        metrics = calculate_portfolio_metrics(body.positions)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    try:
        port_result = supabase.table("portfolios").insert({
            "user_id": body.user_id,
            "name": body.name,
            "total_value": metrics["total_value"],
        }).execute()
        portfolio_id = port_result.data[0]["id"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save portfolio: {e}")

    # Insert positions
    for pos in metrics["positions"]:
        try:
            supabase.table("portfolio_positions").insert({
                "portfolio_id": portfolio_id,
                "symbol": pos["symbol"],
                "shares": pos["shares"],
                "cost_basis": pos.get("cost_basis"),
            }).execute()
        except Exception:
            pass

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
        raise HTTPException(status_code=500, detail=str(e))

    if not positions_result.data:
        raise HTTPException(status_code=404, detail="Portfolio or positions not found.")

    try:
        metrics = calculate_portfolio_metrics(positions_result.data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Update cached total_value
    try:
        supabase.table("portfolios").update(
            {"total_value": metrics["total_value"]}
        ).eq("id", portfolio_id).execute()
    except Exception:
        pass

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
            pass

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
        raise HTTPException(status_code=503, detail=f"AI signal generation failed: {e}")

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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
            "low": round(l, 2),
            "close": round(c, 2),
            "volume": v,
        }
        for t, o, h, l, c, v in zip(
            candle["t"], candle["o"], candle["h"], candle["l"], candle["c"], candle.get("v", [0] * len(candle["c"]))
        )
    ]
    return {"symbol": symbol.upper(), "period": period, "data": data}


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
    except ValueError:
        raise HTTPException(status_code=400, detail="shares must be numeric values.")

    if len(sym_list) != len(shares_list):
        raise HTTPException(status_code=400, detail="symbols and shares counts must match.")

    try:
        prices = _fetch_prices(sym_list, period)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Price fetch failed: {e}")

    weight_map = dict(zip(sym_list, shares_list))
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
