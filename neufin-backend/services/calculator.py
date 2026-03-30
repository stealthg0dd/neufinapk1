import datetime
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import pandas as pd
import requests
from dotenv import load_dotenv

load_dotenv()  # No-op when Railway injects env vars; loads .env in local dev

POLYGON_API_KEY       = os.environ.get("POLYGON_API_KEY")
FINNHUB_API_KEY       = os.environ.get("FINNHUB_API_KEY")
FMP_API_KEY           = os.environ.get("FMP_API_KEY")
TWELVEDATA_API_KEY    = os.environ.get("TWELVEDATA_API_KEY")
MARKETSTACK_API_KEY   = os.environ.get("MARKETSTACK_API_KEY")
ALPHA_VANTAGE_API_KEY = os.environ.get("ALPHA_VANTAGE_API_KEY")

_KEY_MAP = {
    "POLYGON_API_KEY": POLYGON_API_KEY,
    "FINNHUB_API_KEY": FINNHUB_API_KEY,
    "FMP_API_KEY": FMP_API_KEY,
    "TWELVEDATA_API_KEY": TWELVEDATA_API_KEY,
    "MARKETSTACK_API_KEY": MARKETSTACK_API_KEY,
    "ALPHA_VANTAGE_API_KEY": ALPHA_VANTAGE_API_KEY,
}
for _k, _v in _KEY_MAP.items():
    print(f"[calculator] {_k:25s} = {'FOUND ✓' if _v else 'MISSING ✗'}", file=sys.stderr)

# ── In-process caches (1-hour TTL) ────────────────────────────────────────────
_PRICE_CACHE:   dict[str, tuple[float, float]] = {}  # sym → (price, ts)
_BETA_CACHE:    dict[str, tuple[float, float]] = {}  # sym → (beta, ts)
_HISTORY_CACHE: dict = {}                             # key → {"data": df, "ts": float}
_CACHE_TTL = 3600  # seconds

_PERIOD_DAYS = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365}

# ── Circuit breaker ────────────────────────────────────────────────────────────
_BLACKLIST: dict[str, float] = {}   # provider_name → expiry epoch


def _get_cached_price(sym: str) -> float | None:
    """Return cached spot price when present and fresh, else None."""
    sym = sym.upper()
    cached = _PRICE_CACHE.get(sym)
    if not cached:
        return None
    return cached[0] if (time.time() - cached[1]) < _CACHE_TTL else None


def _fetch_price_polygon(symbols: list[str]) -> dict[str, float]:
    """Compatibility wrapper used by tests."""
    return _polygon_batch(symbols)


def _fetch_prices_batch(symbols: list[str]) -> dict[str, float]:
    """Compatibility wrapper used by tests."""
    return fetch_spot_prices_batch(symbols)


def _fetch_beta(sym: str) -> float:
    """Compatibility wrapper used by tests."""
    return fetch_beta(sym)


def _fetch_historical_returns(symbols: list[str], period: str = "1mo") -> pd.DataFrame | None:
    """Return daily returns for *symbols*, or None when history is unavailable."""
    try:
        prices = _fetch_prices(symbols, period)
    except Exception:
        return None
    if prices.empty:
        return None
    return prices.pct_change().dropna()


def _blacklist(provider: str, secs: float = 60.0) -> None:
    _BLACKLIST[provider] = time.time() + secs
    print(f"[Price] ⛔ {provider} blacklisted for {secs}s", file=sys.stderr)


def _available(provider: str) -> bool:
    exp = _BLACKLIST.get(provider)
    if exp is None:
        return True
    if time.time() >= exp:
        del _BLACKLIST[provider]
        return True
    return False


def _is_rate_limit(response_json: dict) -> bool:
    """Detect body-level rate-limit sentinels across all providers."""
    keys = ["Information", "Note", "error"]
    return any(k in response_json for k in keys)


# ── Ticker normalisation ───────────────────────────────────────────────────────
def _fh_ticker(sym: str) -> str:
    """Finnhub: BRK.B → BRK-B."""
    return sym.replace(".", "-").upper()

def _polygon_sym(sym: str) -> str:
    """Polygon / FMP: BRK-B → BRK.B."""
    return sym.replace("-", ".").upper()

def _td_sym(sym: str) -> str:
    """TwelveData: BRK-B → BRK/B."""
    return sym.replace("-", "/").upper()

def _av_ticker(sym: str) -> str:
    """Alpha Vantage: BRK-B → BRK.B."""
    return sym.replace("-", ".").upper()


# ── Provider implementations ───────────────────────────────────────────────────

def _polygon_batch(symbols: list[str]) -> dict[str, float]:
    """
    Polygon.io snapshot batch — one call for all tickers.
    Returns {sym: price} for each symbol with a valid last price.
    """
    if not POLYGON_API_KEY or not _available("polygon"):
        return {}
    norm = {_polygon_sym(s): s for s in symbols}
    tickers_param = ",".join(norm.keys())
    try:
        r = requests.get(
            "https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers",
            params={"tickers": tickers_param, "apiKey": POLYGON_API_KEY},
            timeout=8.0,
        )
        if r.status_code == 429:
            _blacklist("polygon")
            return {}
        data = r.json()
        if _is_rate_limit(data):
            _blacklist("polygon", secs=3600)
            return {}
        results: dict[str, float] = {}
        for entry in data.get("tickers", []):
            raw_sym = entry.get("ticker", "")
            price = float((entry.get("day") or {}).get("c") or
                          (entry.get("lastTrade") or {}).get("p") or
                          (entry.get("prevDay") or {}).get("c") or 0)
            if price > 0 and raw_sym in norm:
                results[norm[raw_sym]] = price
        return results
    except Exception as e:
        print(f"[Price] Polygon batch failed: {e}", file=sys.stderr)
        return {}


def _finnhub_single(sym: str) -> float | None:
    """Finnhub /quote for one symbol. Returns None when price is unavailable."""
    if not FINNHUB_API_KEY or not _available("finnhub"):
        return None
    try:
        r = requests.get(
            "https://finnhub.io/api/v1/quote",
            params={"symbol": _fh_ticker(sym), "token": FINNHUB_API_KEY},
            timeout=5.0,
        )
        if r.status_code == 429:
            _blacklist("finnhub")
            return None
        data = r.json()
        if _is_rate_limit(data):
            _blacklist("finnhub", secs=3600)
            return None
        price = float(data.get("c") or 0)
        return price if price > 0.01 else None
    except Exception as e:
        print(f"[Price] Finnhub {sym} failed: {e}", file=sys.stderr)
        return None


def _fmp_batch(symbols: list[str]) -> dict[str, float]:
    """FMP /api/v3/quote — comma-separated batch."""
    if not FMP_API_KEY or not _available("fmp"):
        return {}
    syms_str = ",".join(_polygon_sym(s) for s in symbols)
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/api/v3/quote/{syms_str}",
            params={"apikey": FMP_API_KEY},
            timeout=8.0,
        )
        if r.status_code == 429:
            _blacklist("fmp")
            return {}
        data = r.json()
        if isinstance(data, dict) and _is_rate_limit(data):
            _blacklist("fmp", secs=3600)
            return {}
        results: dict[str, float] = {}
        for entry in data if isinstance(data, list) else []:
            raw = entry.get("symbol", "")
            price = float(entry.get("price") or 0)
            if price > 0:
                # reverse-normalise: BRK.B → BRK-B to match caller's sym
                orig = next((s for s in symbols if _polygon_sym(s) == raw), raw)
                results[orig] = price
        return results
    except Exception as e:
        print(f"[Price] FMP batch failed: {e}", file=sys.stderr)
        return {}


def _twelvedata_batch(symbols: list[str]) -> dict[str, float]:
    """TwelveData /price — comma-separated."""
    if not TWELVEDATA_API_KEY or not _available("twelvedata"):
        return {}
    sym_map = {_td_sym(s): s for s in symbols}
    try:
        r = requests.get(
            "https://api.twelvedata.com/price",
            params={"symbol": ",".join(sym_map.keys()), "apikey": TWELVEDATA_API_KEY},
            timeout=8.0,
        )
        if r.status_code == 429:
            _blacklist("twelvedata")
            return {}
        data = r.json()
        if isinstance(data, dict) and _is_rate_limit(data):
            _blacklist("twelvedata", secs=3600)
            return {}
        results: dict[str, float] = {}
        # Single-symbol response: {"price": "123.45"}
        if "price" in data and len(symbols) == 1:
            price = float(data["price"] or 0)
            if price > 0:
                results[symbols[0]] = price
        else:
            # Multi-symbol response: {"AAPL": {"price": "..."}, ...}
            for td_sym, payload in data.items():
                if isinstance(payload, dict):
                    price = float(payload.get("price") or 0)
                    orig = sym_map.get(td_sym, td_sym)
                    if price > 0:
                        results[orig] = price
        return results
    except Exception as e:
        print(f"[Price] TwelveData batch failed: {e}", file=sys.stderr)
        return {}


def _marketstack_batch(symbols: list[str]) -> dict[str, float]:
    """Marketstack /v1/eod/latest."""
    if not MARKETSTACK_API_KEY or not _available("marketstack"):
        return {}
    try:
        r = requests.get(
            "https://api.marketstack.com/v1/eod/latest",
            params={
                "access_key": MARKETSTACK_API_KEY,
                "symbols": ",".join(_polygon_sym(s) for s in symbols),
            },
            timeout=10.0,
        )
        if r.status_code == 429:
            _blacklist("marketstack")
            return {}
        data = r.json()
        if isinstance(data, dict) and _is_rate_limit(data):
            _blacklist("marketstack", secs=3600)
            return {}
        results: dict[str, float] = {}
        for entry in (data.get("data") or []):
            raw = entry.get("symbol", "")
            price = float(entry.get("close") or 0)
            if price > 0:
                orig = next((s for s in symbols if _polygon_sym(s) == raw), raw)
                results[orig] = price
        return results
    except Exception as e:
        print(f"[Price] Marketstack batch failed: {e}", file=sys.stderr)
        return {}


def _av_single(sym: str) -> float | None:
    """Alpha Vantage GLOBAL_QUOTE fallback for one symbol. Returns None when unavailable."""
    if not ALPHA_VANTAGE_API_KEY or not _available("alphavantage"):
        return None
    try:
        r = requests.get(
            "https://www.alphavantage.co/query",
            params={
                "function": "GLOBAL_QUOTE",
                "symbol": _av_ticker(sym),
                "apikey": ALPHA_VANTAGE_API_KEY,
            },
            timeout=5.0,
        )
        body = r.json()
        # AV rate-limit sentinel: {"Information": "..."}
        if _is_rate_limit(body):
            _blacklist("alphavantage", secs=3600)
            return None
        price = float(body.get("Global Quote", {}).get("05. price") or 0)
        return price if price > 0.01 else None
    except Exception as e:
        print(f"[Price] AlphaVantage {sym} failed: {e}", file=sys.stderr)
        return None


# ── Batch spot-price fetcher (public) ─────────────────────────────────────────
def fetch_spot_prices_batch(symbols: list[str]) -> dict[str, float]:
    """
    Fetch spot prices for a list of symbols using a tiered provider chain
    with circuit breakers.

    Chain: Polygon (batch) → FMP (batch) → TwelveData (batch) →
           Marketstack (batch) → Finnhub (parallel, ThreadPoolExecutor) →
           Alpha Vantage (parallel, ThreadPoolExecutor).

    Returns {sym: price} for every symbol that could be resolved.
    Symbols that could not be resolved are omitted (caller decides how to handle).
    """
    remaining = list(symbols)
    results: dict[str, float] = {}

    def _merge(batch_result: dict[str, float]) -> None:
        """Merge batch results, ignoring zero/falsy prices."""
        nonlocal remaining
        for sym, price in batch_result.items():
            if sym in remaining and price and price > 0:
                results[sym] = price
                print(f"[Price] {sym}={price}", file=sys.stderr)
        # Only remove from remaining if we actually got a price > 0
        remaining = [s for s in remaining if s not in results]

    # 1. Polygon batch
    if remaining:
        _merge(_polygon_batch(remaining))

    # 2. FMP batch
    if remaining:
        _merge(_fmp_batch(remaining))

    # 3. TwelveData batch
    if remaining:
        _merge(_twelvedata_batch(remaining))

    # 4. Marketstack batch
    if remaining:
        _merge(_marketstack_batch(remaining))

    # 5. Finnhub — parallel across all remaining symbols
    if remaining and _available("finnhub"):
        syms_to_try = list(remaining)
        with ThreadPoolExecutor(max_workers=min(8, len(syms_to_try))) as ex:
            future_map = {ex.submit(_finnhub_single, s): s for s in syms_to_try}
            for future in as_completed(future_map, timeout=8.0):
                sym = future_map[future]
                try:
                    price = future.result()
                    if price and price > 0.01:
                        results[sym] = price
                        print(f"[Price] Finnhub {sym}={price}", file=sys.stderr)
                        if sym in remaining:
                            remaining.remove(sym)
                except Exception as e:
                    print(f"[Price] Finnhub {sym} future error: {e}", file=sys.stderr)

    # 6. Alpha Vantage — parallel, last resort
    if remaining and _available("alphavantage"):
        syms_to_try = list(remaining)
        with ThreadPoolExecutor(max_workers=min(4, len(syms_to_try))) as ex:
            future_map = {ex.submit(_av_single, s): s for s in syms_to_try}
            for future in as_completed(future_map, timeout=8.0):
                sym = future_map[future]
                try:
                    price = future.result()
                    if price and price > 0.01:
                        results[sym] = price
                        print(f"[Price] AlphaVantage {sym}={price}", file=sys.stderr)
                        if sym in remaining:
                            remaining.remove(sym)
                except Exception as e:
                    print(f"[Price] AlphaVantage {sym} future error: {e}", file=sys.stderr)

    if remaining:
        # Structured error log — allows log-aggregation tools to alert on this pattern.
        print(
            f"[Price] PRICE_RESOLUTION_FAILURE symbols={remaining} "
            f"resolved={list(results.keys())} "
            f"providers_tried=polygon,fmp,twelvedata,marketstack,finnhub,alphavantage",
            file=sys.stderr,
        )
        # Attach a sentinel so callers (e.g. calculate_portfolio_metrics) can detect
        # and surface a warning rather than silently using 0.0 for value calculations.
        results["__failed__"] = [*remaining]  # type: ignore[assignment]

    return results


# ── Single spot-price fetcher (public, cache-aware) ───────────────────────────
def fetch_spot_price(sym: str) -> float:
    """
    Return the latest price for *sym* (single-symbol convenience wrapper).

    Uses the 1-hour in-process cache; delegates to fetch_spot_prices_batch
    for the actual provider chain.

    Raises ValueError("DATA_INTEGRITY_ERROR: Could not verify price for {sym}")
    when all providers fail — never silently returns 0.
    """
    sym = sym.upper()
    cached = _PRICE_CACHE.get(sym)
    if cached and (time.time() - cached[1]) < _CACHE_TTL:
        return cached[0]

    batch = fetch_spot_prices_batch([sym])
    price = batch.get(sym, 0.0)
    if price > 0:
        _PRICE_CACHE[sym] = (price, time.time())
        return price

    raise ValueError(f"DATA_INTEGRITY_ERROR: Could not verify price for {sym}")


# ── Price integrity verifier ──────────────────────────────────────────────────
def verify_price_integrity(positions: list) -> list[dict]:
    """
    For any position representing >15% of the portfolio, cross-verify the spot
    price using two independent providers (Polygon + Finnhub).

    If their prices differ by more than 5%, logs a DATA_INTEGRITY_WARNING and
    returns the average — protecting against split-adjustment errors that would
    skew DNA scores on concentrated holdings.

    Returns a list of dicts for positions that were verified:
    {
      "symbol":          str,
      "weight_pct":      float,
      "price_polygon":   float | None,
      "price_finnhub":   float | None,
      "price_used":      float,
      "discrepancy_pct": float,
      "warned":          bool,
    }
    """
    df = pd.DataFrame(positions)
    if df.empty:
        return []
    df.columns = [c.lower().strip() for c in df.columns]
    if "symbol" not in df.columns or "shares" not in df.columns:
        return []

    df["shares"] = pd.to_numeric(df["shares"], errors="coerce").fillna(0)
    df["symbol"] = df["symbol"].str.upper()

    # Compute weights using cached prices (best-effort)
    spot = fetch_spot_prices_batch(df["symbol"].tolist())
    df["current_price"] = df["symbol"].map(spot).fillna(0.0)
    df["current_value"] = df["shares"] * df["current_price"]
    total = float(df["current_value"].sum())
    if total <= 0:
        return []
    df["weight"] = df["current_value"] / total

    heavy = df[df["weight"] > 0.15]
    if heavy.empty:
        return []

    results: list[dict] = []
    for _, row in heavy.iterrows():
        sym = row["symbol"]

        # Provider 1 — Polygon
        p_polygon = float(_polygon_batch([sym]).get(sym, 0) or 0)
        # Provider 2 — Finnhub
        p_finnhub = float(_finnhub_single(sym) or 0)

        # Need both prices to compare
        if p_polygon <= 0 or p_finnhub <= 0:
            price_used = p_polygon or p_finnhub or float(row["current_price"])
            results.append({
                "symbol":          sym,
                "weight_pct":      round(float(row["weight"]) * 100, 1),
                "price_polygon":   p_polygon or None,
                "price_finnhub":   p_finnhub or None,
                "price_used":      round(price_used, 4),
                "discrepancy_pct": 0.0,
                "warned":          False,
            })
            continue

        discrepancy = abs(p_polygon - p_finnhub) / ((p_polygon + p_finnhub) / 2) * 100
        warned = discrepancy > 5.0
        price_used = (p_polygon + p_finnhub) / 2 if warned else p_polygon

        if warned:
            print(
                f"[PriceIntegrity] DATA_INTEGRITY_WARNING: {sym} — "
                f"Polygon={p_polygon:.4f} vs Finnhub={p_finnhub:.4f} "
                f"({discrepancy:.1f}% gap). Using average {price_used:.4f}.",
                file=sys.stderr,
            )

        results.append({
            "symbol":          sym,
            "weight_pct":      round(float(row["weight"]) * 100, 1),
            "price_polygon":   round(p_polygon, 4),
            "price_finnhub":   round(p_finnhub, 4),
            "price_used":      round(price_used, 4),
            "discrepancy_pct": round(discrepancy, 2),
            "warned":          warned,
        })

    return results


# ── Beta fetcher ───────────────────────────────────────────────────────────────
def fetch_beta(sym: str) -> float:
    """
    Fetch beta from Alpha Vantage OVERVIEW (1-hour cache).
    Returns 1.0 (market-neutral) when unavailable.
    """
    sym = sym.upper()
    cached = _BETA_CACHE.get(sym)
    if cached and (time.time() - cached[1]) < _CACHE_TTL:
        return cached[0]

    if not ALPHA_VANTAGE_API_KEY:
        return 1.0

    try:
        r = requests.get(
            "https://www.alphavantage.co/query",
            params={
                "function": "OVERVIEW",
                "symbol": _av_ticker(sym),
                "apikey": ALPHA_VANTAGE_API_KEY,
            },
            timeout=8.0,
        )
        beta = float(r.json().get("Beta") or 1.0)
        _BETA_CACHE[sym] = (beta, time.time())
        return beta
    except Exception:
        return 1.0


# ── Scoring components ─────────────────────────────────────────────────────────
def _hhi_score(weights: "pd.Series") -> float:
    """
    HHI-based concentration score (0-25 pts).
    Lower HHI (more diversified) → higher score.
    """
    w = weights / weights.sum() if weights.sum() > 0 else weights
    hhi = float((w ** 2).sum())          # [1/n, 1]
    return round(25.0 * (1.0 - hhi), 2)


def _hhi(weights: list[float]) -> float:
    """Compatibility helper returning raw HHI in [0, 1]."""
    w = pd.Series(weights, dtype=float)
    total = float(w.sum())
    if total <= 0:
        return 0.0
    w = w / total
    return float((w**2).sum())


def _score_hhi(weights: list[float]) -> float:
    """Compatibility helper returning the 0-25 HHI score."""
    return _hhi_score(pd.Series(weights, dtype=float))


def _score_beta(weighted_beta: float) -> float:
    """Compatibility helper returning the 0-25 beta score."""
    return _beta_score(weighted_beta)


def _beta_score(weighted_beta: float) -> float:
    """
    Risk-adjusted return score based on weighted portfolio beta (0-25 pts).
    beta <= 1.0 → full 25 pts; beta = 2.0 → 0 pts.
    """
    score = 25.0 * max(0.0, 1.0 - abs(weighted_beta - 1.0))
    return round(score, 2)


def _tax_alpha_score(df: "pd.DataFrame") -> float:
    """
    Tax alpha component (0-20 pts).

    Requires 'cost_basis' and 'current_price' columns.
    Awards points for tax-loss harvesting potential;
    penalises large unrealised gains (deferred tax liability).
    Returns 10.0 (neutral) when cost_basis is absent.
    """
    if "cost_basis" not in df.columns or "current_price" not in df.columns:
        return 10.0

    df = df.copy()
    df["cost_basis"]    = pd.to_numeric(df["cost_basis"],    errors="coerce").fillna(0)
    df["current_price"] = pd.to_numeric(df["current_price"], errors="coerce").fillna(0)
    df["shares"]        = pd.to_numeric(df["shares"],        errors="coerce").fillna(0)

    total_value = float((df["shares"] * df["current_price"]).sum())
    if total_value <= 0:
        return 10.0

    df["unrealised_gain"] = (df["current_price"] - df["cost_basis"]) * df["shares"]
    harvest_value  = float(df.loc[df["unrealised_gain"] < 0, "unrealised_gain"].abs().sum())
    liability_value = float(df.loc[df["unrealised_gain"] > 0, "unrealised_gain"].sum())

    harvest_ratio   = harvest_value   / total_value
    liability_ratio = liability_value / total_value

    score = 10.0 + (harvest_ratio * 30.0) - (liability_ratio * 10.0)
    return round(max(0.0, min(20.0, score)), 2)


# ── Tax impact analysis ────────────────────────────────────────────────────────
def get_tax_impact_analysis(df: "pd.DataFrame") -> dict:
    """
    Per-position tax liability and harvest-credit analysis at 20% LT CGT rate.

    df must have: symbol, shares, current_price, cost_basis (optional).
    Returns a dict with 'available', 'positions', 'total_liability',
    'total_harvest_opp', and 'narrative' keys.
    """
    CGT_RATE = 0.20

    if "cost_basis" not in df.columns or "current_price" not in df.columns:
        return {
            "available":  False,
            "positions":  [],
            "narrative":  "Cost basis not provided — tax analysis unavailable.",
        }

    df = df.copy()
    df["cost_basis"]    = pd.to_numeric(df["cost_basis"],    errors="coerce").fillna(0)
    df["current_price"] = pd.to_numeric(df["current_price"], errors="coerce").fillna(0)
    df["shares"]        = pd.to_numeric(df["shares"],        errors="coerce").fillna(0)

    positions = []
    total_liability   = 0.0
    total_harvest_opp = 0.0

    for _, row in df.iterrows():
        gain = (row["current_price"] - row["cost_basis"]) * row["shares"]
        if gain > 0:
            tax_liability  = round(gain * CGT_RATE, 2)
            harvest_credit = 0.0
            total_liability += tax_liability
        else:
            tax_liability  = 0.0
            harvest_credit = round(abs(gain) * CGT_RATE, 2)
            total_harvest_opp += harvest_credit

        positions.append({
            "symbol":          row["symbol"],
            "unrealised_gain": round(gain, 2),
            "tax_liability":   tax_liability,
            "harvest_credit":  harvest_credit,
        })

    narrative = (
        f"Estimated deferred tax liability: ${total_liability:,.0f} "
        f"(at 20% LT CGT rate). "
        f"Tax-loss harvesting opportunity: ${total_harvest_opp:,.0f}."
    )

    return {
        "available":         True,
        "positions":         positions,
        "total_liability":   round(total_liability, 2),
        "total_harvest_opp": round(total_harvest_opp, 2),
        "narrative":         narrative,
    }


# ── Tax-neutral pair matchmaking ───────────────────────────────────────────────
def get_tax_neutral_pairs(df: "pd.DataFrame") -> list[dict]:
    """
    For the top-2 gainer positions, find the exact loser shares to sell to
    achieve a $0 net tax outcome.

    Logic
    -----
    1. Gainers  — positions where (current_price - cost_basis) > 0.
                  Tax Liability = unrealised_gain x CGT_RATE.
    2. Losers   — positions where (current_price - cost_basis) < 0.
                  Harvestable Credit per share = |loss_per_share| x CGT_RATE.
    3. For each top-2 gainer (ranked by tax liability), greedily match losers
       (largest loss first) until the full liability is offset or shares run out.
    4. Returns a list of recommendation dicts including a human-readable
       recommendation_text string.
    """
    CGT_RATE = 0.20

    if "cost_basis" not in df.columns or "current_price" not in df.columns:
        return []

    df = df.copy()
    for col in ("cost_basis", "current_price", "shares"):
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    df["unrealised_gain"]        = (df["current_price"] - df["cost_basis"]) * df["shares"]
    df["tax_liability"]          = df["unrealised_gain"].clip(lower=0) * CGT_RATE
    df["credit_per_share"]       = (df["cost_basis"] - df["current_price"]).clip(lower=0) * CGT_RATE

    gainers = df[df["unrealised_gain"] > 0].nlargest(2, "tax_liability")
    losers_pool = df[df["unrealised_gain"] < 0].sort_values("unrealised_gain")  # most negative first

    if gainers.empty or losers_pool.empty:
        return []

    pairs: list[dict] = []

    for _, gainer in gainers.iterrows():
        target = float(gainer["tax_liability"])   # total $ tax to offset
        remaining = target
        loser_instructions: list[dict] = []

        for _, loser in losers_pool.iterrows():
            if remaining <= 0.005:
                break
            cps = float(loser["credit_per_share"])
            if cps <= 0:
                continue

            shares_available = float(loser["shares"])
            shares_needed    = remaining / cps
            shares_to_sell   = round(min(shares_needed, shares_available), 2)
            loss_usd         = round(shares_to_sell * abs(float(loser["current_price"] - loser["cost_basis"])), 2)
            credit_achieved  = round(shares_to_sell * cps, 2)
            remaining        = round(remaining - credit_achieved, 2)

            loser_instructions.append({
                "symbol":         loser["symbol"],
                "shares_to_sell": shares_to_sell,
                "loss_usd":       loss_usd,
                "credit_usd":     credit_achieved,
            })

        if not loser_instructions:
            continue

        net_tax = max(0.0, remaining)
        primary = loser_instructions[0]

        rec = (
            f"Sell {int(gainer['shares'])} shares of {gainer['symbol']} "
            f"(${gainer['unrealised_gain']:,.0f} gain) and "
            f"{primary['shares_to_sell']:.0f} shares of {primary['symbol']} "
            f"(${primary['loss_usd']:,.0f} loss) "
            f"for a net tax impact of ${net_tax:,.0f}."
        )

        pairs.append({
            "winner_symbol":             gainer["symbol"],
            "winner_shares":             int(gainer["shares"]),
            "winner_gain_usd":           round(float(gainer["unrealised_gain"]), 2),
            "winner_tax_liability_usd":  round(float(gainer["tax_liability"]), 2),
            "loser_instructions":        loser_instructions,
            "net_tax_impact_usd":        round(net_tax, 2),
            "fully_offset":              net_tax <= 1.0,
            "recommendation_text":       rec,
        })

    return pairs


# ── History helpers (used by portfolio metrics) ────────────────────────────────
def _fetch_symbol_history(sym: str, unix_from: int, unix_to: int) -> "pd.Series | None":
    """Fetch daily close prices for one symbol. Returns None on failure."""
    if FINNHUB_API_KEY:
        try:
            r = requests.get(
                "https://finnhub.io/api/v1/stock/candle",
                params={
                    "symbol":     _fh_ticker(sym),
                    "resolution": "D",
                    "from":       unix_from,
                    "to":         unix_to,
                    "token":      FINNHUB_API_KEY,
                },
                timeout=8.0,
            )
            data = r.json()
            if data.get("s") == "ok" and data.get("c") and data.get("t"):
                idx = [datetime.date.fromtimestamp(ts) for ts in data["t"]]
                return pd.Series(data["c"], index=idx, name=sym)
        except Exception as err:
            print(f"[History] Finnhub history fetch failed for {sym}: {err}", file=sys.stderr)

    if ALPHA_VANTAGE_API_KEY:
        try:
            r = requests.get(
                "https://www.alphavantage.co/query",
                params={
                    "function":   "TIME_SERIES_DAILY",
                    "symbol":     _av_ticker(sym),
                    "outputsize": "compact",
                    "apikey":     ALPHA_VANTAGE_API_KEY,
                },
                timeout=10.0,
            )
            ts_data = r.json().get("Time Series (Daily)", {})
            if ts_data:
                closes = {k: float(v["4. close"]) for k, v in ts_data.items()}
                series = pd.Series(closes).sort_index()
                series.name = sym
                cutoff = datetime.date.fromtimestamp(unix_from).isoformat()
                return series[series.index >= cutoff]
        except Exception as err:
            print(f"[History] AlphaVantage history fetch failed for {sym}: {err}", file=sys.stderr)

    return None


def _fetch_prices(symbols: list[str], period: str) -> pd.DataFrame:
    """Fetch daily Close prices for a period, returning from cache if fresh."""
    cache_key = f"{','.join(sorted(symbols))}:{period}"
    entry = _HISTORY_CACHE.get(cache_key)
    if entry and (time.time() - entry["ts"]) < _CACHE_TTL:
        return entry["data"]

    period_days = _PERIOD_DAYS.get(period, 30)
    unix_to   = int(time.time())
    unix_from = unix_to - period_days * 86400

    all_series: dict[str, pd.Series] = {}
    for sym in symbols:
        s = _fetch_symbol_history(sym, unix_from, unix_to)
        if s is not None:
            all_series[sym] = s

    if not all_series:
        raise RuntimeError("No price history available from any source")

    prices = pd.DataFrame(all_series)
    _HISTORY_CACHE[cache_key] = {"data": prices, "ts": time.time()}
    return prices


# ── Portfolio metrics (used by routers/portfolio.py) ──────────────────────────
def calculate_portfolio_metrics(positions: list) -> dict:
    """Calculate diversification, concentration, volatility, and returns."""
    df = pd.DataFrame(positions)
    df.columns = [c.lower().strip() for c in df.columns]

    if not {"symbol", "shares"}.issubset(set(df.columns)):
        raise ValueError("CSV must contain 'symbol' and 'shares' columns.")

    df["shares"] = pd.to_numeric(df["shares"], errors="coerce").fillna(0)
    df["symbol"] = df["symbol"].str.upper()
    symbols = df["symbol"].tolist()

    # Spot prices via multi-provider batch engine
    spot_prices = _fetch_prices_batch(symbols)
    failed_tickers: list[str] = spot_prices.pop("__failed__", [])  # type: ignore[arg-type]
    df["current_price"] = df["symbol"].map(spot_prices).fillna(0.0)

    # Historical prices for volatility calculation
    returns = _fetch_historical_returns(symbols, "1mo")
    df["current_value"] = df["shares"] * df["current_price"]

    total_value = float(df["current_value"].sum())
    df["weight"] = df["current_value"] / total_value if total_value > 0 else 0.0

    # Scoring components
    hhi_pts = _hhi_score(df["weight"])

    df["beta"] = [float(_fetch_beta(sym)) for sym in df["symbol"].tolist()]
    weighted_beta = float((df["weight"] * df["beta"]).sum()) if total_value > 0 else 1.0
    beta_pts = _beta_score(weighted_beta)

    tax_pts  = _tax_alpha_score(df)
    corr_pts = 15.0  # neutral placeholder — risk_engine fills this in the DNA flow

    dna_score = max(5, min(100, int(hhi_pts + beta_pts + tax_pts + corr_pts)))

    # Annualised volatility (requires historical price DataFrame)
    volatility = 0.0
    if returns is not None and not returns.empty:
        weights_series   = df.set_index("symbol")["weight"]
        aligned_weights  = weights_series.reindex(returns.columns).fillna(0)
        portfolio_returns = (returns * aligned_weights).sum(axis=1)
        volatility = float(portfolio_returns.std() * np.sqrt(252) * 100)

    pnl_pct = None
    if "cost_basis" in df.columns:
        df["cost_basis"] = pd.to_numeric(df["cost_basis"], errors="coerce")
        total_cost = float((df["shares"] * df["cost_basis"]).sum())
        pnl_pct = float((total_value - total_cost) / total_cost * 100) if total_cost > 0 else None

    result = {
        "total_value":           float(total_value),
        "hhi":                   round(float((df["weight"] ** 2).sum()), 4) if total_value > 0 else 0.0,
        "num_positions":         len(df),
        "dna_score":             dna_score,
        "tax_alpha_score":       tax_pts,
        "score_breakdown": {
            "hhi_concentration": hhi_pts,
            "beta_risk":         beta_pts,
            "tax_alpha":         tax_pts,
            "correlation":       corr_pts,
        },
        "weighted_beta":         round(weighted_beta, 3),
        "max_position_pct":      round(float(df["weight"].max()) * 100, 2),
        "annualized_volatility": round(volatility, 2),
        "pnl_pct":               round(pnl_pct, 2) if pnl_pct is not None else None,
        "positions":             df[["symbol", "shares", "current_price", "current_value", "weight"]].to_dict("records"),
    }
    if failed_tickers:
        result["price_warnings"] = [
            f"PRICE_RESOLUTION_FAILURE: {sym} — price defaulted to $0.00. "
            "DNA score may be understated. Check ticker symbol or try again later."
            for sym in failed_tickers
        ]
        result["failed_tickers"] = failed_tickers
    return result
