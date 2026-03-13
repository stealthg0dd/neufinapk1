import time
import pandas as pd
import yfinance as yf
import numpy as np

# ── In-process price cache (1-hour TTL) ───────────────────────────────────────
_PRICE_CACHE: dict = {}
_CACHE_TTL = 3600  # seconds


def _fetch_prices(symbols: list[str], period: str) -> pd.DataFrame:
    """Fetch OHLCV Close prices, returning from cache if fresh."""
    cache_key = f"{','.join(sorted(symbols))}:{period}"
    entry = _PRICE_CACHE.get(cache_key)
    if entry and (time.time() - entry["ts"]) < _CACHE_TTL:
        return entry["data"]

    prices = yf.download(symbols, period=period, progress=False, auto_adjust=True)["Close"]
    if isinstance(prices, pd.Series):
        prices = prices.to_frame(name=symbols[0])

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
    df["current_price"] = df["symbol"].map(latest_prices)
    df["current_value"] = df["shares"] * df["current_price"]

    total_value = df["current_value"].sum()
    df["weight"] = df["current_value"] / total_value

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
