from __future__ import annotations

import datetime
import time
from typing import Dict, Tuple  # noqa: UP035 - public signature requested by P0 fix

import requests
import structlog

from core.config import settings

logger = structlog.get_logger("neufin.ticker_normalizer")


class DataUnavailableError(RuntimeError):
    """Raised when live and cached market data cannot produce a safe value."""


SEA_EXCHANGE_MAP: dict[str, dict[str, str]] = {
    ".VN": {
        "exchange": "HOSE",
        "country": "Vietnam",
        "index": "VNINDEX",
        "benchmark": "VN-Index",
        "currency": "VND",
        "yahoo_index": "^VNINDEX.VN",
    },
    ".SI": {
        "exchange": "XSES",
        "country": "Singapore",
        "index": "STI",
        "benchmark": "STI",
        "currency": "SGD",
        "yahoo_index": "^STI",
    },
    ".JK": {
        "exchange": "XIDX",
        "country": "Indonesia",
        "index": "JCI",
        "benchmark": "JCI",
        "currency": "IDR",
        "yahoo_index": "^JKSE",
    },
    ".BK": {
        "exchange": "XBKK",
        "country": "Thailand",
        "index": "SET",
        "benchmark": "SET",
        "currency": "THB",
        "yahoo_index": "^SET.BK",
    },
    ".KL": {
        "exchange": "XKLS",
        "country": "Malaysia",
        "index": "FBMKLCI",
        "benchmark": "FBMKLCI",
        "currency": "MYR",
        "yahoo_index": "^KLSE",
    },
    ".PS": {
        "exchange": "XPHS",
        "country": "Philippines",
        "index": "PSEI",
        "benchmark": "PSEI",
        "currency": "PHP",
        "yahoo_index": "PSEI.PS",
    },
}

_INDEX_ALIAS_TO_SUFFIX: dict[str, str] = {
    "^VNINDEX": ".VN",
    "VNINDEX": ".VN",
    "VNI": ".VN",
    "^STI": ".SI",
    "STI": ".SI",
    "^JKSE": ".JK",
    "JKSE": ".JK",
    "JCI": ".JK",
    "^SET.BK": ".BK",
    "SET": ".BK",
    "^KLSE": ".KL",
    "KLSE": ".KL",
    "FBMKLCI": ".KL",
    "^PSEI": ".PS",
    "PSEI": ".PS",
}

_FX_CACHE_TTL_SECONDS = 3600
_FX_CACHE: dict[tuple[str, str], tuple[float, float]] = {}


def _clean_symbol(raw_ticker: str) -> str:
    return (raw_ticker or "").strip().upper()


def _suffix_for_symbol(symbol: str) -> str | None:
    if symbol in _INDEX_ALIAS_TO_SUFFIX:
        return _INDEX_ALIAS_TO_SUFFIX[symbol]
    return next(
        (suffix for suffix in SEA_EXCHANGE_MAP if symbol.endswith(suffix)), None
    )


def _is_index(symbol: str, is_index: bool) -> bool:
    return is_index or symbol.startswith("^") or symbol in _INDEX_ALIAS_TO_SUFFIX


def normalize_sea_ticker(
    raw_ticker: str,
    api_preference: str = "twelvedata",
    is_index: bool = False,
) -> Tuple[str, Dict[str, str], str]:  # noqa: UP006 - public signature requested
    """
    Normalize SEA exchange tickers into provider-specific symbol plus query params.

    SEA-VN-FIX: TwelveData needs explicit exchange/country parameters for Vietnam
    instead of the previous symbol-only ``HPG:HOSE``/``VNI:INDEX`` guesses.
    """
    symbol = _clean_symbol(raw_ticker)
    preferred_api = (api_preference or "twelvedata").strip().lower()
    suffix = _suffix_for_symbol(symbol)

    if not suffix:
        return symbol, {"symbol": symbol}, preferred_api

    config = SEA_EXCHANGE_MAP[suffix]
    wants_index = _is_index(symbol, is_index)

    if preferred_api == "yahoo":
        if wants_index:
            yahoo_symbol = config["yahoo_index"]
            return yahoo_symbol, {"symbol": yahoo_symbol}, "yahoo"
        return symbol, {"symbol": symbol}, "yahoo"

    if wants_index:
        td_index = config["index"]
        params = {"symbol": td_index, "country": config["country"]}
        return td_index, params, "twelvedata"

    td_symbol = symbol.removesuffix(suffix)
    params = {
        "symbol": td_symbol,
        "exchange": config["exchange"],
        "country": config["country"],
    }
    return td_symbol, params, "twelvedata"


def currency_for_ticker(raw_ticker: str) -> str:
    symbol = _clean_symbol(raw_ticker)
    suffix = _suffix_for_symbol(symbol)
    if suffix:
        return SEA_EXCHANGE_MAP[suffix]["currency"]
    return "USD"


def _float_price(value: object) -> float | None:
    try:
        price = float(value or 0)
    except (TypeError, ValueError):
        return None
    return price if price > 0 else None


def _fetch_twelvedata_price(raw_ticker: str) -> tuple[float, str] | None:
    if not settings.TWELVEDATA_API_KEY:
        return None

    symbol = _clean_symbol(raw_ticker)
    normalized_symbol, query_params, api_to_use = normalize_sea_ticker(
        symbol,
        api_preference="twelvedata",
        is_index=symbol.startswith("^"),
    )
    if api_to_use != "twelvedata":
        return None

    try:
        response = requests.get(
            "https://api.twelvedata.com/price",
            params={**query_params, "apikey": settings.TWELVEDATA_API_KEY},
            timeout=8.0,
        )
        data = response.json()
        if response.status_code == 429 or (
            isinstance(data, dict) and data.get("status") == "error"
        ):
            logger.warning(
                "ticker_normalizer.twelvedata_price_unavailable",
                symbol=symbol,
                normalized_symbol=normalized_symbol,
                message=data.get("message") if isinstance(data, dict) else None,
            )
            return None
        if isinstance(data, dict):
            price = _float_price(data.get("price"))
            if price:
                return price, "twelvedata"
    except Exception as exc:
        logger.warning(
            "ticker_normalizer.twelvedata_price_failed",
            symbol=symbol,
            normalized_symbol=normalized_symbol,
            error=str(exc),
        )
    return None


def _fetch_yahoo_price(raw_ticker: str) -> tuple[float, str] | None:
    try:
        import yfinance as yf
    except ImportError:
        logger.warning("ticker_normalizer.yfinance_unavailable")
        return None

    symbol = _clean_symbol(raw_ticker)
    yahoo_symbol, _, _ = normalize_sea_ticker(
        symbol,
        api_preference="yahoo",
        is_index=symbol.startswith("^"),
    )
    try:
        history = yf.Ticker(yahoo_symbol).history(period="5d", auto_adjust=True)
        if history is not None and not history.empty and "Close" in history.columns:
            price = _float_price(history["Close"].iloc[-1])
            if price:
                return price, "yahoo"
    except Exception as exc:
        logger.warning(
            "ticker_normalizer.yahoo_price_failed",
            symbol=symbol,
            yahoo_symbol=yahoo_symbol,
            error=str(exc),
        )
    return None


def _fetch_twelvedata_fx(base: str, quote: str) -> float | None:
    if not settings.TWELVEDATA_API_KEY:
        return None
    try:
        response = requests.get(
            "https://api.twelvedata.com/forex/price",
            params={
                "symbol": f"{base}/{quote}",
                "apikey": settings.TWELVEDATA_API_KEY,
            },
            timeout=8.0,
        )
        data = response.json()
        if response.status_code == 429 or (
            isinstance(data, dict) and data.get("status") == "error"
        ):
            logger.warning(
                "ticker_normalizer.twelvedata_fx_unavailable",
                base=base,
                quote=quote,
                message=data.get("message") if isinstance(data, dict) else None,
            )
            return None
        if isinstance(data, dict):
            return _float_price(data.get("price"))
    except Exception as exc:
        logger.warning(
            "ticker_normalizer.twelvedata_fx_failed",
            base=base,
            quote=quote,
            error=str(exc),
        )
    return None


def _fetch_alpha_vantage_fx(base: str, quote: str) -> float | None:
    if not settings.ALPHA_VANTAGE_API_KEY:
        return None
    try:
        response = requests.get(
            "https://www.alphavantage.co/query",
            params={
                "function": "CURRENCY_EXCHANGE_RATE",
                "from_currency": base,
                "to_currency": quote,
                "apikey": settings.ALPHA_VANTAGE_API_KEY,
            },
            timeout=8.0,
        )
        data = response.json()
        if not isinstance(data, dict):
            return None
        payload = data.get("Realtime Currency Exchange Rate") or {}
        return _float_price(payload.get("5. Exchange Rate"))
    except Exception as exc:
        logger.warning(
            "ticker_normalizer.alpha_vantage_fx_failed",
            base=base,
            quote=quote,
            error=str(exc),
        )
    return None


def get_fx_rate(base: str, quote: str) -> float:
    """
    Return base/quote FX using TwelveData, then Alpha Vantage, then last-known cache.

    SEA-VN-FIX: never returns ``None`` because callers must distinguish explicit
    data outages from a legitimate zero valuation.
    """
    base_ccy = (base or "").strip().upper()
    quote_ccy = (quote or "").strip().upper()
    if not base_ccy or not quote_ccy:
        raise DataUnavailableError("FX currency code is missing")
    if base_ccy == quote_ccy:
        return 1.0

    cache_key = (base_ccy, quote_ccy)
    cached = _FX_CACHE.get(cache_key)
    now = time.time()
    if cached and (now - cached[1]) < _FX_CACHE_TTL_SECONDS:
        return cached[0]

    for fetcher in (_fetch_twelvedata_fx, _fetch_alpha_vantage_fx):
        rate = fetcher(base_ccy, quote_ccy)
        if rate and rate > 0:
            _FX_CACHE[cache_key] = (rate, now)
            return rate
        inverse_rate = fetcher(quote_ccy, base_ccy)
        if inverse_rate and inverse_rate > 0:
            rate = 1 / inverse_rate
            _FX_CACHE[cache_key] = (rate, now)
            return rate

    if cached:
        logger.warning(
            "ticker_normalizer.fx_stale_used",
            base=base_ccy,
            quote=quote_ccy,
            stale_seconds=round(now - cached[1]),
        )
        return cached[0]

    raise DataUnavailableError(f"FX rate unavailable for {base_ccy}/{quote_ccy}")


def compute_market_value(ticker: str, shares: float, date: object = None) -> dict:
    """
    Compute a USD market value from local SEA price plus FX.

    ``date`` is accepted for API compatibility; current endpoints need spot
    valuation, so historical pricing is intentionally not used here.
    """
    _ = date
    symbol = _clean_symbol(ticker)
    share_count = float(shares or 0)

    price_payload = _fetch_twelvedata_price(symbol) or _fetch_yahoo_price(symbol)
    if not price_payload:
        raise DataUnavailableError(f"Price unavailable for {symbol}")

    price_local, source = price_payload
    local_currency = currency_for_ticker(symbol)
    fx_rate = get_fx_rate(local_currency, "USD")
    price_usd = price_local * fx_rate

    return {
        "ticker": symbol,
        "price_local": price_local,
        "fx_rate": fx_rate,
        "price_usd": price_usd,
        "market_value_usd": price_usd * share_count,
        "source": source,
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
    }
