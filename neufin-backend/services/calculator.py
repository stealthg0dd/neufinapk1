import os
import sys
import time
import datetime
import requests
import pandas as pd
import numpy as np

from dotenv import load_dotenv

# System env first, .env fallback (mirrors main.py logic)
FINNHUB_API_KEY       = os.environ.get("FINNHUB_API_KEY")
ALPHA_VANTAGE_API_KEY = os.environ.get("ALPHA_VANTAGE_API_KEY")
if not FINNHUB_API_KEY or not ALPHA_VANTAGE_API_KEY:
    load_dotenv()
    if not FINNHUB_API_KEY:
        FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
    if not ALPHA_VANTAGE_API_KEY:
        ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY")

print(f"[calculator] FINNHUB_API_KEY      = {'FOUND ✓' if FINNHUB_API_KEY else 'MISSING ✗'}", file=sys.stderr)
print(f"[calculator] ALPHA_VANTAGE_API_KEY = {'FOUND ✓' if ALPHA_VANTAGE_API_KEY else 'MISSING ✗'}", file=sys.stderr)

# ── In-process price cache (1-hour TTL) ───────────────────────────────────────
_PRICE_CACHE: dict = {}
_CACHE_TTL = 3600  # seconds

_PERIOD_DAYS = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365}


def _fetch_symbol_history(sym: str, unix_from: int, unix_to: int) -> "pd.Series | None":
    """Fetch daily close prices for one symbol. Returns None on failure."""
    # ── 1. Finnhub /stock/candle ───────────────────────────────────────────────
    if FINNHUB_API_KEY:
        try:
            r = requests.get(
                "https://finnhub.io/api/v1/stock/candle",
                params={
                    "symbol": sym,
                    "resolution": "D",
                    "from": unix_from,
                    "to": unix_to,
                    "token": FINNHUB_API_KEY,
                },
                timeout=8.0,
            )
            data = r.json()
            if data.get("s") == "ok" and data.get("c") and data.get("t"):
                idx = [datetime.date.fromtimestamp(ts) for ts in data["t"]]
                return pd.Series(data["c"], index=idx, name=sym)
        except Exception:
            pass

    # ── 2. Alpha Vantage TIME_SERIES_DAILY ────────────────────────────────────
    if ALPHA_VANTAGE_API_KEY:
        try:
            r = requests.get(
                "https://www.alphavantage.co/query",
                params={
                    "function": "TIME_SERIES_DAILY",
                    "symbol": sym,
                    "outputsize": "compact",
                    "apikey": ALPHA_VANTAGE_API_KEY,
                },
                timeout=10.0,
            )
            data = r.json()
            ts_data = data.get("Time Series (Daily)", {})
            if ts_data:
                closes = {k: float(v["4. close"]) for k, v in ts_data.items()}
                series = pd.Series(closes).sort_index()
                series.name = sym
                # Trim to requested window
                cutoff = datetime.date.fromtimestamp(unix_from).isoformat()
                series = series[series.index >= cutoff]
                return series
        except Exception:
            pass

    return None


def _fetch_prices(symbols: list[str], period: str) -> pd.DataFrame:
    """Fetch daily Close prices for a period, returning from cache if fresh."""
    cache_key = f"{','.join(sorted(symbols))}:{period}"
    entry = _PRICE_CACHE.get(cache_key)
    if entry and (time.time() - entry["ts"]) < _CACHE_TTL:
        return entry["data"]

    period_days = _PERIOD_DAYS.get(period, 30)
    unix_to = int(time.time())
    unix_from = unix_to - period_days * 86400

    all_series: dict[str, pd.Series] = {}
    for sym in symbols:
        s = _fetch_symbol_history(sym, unix_from, unix_to)
        if s is not None:
            all_series[sym] = s

    if not all_series:
        raise RuntimeError("No price history available from any source")

    prices = pd.DataFrame(all_series)
    _PRICE_CACHE[cache_key] = {"data": prices, "ts": time.time()}
    return prices


def calculate_portfolio_metrics(positions: list) -> dict:
    """Calculate diversification, concentration, volatility, and returns."""

    df = pd.DataFrame(positions)

    # Normalise column names (CSV uploads may vary)
    df.columns = [c.lower().strip() for c in df.columns]

    required = {"symbol", "shares"}
    if not required.issubset(set(df.columns)):
        raise ValueError(f"CSV must contain columns: {required}. Got: {list(df.columns)}")

    df["shares"] = pd.to_numeric(df["shares"], errors="coerce").fillna(0)

    symbols = df["symbol"].str.upper().tolist()

    try:
        prices = _fetch_prices(symbols, "1mo")
    except Exception as e:
        raise RuntimeError(f"Failed to fetch price data: {e}")

    latest_prices = prices.iloc[-1]
    df["symbol"] = df["symbol"].str.upper()
    df["current_price"] = df["symbol"].map(latest_prices).fillna(0.0)
    df["current_value"] = df["shares"] * df["current_price"]

    total_value = df["current_value"].sum()
    df["weight"] = df["current_value"] / total_value if total_value > 0 else 0.0

    num_stocks = len(df)
    diversification_score = min(30, num_stocks * 3)

    max_position = float(df["weight"].max())
    concentration_penalty = max(0.0, (max_position - 0.15) * 100)

    # Portfolio volatility (annualised)
    returns = prices.pct_change().dropna()
    weights_series = df.set_index("symbol")["weight"]
    aligned_weights = weights_series.reindex(returns.columns).fillna(0)
    portfolio_returns = (returns * aligned_weights).sum(axis=1)
    volatility = float(portfolio_returns.std() * np.sqrt(252) * 100)

    # Simple gain/loss if cost_basis column exists
    pnl_pct = None
    if "cost_basis" in df.columns:
        df["cost_basis"] = pd.to_numeric(df["cost_basis"], errors="coerce")
        df["cost_value"] = df["shares"] * df["cost_basis"]
        total_cost = df["cost_value"].sum()
        pnl_pct = float((total_value - total_cost) / total_cost * 100) if total_cost > 0 else None

    return {
        "total_value": float(total_value),
        "num_positions": num_stocks,
        "diversification_score": diversification_score,
        "max_position_pct": round(max_position * 100, 2),
        "concentration_risk": round(concentration_penalty, 2),
        "annualized_volatility": round(volatility, 2),
        "pnl_pct": round(pnl_pct, 2) if pnl_pct is not None else None,
        "positions": df[["symbol", "shares", "current_price", "current_value", "weight"]].to_dict("records"),
    }
