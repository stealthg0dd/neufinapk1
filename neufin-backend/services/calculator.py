from __future__ import annotations

import datetime
import math
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import pandas as pd
import requests
import structlog
from dotenv import load_dotenv

from core.config import settings
from data_providers.ticker_normalizer import (
    SEA_EXCHANGE_MAP,
    DataUnavailableError,
    compute_market_value,
    normalize_sea_ticker,
)
from services.fx_format import indicative_sgd_suffix
from services.market_cache import (
    TICKER_ALIASES,
    PriceResult,
    get_ticker_price_cache,
    upsert_ticker_price_cache,
)
from services.market_currency import SUFFIX_CURRENCY as _SUFFIX_CURRENCY
from services.market_resolver import (
    persist_resolution_best_effort,
    portfolio_market_framing,
    resolve_security,
    should_use_twelve_data_first,
    twelve_data_symbol,
)

load_dotenv()  # No-op when Railway injects env vars; loads .env in local dev

logger = structlog.get_logger("neufin.calculator")


def _enrich_positions_fx_hint(records: list[dict]) -> list[dict]:
    """Optional indicative SGD line per position (display-only; gated by settings)."""
    out: list[dict] = []
    for r in records:
        row = dict(r)
        try:
            val = float(row.get("current_value") or 0)
        except (TypeError, ValueError):
            val = 0.0
        ccy = str(row.get("native_currency") or "USD")
        hint = indicative_sgd_suffix(val, ccy)
        if hint:
            row["fx_indicative_sgd"] = hint
        out.append(row)
    return out


def _records_nan_to_none(rows: list[dict]) -> list[dict]:
    """JSON-safe position rows: float NaN → None (not a misleading null price)."""
    out: list[dict] = []
    for r in rows:
        row = {}
        for k, v in r.items():
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                row[k] = None
            else:
                row[k] = v
        out.append(row)
    return out


POLYGON_API_KEY = settings.POLYGON_API_KEY
FINNHUB_API_KEY = settings.FINNHUB_API_KEY
FMP_API_KEY = settings.FMP_API_KEY
TWELVEDATA_API_KEY = settings.TWELVEDATA_API_KEY
MARKETSTACK_API_KEY = settings.MARKETSTACK_API_KEY
ALPHA_VANTAGE_API_KEY = settings.ALPHA_VANTAGE_API_KEY

_KEY_MAP = {
    "POLYGON_API_KEY": POLYGON_API_KEY,
    "FINNHUB_API_KEY": FINNHUB_API_KEY,
    "FMP_API_KEY": FMP_API_KEY,
    "TWELVEDATA_API_KEY": TWELVEDATA_API_KEY,
    "MARKETSTACK_API_KEY": MARKETSTACK_API_KEY,
    "ALPHA_VANTAGE_API_KEY": ALPHA_VANTAGE_API_KEY,
}
for _k, _v in _KEY_MAP.items():
    logger.debug("calculator.key_status", key=_k, status="FOUND" if _v else "MISSING")

# ── In-process caches (1-hour TTL) ────────────────────────────────────────────
_PRICE_CACHE: dict[str, tuple[float, float]] = {}  # sym → (price, ts)
_BETA_CACHE: dict[str, tuple[float, float]] = {}  # sym → (beta, ts)
_HISTORY_CACHE: dict = {}  # key → {"data": df, "ts": float}
_CACHE_TTL = 3600  # seconds

_PERIOD_DAYS = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365}

# ── Circuit breaker ────────────────────────────────────────────────────────────
_BLACKLIST: dict[str, float] = {}  # provider_name → expiry epoch


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


def _fetch_historical_returns(
    symbols: list[str], period: str = "1mo"
) -> pd.DataFrame | None:
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
    logger.warning("price.blacklisted", provider=provider, secs=secs)


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
    """Finnhub-compatible symbol (regional suffixes keep dots)."""
    # # SEA-TICKER-FIX: index aliases + regional metadata applied before Finnhub.
    return resolve_security(sym).provider_finnhub


def _polygon_sym(sym: str) -> str:
    """Polygon / FMP: BRK-B → BRK.B."""
    return sym.replace("-", ".").upper()


def _td_sym(sym: str) -> str:
    """TwelveData: BRK-B → BRK/B."""
    if should_use_twelve_data_first(sym):
        # SEA-VN-FIX before: SEA symbols were converted to provider-looking strings only.
        # SEA-VN-FIX after: the request layer adds required exchange/country params.
        return twelve_data_symbol(sym)
    return sym.replace("-", "/").upper()


def _is_sea_market_symbol(sym: str) -> bool:
    """True for SEA stock suffixes and index aliases handled by the normalizer."""
    upper = (sym or "").strip().upper()
    normalized_symbol, _, _ = normalize_sea_ticker(
        upper,
        api_preference="twelvedata",
        is_index=upper.startswith("^"),
    )
    return (
        normalized_symbol != upper
        or upper
        in {
            "VNINDEX",
            "VNI",
            "STI",
            "JKSE",
            "JCI",
            "SET",
            "KLSE",
            "FBMKLCI",
            "PSEI",
        }
        or any(upper.endswith(suffix) for suffix in SEA_EXCHANGE_MAP)
    )


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
            price = float(
                (entry.get("day") or {}).get("c")
                or (entry.get("lastTrade") or {}).get("p")
                or (entry.get("prevDay") or {}).get("c")
                or 0
            )
            if price > 0 and raw_sym in norm:
                results[norm[raw_sym]] = price
        return results
    except Exception as e:
        logger.warning("price.polygon_batch_failed", error=str(e))
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
        logger.warning("price.finnhub_single_failed", symbol=sym, error=str(e))
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
        logger.warning("price.fmp_batch_failed", error=str(e))
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
        logger.warning("price.twelvedata_batch_failed", error=str(e))
        return {}


def _twelvedata_quote_batch(symbols: list[str]) -> dict[str, float]:
    """Twelve Data quote helper for SEA markets; returns live/close prices."""
    if not TWELVEDATA_API_KEY or not _available("twelvedata"):
        return {}

    results: dict[str, float] = {}
    for sym in symbols:
        upper = str(sym or "").strip().upper()
        normalized_symbol, query_params, api_to_use = normalize_sea_ticker(
            upper,
            api_preference="twelvedata",
            is_index=upper.startswith("^"),
        )
        if api_to_use != "twelvedata":
            continue
        try:
            # SEA-VN-FIX before: fetch_twelve_data() sent only a symbol and TwelveData
            # classified VN names as CCY/index. SEA-VN-FIX after: include explicit
            # exchange=HOSE and country=Vietnam for .VN, country=Vietnam for ^VNINDEX.
            response = requests.get(
                "https://api.twelvedata.com/price",
                params={**query_params, "apikey": TWELVEDATA_API_KEY},
                timeout=8.0,
            )
            if response.status_code == 429:
                _blacklist("twelvedata")
                continue
            data = response.json()
            if isinstance(data, dict) and (
                data.get("status") == "error" or _is_rate_limit(data)
            ):
                logger.warning(
                    "price.twelvedata_sea_error",
                    symbol=upper,
                    normalized_symbol=normalized_symbol,
                    query_params=query_params,
                    message=data.get("message") or data.get("Information"),
                )
                continue
            price = float(data.get("price") or 0) if isinstance(data, dict) else 0.0
            if price > 0:
                results[sym] = price
        except Exception as e:
            logger.warning(
                "price.twelvedata_sea_failed",
                symbol=upper,
                normalized_symbol=normalized_symbol,
                error=str(e),
            )
    return results


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
        for entry in data.get("data") or []:
            raw = entry.get("symbol", "")
            price = float(entry.get("close") or 0)
            if price > 0:
                orig = next((s for s in symbols if _polygon_sym(s) == raw), raw)
                results[orig] = price
        return results
    except Exception as e:
        logger.warning("price.marketstack_batch_failed", error=str(e))
        return {}


def _yfinance_batch(symbols: list[str]) -> dict[str, float]:
    """
    Yahoo Finance last close — reliable for international suffixes (.VN, .L), UK,
    and indices (^VNINDEX, ^FTSE). Polygon US snapshot does not cover these.
    """
    if not symbols:
        return {}
    try:
        import yfinance as yf
    except ImportError:
        logger.warning("price.yfinance_unavailable")
        return {}

    results: dict[str, float] = {}

    def _one(sym: str) -> tuple[str, float | None]:
        try:
            # # SEA-TICKER-FIX: Yahoo symbol may differ after index alias normalization.
            ysym = resolve_security(sym).provider_ticker
            t = yf.Ticker(ysym)
            hist = t.history(period="5d", auto_adjust=True)
            if hist is not None and not hist.empty and "Close" in hist.columns:
                px = float(hist["Close"].iloc[-1])
                if px > 0:
                    return sym, px
        except Exception as e:
            logger.debug("price.yfinance_one_failed", symbol=sym, error=str(e))
        return sym, None

    with ThreadPoolExecutor(max_workers=min(8, len(symbols))) as ex:
        futs = {ex.submit(_one, s): s for s in symbols}
        for fut in as_completed(futs, timeout=45.0):
            sym, px = fut.result()
            if px and px > 0:
                results[sym] = px
                logger.debug("price.yfinance_resolved", symbol=sym, price=px)
    return results


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
        logger.warning("price.alphavantage_single_failed", symbol=sym, error=str(e))
        return None


def _itick_single(sym: str) -> float | None:
    """iTick quote for .VN / .L when env-gated; returns None on failure."""
    if not settings.ENABLE_ITICK_VN_FALLBACK or not settings.ITICK_API_KEY:
        return None
    u = sym.upper()
    if not (u.endswith(".VN") or u.endswith(".L")):
        return None
    try:
        r = requests.get(
            "https://api.itick.org/v1/quote",
            params={"code": sym},
            headers={"Authorization": f"Bearer {settings.ITICK_API_KEY}"},
            timeout=6.0,
        )
        if r.status_code != 200:
            return None
        body = r.json()
        p = body.get("data") if isinstance(body.get("data"), dict) else body
        if not isinstance(p, dict):
            return None
        raw = p.get("price") or p.get("last") or p.get("close") or 0
        try:
            price = float(raw)
        except (TypeError, ValueError):
            return None
        return price if price > 0 else None
    except Exception as e:
        logger.debug("price.itick_failed", symbol=sym, error=str(e))
        return None


def _itick_batch(symbols: list[str]) -> dict[str, float]:
    out: dict[str, float] = {}
    for sym in symbols:
        px = _itick_single(sym)
        if px and px > 0:
            out[sym] = px
    return out


# ── Batch spot-price fetcher (public) ─────────────────────────────────────────
def fetch_spot_prices_batch(symbols: list[str]) -> dict[str, float]:
    """
    Fetch spot prices for a list of symbols using a tiered provider chain
    with circuit breakers.

    Chain: Polygon (batch) → Yahoo Finance (international + indices) → FMP →
           TwelveData → Marketstack → Finnhub (parallel) →
           Alpha Vantage (parallel).

    Returns {sym: price} for every symbol that could be resolved.
    Symbols that could not be resolved are omitted (caller decides how to handle).
    """
    # SEA-VN-FIX before: some callers reached the provider waterfall with raw SEA
    # tickers only. SEA-VN-FIX after: every ticker is normalized once up front so
    # routing and logs carry the provider-specific symbol and params.
    normalized_routes = {
        s: normalize_sea_ticker(
            str(s or "").strip().upper(),
            api_preference="twelvedata",
            is_index=str(s or "").strip().upper().startswith("^"),
        )
        for s in symbols
    }
    logger.debug(
        "price.normalized_routes",
        symbols=list(normalized_routes.keys()),
        sea_symbols=[
            s for s, route in normalized_routes.items() if route[0] != str(s).upper()
        ],
    )
    remaining = list(symbols)
    results: dict[str, float] = {}

    def _merge(batch_result: dict[str, float]) -> None:
        """Merge batch results, ignoring zero/falsy prices."""
        nonlocal remaining
        for sym, price in batch_result.items():
            if sym in remaining and price and price > 0:
                results[sym] = price
                logger.debug("price.resolved", symbol=sym, price=price)
        # Only remove from remaining if we actually got a price > 0
        remaining = [s for s in remaining if s not in results]

    # SEA indices and Vietnamese equities are materially better covered by
    # Twelve Data than the US-first providers, so route them there first.
    sea_first = [s for s in remaining if should_use_twelve_data_first(s)]
    if sea_first:
        _merge(_twelvedata_quote_batch(sea_first))

    # 1. Polygon batch
    if remaining:
        _merge(_polygon_batch(remaining))

    # 2. Yahoo Finance — fills gaps for .VN, .L, ^index, etc.
    if remaining:
        _merge(_yfinance_batch(remaining))

    # 3. FMP batch
    if remaining:
        _merge(_fmp_batch(remaining))

    # 4. TwelveData batch
    if remaining:
        _merge(_twelvedata_batch(remaining))

    # 5. Marketstack batch
    if remaining:
        _merge(_marketstack_batch(remaining))

    # 6. Finnhub — parallel across all remaining symbols
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
                        logger.debug("price.finnhub_resolved", symbol=sym, price=price)
                        if sym in remaining:
                            remaining.remove(sym)
                except Exception as e:
                    logger.warning(
                        "price.finnhub_future_error", symbol=sym, error=str(e)
                    )

    # 7. Alpha Vantage — parallel, last resort
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
                        logger.debug("price.av_resolved", symbol=sym, price=price)
                        if sym in remaining:
                            remaining.remove(sym)
                except Exception as e:
                    logger.warning("price.av_future_error", symbol=sym, error=str(e))

    # 8. iTick — optional .VN / .L fallback (# SEA-TICKER-FIX, env-gated)
    if remaining and settings.ENABLE_ITICK_VN_FALLBACK and settings.ITICK_API_KEY:
        _merge(
            _itick_batch([s for s in remaining if s.upper().endswith((".VN", ".L"))])
        )

    if remaining:
        logger.warning(
            "price.resolution_failure",
            symbols=remaining,
            resolved=list(results.keys()),
            providers_tried="polygon,yfinance,fmp,twelvedata,marketstack,finnhub,alphavantage,itick",
        )
        results["__failed__"] = [*remaining]  # type: ignore[assignment]

    # Persist resolved prices to last-known-price cache
    for sym, price in results.items():
        if sym != "__failed__" and isinstance(price, float) and price > 0:
            try:
                upsert_ticker_price_cache(sym, price, source="live")
            except Exception:  # noqa: S110
                pass  # non-critical cache write — don't block price fetch

    return results


# ── Single spot-price fetcher (public, cache-aware) ───────────────────────────
def fetch_spot_price(sym: str) -> float:
    """
    Return the latest price for *sym*.  Never raises.
    Returns 0.0 when all providers fail (caller should check for 0 if needed).

    Use get_price_with_fallback() for the full PriceResult with status/warnings.
    """
    result = get_price_with_fallback(sym)
    return result.price if result.price is not None else 0.0


def get_price_with_fallback(sym: str) -> PriceResult:
    """
    Full price resolution waterfall returning a PriceResult — never raises.

    Step 1: Try all 6 live providers (existing waterfall).
    Step 2: Try TICKER_ALIASES for the symbol.
    Step 3: Use last-known cached price from Supabase (marks as stale).
    Step 4: Return unresolvable — caller decides whether to exclude.
    """
    sym = sym.upper()
    normalized_symbol, query_params, api_to_use = normalize_sea_ticker(
        sym,
        api_preference="twelvedata",
        is_index=sym.startswith("^"),
    )
    logger.debug(
        "price.normalized_symbol",
        symbol=sym,
        normalized_symbol=normalized_symbol,
        api=api_to_use,
        query_params=query_params,
    )

    # In-process 1-hour cache hit
    cached = _PRICE_CACHE.get(sym)
    if cached and (time.time() - cached[1]) < _CACHE_TTL:
        return PriceResult(symbol=sym, price=cached[0], status="live")

    # Step 1: Live providers
    batch = fetch_spot_prices_batch([sym])
    batch.pop("__failed__", None)
    price = batch.get(sym, 0.0)
    if price and price > 0:
        _PRICE_CACHE[sym] = (price, time.time())
        return PriceResult(symbol=sym, price=price, status="live")

    # Step 2: Try aliases
    for alias in TICKER_ALIASES.get(sym, []):
        if alias == sym:
            continue
        alias_batch = fetch_spot_prices_batch([alias])
        alias_batch.pop("__failed__", None)
        alias_price = alias_batch.get(alias, 0.0)
        if alias_price and alias_price > 0:
            _PRICE_CACHE[sym] = (alias_price, time.time())
            upsert_ticker_price_cache(sym, alias_price, source=f"alias:{alias}")
            logger.debug(
                "price.alias_resolved", symbol=sym, alias=alias, price=alias_price
            )
            return PriceResult(
                symbol=sym,
                price=alias_price,
                status="alias",
                alias_used=alias,
                warning=f"{sym} resolved via alias {alias}",
            )

    # Step 3: Stale cache
    cached_row = get_ticker_price_cache(sym)
    if cached_row and cached_row.get("price") is not None:
        try:
            stale_price = float(cached_row["price"])
        except (TypeError, ValueError):
            stale_price = 0.0
        if stale_price <= 0:
            stale_price = 0.0
    else:
        stale_price = 0.0
    if stale_price > 0:
        try:
            recorded = datetime.datetime.fromisoformat(
                cached_row["recorded_at"].replace("Z", "+00:00")
            )
            age_hours = (
                datetime.datetime.now(datetime.UTC) - recorded
            ).total_seconds() / 3600
        except Exception:
            age_hours = 0.0
        logger.warning(
            "price.stale_used",
            symbol=sym,
            price=stale_price,
            age_hours=f"{age_hours:.0f}h",
        )
        return PriceResult(
            symbol=sym,
            price=stale_price,
            status="stale",
            stale_age_hours=age_hours,
            warning=(
                f"{sym} using last known price from {int(age_hours)}h ago. "
                "Live price unavailable — verify this position manually."
            ),
        )

    # Step 4: Unresolvable
    logger.warning("price.unresolvable", symbol=sym)
    return PriceResult(
        symbol=sym,
        price=None,
        status="unresolvable",
        warning=f"{sym} could not be priced and was excluded from analysis.",
    )


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
    spot.pop("__failed__", None)
    df["current_price"] = df["symbol"].map(spot)
    df["current_price"] = pd.to_numeric(df["current_price"], errors="coerce").fillna(
        0.0
    )
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
            results.append(
                {
                    "symbol": sym,
                    "weight_pct": round(float(row["weight"]) * 100, 1),
                    "price_polygon": p_polygon or None,
                    "price_finnhub": p_finnhub or None,
                    "price_used": round(price_used, 4),
                    "discrepancy_pct": 0.0,
                    "warned": False,
                }
            )
            continue

        discrepancy = abs(p_polygon - p_finnhub) / ((p_polygon + p_finnhub) / 2) * 100
        warned = discrepancy > 5.0
        price_used = (p_polygon + p_finnhub) / 2 if warned else p_polygon

        if warned:
            logger.warning(
                "price.data_integrity_warning",
                symbol=sym,
                price_polygon=f"{p_polygon:.4f}",
                price_finnhub=f"{p_finnhub:.4f}",
                discrepancy_pct=f"{discrepancy:.1f}",
                price_used=f"{price_used:.4f}",
            )

        results.append(
            {
                "symbol": sym,
                "weight_pct": round(float(row["weight"]) * 100, 1),
                "price_polygon": round(p_polygon, 4),
                "price_finnhub": round(p_finnhub, 4),
                "price_used": round(price_used, 4),
                "discrepancy_pct": round(discrepancy, 2),
                "warned": warned,
            }
        )

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
def _hhi_score(weights: pd.Series) -> float:
    """
    HHI-based concentration score (0-25 pts).
    Lower HHI (more diversified) → higher score.
    """
    w = weights / weights.sum() if weights.sum() > 0 else weights
    hhi = float((w**2).sum())  # [1/n, 1]
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


def _tax_alpha_score(df: pd.DataFrame) -> float:
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
    df["cost_basis"] = pd.to_numeric(df["cost_basis"], errors="coerce").fillna(0)
    df["current_price"] = pd.to_numeric(df["current_price"], errors="coerce")
    df["shares"] = pd.to_numeric(df["shares"], errors="coerce").fillna(0)
    priced = df["current_price"].notna() & (df["current_price"] > 0)
    if not priced.any():
        return 10.0
    df = df.loc[priced]

    total_value = float((df["shares"] * df["current_price"]).sum())
    if total_value <= 0:
        return 10.0

    df["unrealised_gain"] = (df["current_price"] - df["cost_basis"]) * df["shares"]
    harvest_value = float(
        df.loc[df["unrealised_gain"] < 0, "unrealised_gain"].abs().sum()
    )
    liability_value = float(df.loc[df["unrealised_gain"] > 0, "unrealised_gain"].sum())

    harvest_ratio = harvest_value / total_value
    liability_ratio = liability_value / total_value

    score = 10.0 + (harvest_ratio * 30.0) - (liability_ratio * 10.0)
    return round(max(0.0, min(20.0, score)), 2)


# ── Tax impact analysis ────────────────────────────────────────────────────────
def get_tax_impact_analysis(df: pd.DataFrame) -> dict:
    """
    Per-position tax liability and harvest-credit analysis at 20% LT CGT rate.

    df must have: symbol, shares, current_price, cost_basis (optional).
    Returns a dict with 'available', 'positions', 'total_liability',
    'total_harvest_opp', and 'narrative' keys.
    """
    CGT_RATE = 0.20

    if "cost_basis" not in df.columns or "current_price" not in df.columns:
        return {
            "available": False,
            "positions": [],
            "narrative": "Cost basis not provided — tax analysis unavailable.",
        }

    df = df.copy()
    df["cost_basis"] = pd.to_numeric(df["cost_basis"], errors="coerce").fillna(0)
    df["current_price"] = pd.to_numeric(df["current_price"], errors="coerce")
    df["shares"] = pd.to_numeric(df["shares"], errors="coerce").fillna(0)

    positions = []
    total_liability = 0.0
    total_harvest_opp = 0.0

    for _, row in df.iterrows():
        px = row["current_price"]
        if pd.isna(px) or float(px) <= 0:
            positions.append(
                {
                    "symbol": row["symbol"],
                    "unrealised_gain": None,
                    "tax_liability": 0.0,
                    "harvest_credit": 0.0,
                    "note": "price_unavailable",
                }
            )
            continue
        gain = (float(px) - row["cost_basis"]) * row["shares"]
        if gain > 0:
            tax_liability = round(gain * CGT_RATE, 2)
            harvest_credit = 0.0
            total_liability += tax_liability
        else:
            tax_liability = 0.0
            harvest_credit = round(abs(gain) * CGT_RATE, 2)
            total_harvest_opp += harvest_credit

        positions.append(
            {
                "symbol": row["symbol"],
                "unrealised_gain": round(gain, 2),
                "tax_liability": tax_liability,
                "harvest_credit": harvest_credit,
            }
        )

    narrative = (
        f"Estimated deferred tax liability: ${total_liability:,.0f} "
        f"(at 20% LT CGT rate). "
        f"Tax-loss harvesting opportunity: ${total_harvest_opp:,.0f}."
    )

    return {
        "available": True,
        "positions": positions,
        "total_liability": round(total_liability, 2),
        "total_harvest_opp": round(total_harvest_opp, 2),
        "narrative": narrative,
    }


# ── Tax-neutral pair matchmaking ───────────────────────────────────────────────
def get_tax_neutral_pairs(df: pd.DataFrame) -> list[dict]:
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

    df["unrealised_gain"] = (df["current_price"] - df["cost_basis"]) * df["shares"]
    df["tax_liability"] = df["unrealised_gain"].clip(lower=0) * CGT_RATE
    df["credit_per_share"] = (df["cost_basis"] - df["current_price"]).clip(
        lower=0
    ) * CGT_RATE

    gainers = df[df["unrealised_gain"] > 0].nlargest(2, "tax_liability")
    losers_pool = df[df["unrealised_gain"] < 0].sort_values(
        "unrealised_gain"
    )  # most negative first

    if gainers.empty or losers_pool.empty:
        return []

    pairs: list[dict] = []

    for _, gainer in gainers.iterrows():
        target = float(gainer["tax_liability"])  # total $ tax to offset
        remaining = target
        loser_instructions: list[dict] = []

        for _, loser in losers_pool.iterrows():
            if remaining <= 0.005:
                break
            cps = float(loser["credit_per_share"])
            if cps <= 0:
                continue

            shares_available = float(loser["shares"])
            shares_needed = remaining / cps
            shares_to_sell = round(min(shares_needed, shares_available), 2)
            loss_usd = round(
                shares_to_sell
                * abs(float(loser["current_price"] - loser["cost_basis"])),
                2,
            )
            credit_achieved = round(shares_to_sell * cps, 2)
            remaining = round(remaining - credit_achieved, 2)

            loser_instructions.append(
                {
                    "symbol": loser["symbol"],
                    "shares_to_sell": shares_to_sell,
                    "loss_usd": loss_usd,
                    "credit_usd": credit_achieved,
                }
            )

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

        pairs.append(
            {
                "winner_symbol": gainer["symbol"],
                "winner_shares": int(gainer["shares"]),
                "winner_gain_usd": round(float(gainer["unrealised_gain"]), 2),
                "winner_tax_liability_usd": round(float(gainer["tax_liability"]), 2),
                "loser_instructions": loser_instructions,
                "net_tax_impact_usd": round(net_tax, 2),
                "fully_offset": net_tax <= 1.0,
                "recommendation_text": rec,
            }
        )

    return pairs


# ── History helpers (used by portfolio metrics) ────────────────────────────────
def _fetch_symbol_history(sym: str, unix_from: int, unix_to: int) -> pd.Series | None:
    """Fetch daily close prices for one symbol. Returns None on failure."""
    if FINNHUB_API_KEY:
        try:
            r = requests.get(
                "https://finnhub.io/api/v1/stock/candle",
                params={
                    "symbol": _fh_ticker(sym),
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
        except Exception as err:
            logger.warning("history.finnhub_fetch_failed", symbol=sym, error=str(err))

    if ALPHA_VANTAGE_API_KEY:
        try:
            r = requests.get(
                "https://www.alphavantage.co/query",
                params={
                    "function": "TIME_SERIES_DAILY",
                    "symbol": _av_ticker(sym),
                    "outputsize": "compact",
                    "apikey": ALPHA_VANTAGE_API_KEY,
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
            logger.warning("history.av_fetch_failed", symbol=sym, error=str(err))

    return None


def _fetch_prices(symbols: list[str], period: str) -> pd.DataFrame:
    """Fetch daily Close prices for a period, returning from cache if fresh."""
    cache_key = f"{','.join(sorted(symbols))}:{period}"
    entry = _HISTORY_CACHE.get(cache_key)
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
    _HISTORY_CACHE[cache_key] = {"data": prices, "ts": time.time()}
    return prices


# ── Portfolio metrics (used by routers/portfolio.py) ──────────────────────────
def detect_portfolio_currency(symbols: list[str]) -> str:
    """
    Infer the dominant currency from ticker exchange suffixes.
    Returns the currency of the majority of detected symbols, falling back to USD.
    """
    counts: dict[str, int] = {}
    for sym in symbols:
        for suffix, curr in _SUFFIX_CURRENCY.items():
            if sym.upper().endswith(suffix.upper()):
                counts[curr] = counts.get(curr, 0) + 1
                break
    if not counts:
        return "USD"
    return max(counts, key=lambda c: counts[c])


def calculate_portfolio_metrics(positions: list) -> dict:
    """Calculate diversification, concentration, volatility, and returns."""
    df = pd.DataFrame(positions)
    df.columns = [c.lower().strip() for c in df.columns]

    if not {"symbol", "shares"}.issubset(set(df.columns)):
        raise ValueError("CSV must contain 'symbol' and 'shares' columns.")

    df["shares"] = pd.to_numeric(df["shares"], errors="coerce").fillna(0)
    df["symbol"] = df["symbol"].str.upper()
    symbols = df["symbol"].tolist()
    # # SEA-TICKER-FIX: One resolver pass per row (cached in local dict)
    _meta_by = {s: resolve_security(s) for s in symbols}

    # Resolve prices using the full waterfall (live → alias → stale → unresolvable)
    price_results: dict[str, PriceResult] = {
        sym: get_price_with_fallback(sym) for sym in symbols
    }

    unresolvable = [
        sym for sym, r in price_results.items() if r.status == "unresolvable"
    ]
    resolved = [sym for sym in symbols if sym not in unresolvable]

    if not resolved:
        # SEA-VN-FIX before: an all-price-failure portfolio raised here and the
        # report path died. SEA-VN-FIX after: keep non-price fields and mark
        # each position explicitly unavailable.
        logger.warning(
            "price.all_positions_unavailable",
            symbols=symbols,
            unresolvable=unresolvable,
        )

    # Build warnings list for all non-live tickers
    price_warnings: list[str] = []
    for _sym, r in price_results.items():
        if r.warning:
            price_warnings.append(r.warning)

    spot_prices = {
        sym: float(r.price)
        for sym, r in price_results.items()
        if r.price is not None and float(r.price) > 0
    }
    price_status = {sym: r.status for sym, r in price_results.items()}

    df["native_currency"] = df["symbol"].map(lambda s: _meta_by[s].native_currency)
    df["market_code"] = df["symbol"].map(lambda s: _meta_by[s].market)
    df["provider_ticker"] = df["symbol"].map(lambda s: _meta_by[s].provider_ticker)

    for sym in resolved:
        persist_resolution_best_effort(_meta_by[sym])
    df["current_price"] = df["symbol"].map(spot_prices)
    df["native_price"] = df["current_price"]

    # Historical prices for volatility (only resolved tickers)
    returns = _fetch_historical_returns(resolved, "1mo")
    priced = df["symbol"].isin(resolved) & df["current_price"].notna()
    df["current_value"] = np.where(
        priced,
        df["shares"] * df["current_price"],
        np.nan,
    )

    # Recalculate weights based only on resolved tickers
    resolved_mask = df["symbol"].isin(resolved) & df["current_price"].notna()
    total_value = float(np.nansum(df.loc[resolved_mask, "current_value"].astype(float)))
    df["weight"] = 0.0
    if total_value > 0:
        df.loc[resolved_mask, "weight"] = (
            df.loc[resolved_mask, "current_value"] / total_value
        )

    # Scoring components
    hhi_pts = _hhi_score(df["weight"])

    df["beta"] = [float(_fetch_beta(sym)) for sym in df["symbol"].tolist()]
    weighted_beta = float((df["weight"] * df["beta"]).sum()) if total_value > 0 else 1.0
    beta_pts = _beta_score(weighted_beta)

    tax_pts = _tax_alpha_score(df)
    corr_pts = 15.0  # neutral placeholder — risk_engine fills this in the DNA flow

    dna_score = max(5, min(100, int(hhi_pts + beta_pts + tax_pts + corr_pts)))

    # Annualised volatility (requires historical price DataFrame)
    volatility = 0.0
    if returns is not None and not returns.empty:
        weights_series = df.set_index("symbol")["weight"]
        aligned_weights = weights_series.reindex(returns.columns).fillna(0)
        portfolio_returns = (returns * aligned_weights).sum(axis=1)
        volatility = float(portfolio_returns.std() * np.sqrt(252) * 100)

    pnl_pct = None
    if "cost_basis" in df.columns:
        df["cost_basis"] = pd.to_numeric(df["cost_basis"], errors="coerce")
        total_cost = float((df["shares"] * df["cost_basis"]).sum())
        pnl_pct = (
            float((total_value - total_cost) / total_cost * 100)
            if total_cost > 0
            else None
        )

    positions_out = df[
        [
            "symbol",
            "shares",
            "native_currency",
            "market_code",
            "provider_ticker",
            "native_price",
            "current_price",
            "current_value",
            "weight",
        ]
    ].copy()
    positions_out["price_status"] = (
        positions_out["symbol"].map(price_status).fillna("live")
    )
    base_currency = detect_portfolio_currency(symbols)
    positions_out["portfolio_base_currency"] = base_currency
    positions_out["display_currency"] = positions_out["native_currency"]
    positions_out["fx_rate_used"] = None

    # SEA-VN-FIX before: VN rows only exposed current_value, which could become
    # null/blank with no explicit reason. SEA-VN-FIX after: compute USD market
    # value with local price + FX, or annotate an actionable data outage.
    market_value_payload: dict[str, dict] = {}
    shares_by_symbol = dict(zip(df["symbol"], df["shares"], strict=False))
    for sym in symbols:
        status = price_status.get(sym, "unresolvable")
        if _is_sea_market_symbol(sym):
            try:
                market_value_payload[sym] = compute_market_value(
                    sym,
                    float(shares_by_symbol.get(sym) or 0),
                )
                market_value_payload[sym]["data_unavailable"] = False
                market_value_payload[sym]["price_unavailable_message"] = None
            except (DataUnavailableError, ValueError, TypeError) as exc:
                logger.warning(
                    "price.market_value_unavailable",
                    symbol=sym,
                    error=str(exc),
                )
                market_value_payload[sym] = {
                    "ticker": sym,
                    "price_local": None,
                    "fx_rate": None,
                    "price_usd": None,
                    "market_value_usd": None,
                    "source": "unavailable",
                    "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
                    "data_unavailable": True,
                    "price_unavailable_message": (
                        f"Price data unavailable for {sym}. Upload confirmed prices or retry."
                    ),
                }
            continue

        current_value = spot_prices.get(sym)
        market_value_payload[sym] = {
            "ticker": sym,
            "price_local": spot_prices.get(sym),
            "fx_rate": 1.0 if _meta_by[sym].native_currency == "USD" else None,
            "price_usd": (
                spot_prices.get(sym) if _meta_by[sym].native_currency == "USD" else None
            ),
            "market_value_usd": (
                float(current_value) * float(shares_by_symbol.get(sym) or 0)
                if current_value and _meta_by[sym].native_currency == "USD"
                else None
            ),
            "source": status,
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
            "data_unavailable": status == "unresolvable",
            "price_unavailable_message": (
                f"Price data unavailable for {sym}. Upload confirmed prices or retry."
                if status == "unresolvable"
                else None
            ),
        }

    positions_out["price_local"] = positions_out["symbol"].map(
        lambda s: market_value_payload.get(s, {}).get("price_local")
    )
    positions_out["fx_rate"] = positions_out["symbol"].map(
        lambda s: market_value_payload.get(s, {}).get("fx_rate")
    )
    positions_out["price_usd"] = positions_out["symbol"].map(
        lambda s: market_value_payload.get(s, {}).get("price_usd")
    )
    positions_out["market_value_usd"] = positions_out["symbol"].map(
        lambda s: market_value_payload.get(s, {}).get("market_value_usd")
    )
    positions_out["source"] = positions_out["symbol"].map(
        lambda s: market_value_payload.get(s, {}).get("source")
    )
    positions_out["data_unavailable"] = positions_out["symbol"].map(
        lambda s: bool(market_value_payload.get(s, {}).get("data_unavailable"))
    )
    positions_out["price_unavailable_message"] = positions_out["symbol"].map(
        lambda s: market_value_payload.get(s, {}).get("price_unavailable_message")
    )

    # # SEA-NATIVE-TICKER-FIX: derive canonical benchmark from resolved symbols
    _mf = portfolio_market_framing(resolved)
    portfolio_benchmark = _mf["benchmark"]
    portfolio_benchmark_label = _mf["benchmark_label"]
    portfolio_market_context = _mf["market_context"]

    # SEA-NATIVE-CURRENCY-FIX: country/region exposure breakdown (% of portfolio value)
    _MARKET_COUNTRY: dict[str, str] = {
        "VN": "Vietnam",
        "LSE": "United Kingdom",
        "US": "United States",
        "JK": "Indonesia",
        "BK": "Thailand",
        "KL": "Malaysia",
        "SG": "Singapore",
        "AX": "Australia",
        "TSE": "Japan",
        "HKEX": "Hong Kong",
        "NSE": "India",
        "BSE": "India",
        "SSE": "China",
        "SZSE": "China",
    }
    _MARKET_REGION: dict[str, str] = {
        "VN": "Southeast Asia",
        "JK": "Southeast Asia",
        "BK": "Southeast Asia",
        "KL": "Southeast Asia",
        "SG": "Southeast Asia",
        "LSE": "Europe",
        "US": "Americas",
        "AX": "Asia Pacific",
        "TSE": "Asia Pacific",
        "HKEX": "Asia Pacific",
        "NSE": "Asia Pacific",
        "BSE": "Asia Pacific",
        "SSE": "Asia Pacific",
        "SZSE": "Asia Pacific",
    }
    _SEA_MARKETS = {"VN", "JK", "BK", "KL", "SG"}

    country_buckets: dict[str, float] = {}
    region_buckets: dict[str, float] = {}
    sea_value = 0.0
    for _pos in _records_nan_to_none(positions_out.to_dict("records")):
        _mc = str(_pos.get("market_code") or "US")
        _val = float(_pos.get("current_value") or 0)
        _country = _MARKET_COUNTRY.get(_mc, "Other")
        _region = _MARKET_REGION.get(_mc, "Other")
        country_buckets[_country] = country_buckets.get(_country, 0) + _val
        region_buckets[_region] = region_buckets.get(_region, 0) + _val
        if _mc in _SEA_MARKETS:
            sea_value += _val

    _tv = float(total_value) if total_value else 1.0
    country_exposure = sorted(
        [
            {"country": c, "value": v, "pct": round(v / _tv * 100, 1)}
            for c, v in country_buckets.items()
        ],
        key=lambda x: x["pct"],
        reverse=True,
    )
    region_exposure = sorted(
        [
            {"region": r, "value": v, "pct": round(v / _tv * 100, 1)}
            for r, v in region_buckets.items()
        ],
        key=lambda x: x["pct"],
        reverse=True,
    )
    sea_pct = round(sea_value / _tv * 100, 1) if _tv > 0 else 0.0

    result = {
        "total_value": float(total_value),
        "base_currency": base_currency,
        "portfolio_base_currency": base_currency,
        # SEA-NATIVE-TICKER-FIX: canonical benchmark for PDF/swarm (never silently ^GSPC for VN)
        "portfolio_benchmark": portfolio_benchmark,
        "portfolio_benchmark_label": portfolio_benchmark_label,
        "portfolio_market_context": portfolio_market_context,
        "hhi": round(float((df["weight"] ** 2).sum()), 4) if total_value > 0 else 0.0,
        "num_positions": len(df),
        "num_priced": len(resolved),
        "dna_score": dna_score,
        "tax_alpha_score": tax_pts,
        "score_breakdown": {
            "hhi_concentration": hhi_pts,
            "beta_risk": beta_pts,
            "tax_alpha": tax_pts,
            "correlation": corr_pts,
        },
        "weighted_beta": round(weighted_beta, 3),
        "max_position_pct": round(float(df["weight"].max()) * 100, 2),
        "annualized_volatility": round(volatility, 2),
        "pnl_pct": round(pnl_pct, 2) if pnl_pct is not None else None,
        "positions": _enrich_positions_fx_hint(
            _records_nan_to_none(positions_out.to_dict("records"))
        ),
        # SEA-NATIVE-CURRENCY-FIX: geographic exposure
        "country_exposure": country_exposure,
        "region_exposure": region_exposure,
        "sea_pct": sea_pct,
    }
    if price_warnings:
        result["warnings"] = price_warnings
    if unresolvable:
        result["failed_tickers"] = unresolvable
    return result


def canonical_metrics_for_institutional_report(
    portfolio_data: dict,
    dna_data: dict | None,
    thesis: dict | None,
    positions: list | None,
) -> dict:
    """
    Single entry point for PDF / API: reconciled AUM, beta, Sharpe, HHI.

    Prefer ``portfolio_data['metrics']`` from :func:`calculate_portfolio_metrics`;
    thesis/DNA are fallbacks only. Implemented in ``report_metrics`` to avoid
    duplicating reconciliation logic here.
    """
    from services.report_metrics import canonical_portfolio_headlines

    return canonical_portfolio_headlines(
        portfolio_data or {},
        dna_data or {},
        thesis or {},
        positions or [],
    )
