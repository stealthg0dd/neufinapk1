from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from database import supabase
from services.calculator import calculate_portfolio_metrics
from services.ai_router import get_ai_analysis
import yfinance as yf

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
    # Fetch 3-month price data for context
    price_summary = {}
    for symbol in body.symbols[:10]:  # cap at 10
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="3mo")
            if not hist.empty:
                price_summary[symbol] = {
                    "current": round(float(hist["Close"].iloc[-1]), 2),
                    "change_3mo_pct": round(
                        (hist["Close"].iloc[-1] - hist["Close"].iloc[0]) / hist["Close"].iloc[0] * 100, 2
                    ),
                    "avg_volume": int(hist["Volume"].mean()),
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
    try:
        ticker = yf.Ticker(symbol.upper())
        hist = ticker.history(period=period)
        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No data for {symbol}")

        data = [
            {
                "time": ts.strftime("%Y-%m-%d"),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
            }
            for ts, row in hist.iterrows()
        ]
        return {"symbol": symbol.upper(), "period": period, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        prices = yf.download(sym_list, period=period, progress=False, auto_adjust=True)["Close"]
        if isinstance(prices, pd.Series):
            prices = prices.to_frame(name=sym_list[0])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Price fetch failed: {e}")

    weight_map = dict(zip(sym_list, shares_list))
    history = []
    for ts, row in prices.iterrows():
        day_value = sum(
            float(row.get(sym, 0)) * wt
            for sym, wt in weight_map.items()
            if not pd.isna(row.get(sym, float("nan")))
        )
        history.append({"time": ts.strftime("%Y-%m-%d"), "value": round(day_value, 2)})

    return {"history": history}
