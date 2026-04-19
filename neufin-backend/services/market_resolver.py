"""
# SEA-TICKER-FIX: Canonical market / currency resolution for portfolio symbols.

Resolves user-supplied tickers (incl. VN, UK, indices) to provider-specific IDs
and metadata. Falls back to suffix-based logic from market_currency for unknowns.
"""

from __future__ import annotations

from dataclasses import dataclass

import structlog

from services.market_currency import (
    SUFFIX_CURRENCY,
    finnhub_symbol,
    infer_native_currency,
)

logger = structlog.get_logger("neufin.market_resolver")


@dataclass(frozen=True)
class SecurityMetadata:
    """# SEA-TICKER-FIX: Single source of truth for a listed security row."""

    raw_symbol: str
    normalized_symbol: str
    market: str  # e.g. US, VN, LSE, SG, GLOBAL_INDEX
    native_currency: str
    provider_ticker: str  # Yahoo / primary OHLC path (yfinance)
    provider_finnhub: str  # Finnhub /quote & /stock/candle symbol
    benchmark: str
    is_index: bool


# # SEA-TICKER-FIX: User-typed index aliases → Yahoo-style symbols
_INDEX_CANON: dict[str, str] = {
    "VNINDEX": "^VNINDEX",
    "VN30": "^VN30",
    "VN30INDEX": "^VN30",
    "FTSE": "^FTSE",
    "FTSE100": "^FTSE",
}

# # SEA-TICKER-FIX: Known global indices → (market bucket, CCY, default benchmark)
_INDEX_META: dict[str, tuple[str, str, str]] = {
    "^VNINDEX": ("GLOBAL_INDEX", "VND", "^VNINDEX"),
    "^VN30": ("GLOBAL_INDEX", "VND", "^VN30"),
    "^FTSE": ("GLOBAL_INDEX", "GBP", "^FTSE"),
    "^GSPC": ("GLOBAL_INDEX", "USD", "^GSPC"),
    "^DJI": ("GLOBAL_INDEX", "USD", "^DJI"),
    "^IXIC": ("GLOBAL_INDEX", "USD", "^IXIC"),
}


def _vn_market_from_symbol(sym: str) -> str:
    """# SEA-TICKER-FIX: Best-effort bucket; HOSE vs HNX not distinguished without MIC."""
    return "VN"


def resolve_security(raw_symbol: str, user_region: str = "global") -> SecurityMetadata:
    """
    # SEA-TICKER-FIX: Map raw CSV/API symbol to trading metadata.

    ``user_region`` reserved for future locale hints — does not change logic yet.
    """
    _ = user_region
    raw = (raw_symbol or "").strip()
    upper = raw.upper()

    # Index aliases (missing caret, common names)
    if upper in _INDEX_CANON:
        upper = _INDEX_CANON[upper]

    is_index = upper.startswith("^")
    if is_index and upper in _INDEX_META:
        mkt, ccy, bench = _INDEX_META[upper]
        return SecurityMetadata(
            raw_symbol=raw_symbol.strip(),
            normalized_symbol=upper,
            market=mkt,
            native_currency=ccy,
            provider_ticker=upper,
            provider_finnhub=upper,
            benchmark=bench,
            is_index=True,
        )
    if is_index:
        ccy = "USD"
        bench = upper
        if "VN" in upper or upper in ("^VNINDEX", "^VN30"):
            ccy = "VND"
        elif upper == "^FTSE":
            ccy = "GBP"
        return SecurityMetadata(
            raw_symbol=raw_symbol.strip(),
            normalized_symbol=upper,
            market="GLOBAL_INDEX",
            native_currency=ccy,
            provider_ticker=upper,
            provider_finnhub=upper,
            benchmark=bench,
            is_index=True,
        )

    # Equity / ETF — suffix → currency from existing map
    native = infer_native_currency(upper)
    if upper.endswith(".VN"):
        mcode = _vn_market_from_symbol(upper)
        bench = "^VNINDEX"
    elif upper.endswith(".L"):
        mcode = "LSE"
        bench = "^FTSE"
    elif any(upper.endswith(suf) for suf in SUFFIX_CURRENCY if suf != ".VN"):
        mcode = "INTL"
        bench = "^GSPC"
    else:
        mcode = "US"
        bench = "^GSPC"

    fh = finnhub_symbol(upper)
    return SecurityMetadata(
        raw_symbol=raw_symbol.strip(),
        normalized_symbol=upper,
        market=mcode,
        native_currency=native,
        provider_ticker=upper,
        provider_finnhub=fh,
        benchmark=bench,
        is_index=False,
    )


def persist_resolution_best_effort(meta: SecurityMetadata) -> None:
    """
    # SEA-TICKER-FIX: Cache resolver output in Supabase when table exists.

    Non-fatal if table missing or RLS blocks (local dev).
    """
    try:
        from database import supabase

        supabase.table("symbol_market_resolution").upsert(
            {
                "raw_symbol": meta.normalized_symbol,
                "normalized_symbol": meta.normalized_symbol,
                "market_code": meta.market,
                "native_currency": meta.native_currency,
                "provider_yahoo": meta.provider_ticker,
                "provider_finnhub": meta.provider_finnhub,
                "benchmark": meta.benchmark,
                "is_index": meta.is_index,
            },
            on_conflict="raw_symbol",
        ).execute()
    except Exception as exc:
        logger.debug(
            "symbol_resolution.persist_failed",
            symbol=meta.normalized_symbol,
            error=str(exc),
        )
