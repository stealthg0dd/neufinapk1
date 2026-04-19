"""
# SEA-NATIVE-TICKER-FIX: Canonical market / currency resolution for portfolio symbols.

Resolves user-supplied tickers (incl. VN, UK, SEA, indices) to provider-specific IDs
and metadata. Falls back to suffix-based logic from market_currency for unknowns.
"""

from __future__ import annotations

from dataclasses import dataclass

import structlog

from services.market_currency import (
    finnhub_symbol,
    infer_native_currency,
)

logger = structlog.get_logger("neufin.market_resolver")


@dataclass(frozen=True)
class SecurityMetadata:
    """# SEA-NATIVE-TICKER-FIX: Single source of truth for a listed security row."""

    raw_symbol: str
    normalized_symbol: str
    market: str  # e.g. US, VN, LSE, SG, JK, BK, KL, GLOBAL_INDEX
    native_currency: str
    provider_ticker: str  # Yahoo / primary OHLC path (yfinance)
    provider_finnhub: str  # Finnhub /quote & /stock/candle symbol
    benchmark: str
    is_index: bool


# # SEA-NATIVE-TICKER-FIX: User-typed index aliases → Yahoo-style symbols
_INDEX_CANON: dict[str, str] = {
    "VNINDEX": "^VNINDEX",
    "VN30": "^VN30",
    "VN30INDEX": "^VN30",
    "FTSE": "^FTSE",
    "FTSE100": "^FTSE",
    # SEA index aliases
    "JKSE": "^JKSE",
    "JCI": "^JKSE",
    "SET": "^SET.BK",
    "SET50": "^SET.BK",
    "KLCI": "^KLSE",
    "FBMKLCI": "^KLSE",
    "STI": "^STI",
    # Other
    "NIKKEI": "^N225",
    "NIKKEI225": "^N225",
    "HSI": "^HSI",
    "HANGSENG": "^HSI",
    "NIFTY": "^NSEI",
    "SENSEX": "^BSESN",
    "ASX": "^AXJO",
    "ASX200": "^AXJO",
}

# # SEA-NATIVE-TICKER-FIX: Known global indices → (market bucket, CCY, default benchmark)
_INDEX_META: dict[str, tuple[str, str, str]] = {
    # Vietnam
    "^VNINDEX": ("GLOBAL_INDEX", "VND", "^VNINDEX"),
    "^VN30": ("GLOBAL_INDEX", "VND", "^VN30"),
    # UK
    "^FTSE": ("GLOBAL_INDEX", "GBP", "^FTSE"),
    # US
    "^GSPC": ("GLOBAL_INDEX", "USD", "^GSPC"),
    "^DJI": ("GLOBAL_INDEX", "USD", "^DJI"),
    "^IXIC": ("GLOBAL_INDEX", "USD", "^IXIC"),
    # SEA
    "^JKSE": ("GLOBAL_INDEX", "IDR", "^JKSE"),  # Indonesia JKSE
    "^SET.BK": ("GLOBAL_INDEX", "THB", "^SET.BK"),  # Thailand SET
    "^KLSE": ("GLOBAL_INDEX", "MYR", "^KLSE"),  # Malaysia KLCI
    "^STI": ("GLOBAL_INDEX", "SGD", "^STI"),  # Singapore STI
    # Others
    "^N225": ("GLOBAL_INDEX", "JPY", "^N225"),
    "^HSI": ("GLOBAL_INDEX", "HKD", "^HSI"),
    "^NSEI": ("GLOBAL_INDEX", "INR", "^NSEI"),
    "^BSESN": ("GLOBAL_INDEX", "INR", "^BSESN"),
    "^AXJO": ("GLOBAL_INDEX", "AUD", "^AXJO"),
}

# # SEA-NATIVE-TICKER-FIX: Exchange suffix → local benchmark index
_SUFFIX_BENCHMARK: dict[str, str] = {
    ".VN": "^VNINDEX",
    ".L": "^FTSE",
    ".JK": "^JKSE",  # Indonesia (IDX)
    ".BK": "^SET.BK",  # Thailand (SET)
    ".KL": "^KLSE",  # Malaysia (Bursa)
    ".SI": "^STI",  # Singapore (SGX)
    ".AX": "^AXJO",  # Australia (ASX)
    ".T": "^N225",  # Japan (TSE)
    ".HK": "^HSI",  # Hong Kong
    ".NS": "^NSEI",  # India (NSE)
    ".BO": "^BSESN",  # India (BSE)
    ".SS": "000001.SS",  # China (Shanghai)
    ".SZ": "399001.SZ",  # China (Shenzhen)
}

# # SEA-NATIVE-TICKER-FIX: Exchange suffix → canonical market code
_SUFFIX_MARKET: dict[str, str] = {
    ".VN": "VN",
    ".L": "LSE",
    ".JK": "JK",
    ".BK": "BK",
    ".KL": "KL",
    ".SI": "SG",
    ".AX": "AX",
    ".T": "TSE",
    ".HK": "HKEX",
    ".NS": "NSE",
    ".BO": "BSE",
    ".SS": "SSE",
    ".SZ": "SZSE",
}

# # SEA-NATIVE-TICKER-FIX: Human-readable labels for known benchmarks
BENCHMARK_LABELS: dict[str, str] = {
    "^VNINDEX": "VN-Index",
    "^VN30": "VN30",
    "^FTSE": "FTSE 100",
    "^GSPC": "S&P 500",
    "^DJI": "Dow Jones",
    "^IXIC": "NASDAQ",
    "^JKSE": "IDX Composite",
    "^SET.BK": "SET Index",
    "^KLSE": "FBM KLCI",
    "^STI": "Straits Times Index",
    "^N225": "Nikkei 225",
    "^HSI": "Hang Seng",
    "^NSEI": "Nifty 50",
    "^BSESN": "Sensex",
    "^AXJO": "ASX 200",
}


def _vn_market_from_symbol(sym: str) -> str:
    """# SEA-NATIVE-TICKER-FIX: Best-effort bucket; HOSE vs HNX not distinguished without MIC."""
    return "VN"


def resolve_security(raw_symbol: str, user_region: str = "global") -> SecurityMetadata:
    """
    # SEA-NATIVE-TICKER-FIX: Map raw CSV/API symbol to trading metadata.

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
        # Unknown index: infer currency from known VN/FTSE pattern; default USD
        ccy = "USD"
        bench = upper
        if "VN" in upper:
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

    # Equity / ETF — suffix → currency, market, benchmark from canonical maps
    native = infer_native_currency(upper)

    # Walk suffix maps (longest match first to avoid partial hits)
    mcode = "US"
    bench = "^GSPC"
    for suf in sorted(_SUFFIX_MARKET, key=len, reverse=True):
        if upper.endswith(suf.upper()):
            mcode = _SUFFIX_MARKET[suf]
            bench = _SUFFIX_BENCHMARK.get(suf, "^GSPC")
            break

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


def portfolio_dominant_benchmark(symbols: list[str]) -> str:
    """
    # SEA-NATIVE-TICKER-FIX: Return the most-represented benchmark for a symbol list.

    For mixed portfolios the benchmark with the highest total weight (by count) wins.
    Non-USD benchmarks are preferred when tied with ^GSPC (SEA/UK-first rule).
    Falls back to ^GSPC when the list is empty or all symbols are US equities.
    """
    if not symbols:
        return "^GSPC"
    counts: dict[str, int] = {}
    for sym in symbols:
        try:
            bench = resolve_security(sym).benchmark
        except Exception:
            bench = "^GSPC"
        counts[bench] = counts.get(bench, 0) + 1

    # If ^GSPC ties with a local benchmark, prefer the local one
    gspc_count = counts.get("^GSPC", 0)
    non_gspc = {b: c for b, c in counts.items() if b != "^GSPC"}
    if non_gspc:
        best_local, best_count = max(non_gspc.items(), key=lambda kv: kv[1])
        if best_count >= gspc_count:
            return best_local

    return max(counts, key=lambda b: counts[b])


def portfolio_market_framing(symbols: list[str]) -> dict:
    """
    # SEA-NATIVE-TICKER-FIX: Return market-context strings for IC briefing / PDF.

    Returns a dict with:
      benchmark        — canonical Yahoo symbol (e.g. "^VNINDEX")
      benchmark_label  — human-readable (e.g. "VN-Index")
      market_context   — short phrase for prompts (e.g. "Vietnam equity market (HOSE/HNX)")
      native_currency  — dominant portfolio currency
      is_sea           — True when the portfolio is primarily SEA-listed
    """
    bench = portfolio_dominant_benchmark(symbols)
    label = BENCHMARK_LABELS.get(bench, bench)

    _CONTEXT_MAP: dict[str, str] = {
        "^VNINDEX": "Vietnam equity market (HOSE/HNX)",
        "^VN30": "Vietnam large-cap equity market (VN30)",
        "^FTSE": "UK equity market (LSE)",
        "^JKSE": "Indonesia equity market (IDX)",
        "^SET.BK": "Thailand equity market (SET)",
        "^KLSE": "Malaysia equity market (Bursa)",
        "^STI": "Singapore equity market (SGX)",
        "^N225": "Japan equity market (TSE)",
        "^HSI": "Hong Kong equity market (HKEX)",
        "^NSEI": "India equity market (NSE)",
        "^AXJO": "Australia equity market (ASX)",
        "^GSPC": "US equity market (NYSE/NASDAQ)",
    }
    ctx = _CONTEXT_MAP.get(bench, f"Global equity market (benchmark: {bench})")

    _CCY_MAP: dict[str, str] = {
        "^VNINDEX": "VND",
        "^VN30": "VND",
        "^FTSE": "GBP",
        "^JKSE": "IDR",
        "^SET.BK": "THB",
        "^KLSE": "MYR",
        "^STI": "SGD",
        "^N225": "JPY",
        "^HSI": "HKD",
        "^NSEI": "INR",
        "^AXJO": "AUD",
        "^GSPC": "USD",
    }
    native_ccy = _CCY_MAP.get(bench, "USD")

    _SEA_BENCHES = {"^VNINDEX", "^VN30", "^JKSE", "^SET.BK", "^KLSE", "^STI"}
    is_sea = bench in _SEA_BENCHES

    return {
        "benchmark": bench,
        "benchmark_label": label,
        "market_context": ctx,
        "native_currency": native_ccy,
        "is_sea": is_sea,
    }


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
