from __future__ import annotations

from collections import Counter
from typing import List, TypedDict  # noqa: UP035 - RegionProfile contract requested


class RegionProfile(TypedDict):
    primary_market: str
    benchmark_symbol: str
    benchmark_name: str
    reporting_currency: str
    local_currency: str
    tax_jurisdiction: str
    sea_specific_flags: List[str]  # noqa: UP006 - RegionProfile contract requested


SEA_SUFFIX_PROFILES: dict[str, RegionProfile] = {
    ".VN": {
        "primary_market": "VN",
        "benchmark_symbol": "^VNINDEX.VN",
        "benchmark_name": "VN-Index",
        "reporting_currency": "USD",
        "local_currency": "VND",
        "tax_jurisdiction": "VN",
        "sea_specific_flags": [
            "foreign_ownership_limit_risk",
            "vnd_liquidity_premium",
            "vietnam_securities_tax_0.1pct",
        ],
    },
    ".SI": {
        "primary_market": "SG",
        "benchmark_symbol": "^STI",
        "benchmark_name": "STI",
        "reporting_currency": "USD",
        "local_currency": "SGD",
        "tax_jurisdiction": "sg",
        "sea_specific_flags": [
            "sgd_rate_sensitivity",
            "singapore_reit_rate_risk",
            "mas_policy_band_fx_risk",
        ],
    },
    ".JK": {
        "primary_market": "ID",
        "benchmark_symbol": "^JKSE",
        "benchmark_name": "JCI",
        "reporting_currency": "USD",
        "local_currency": "IDR",
        "tax_jurisdiction": "ID",
        "sea_specific_flags": [
            "idr_fx_volatility",
            "foreign_flow_reversal_risk",
        ],
    },
    ".BK": {
        "primary_market": "TH",
        "benchmark_symbol": "^SET.BK",
        "benchmark_name": "SET",
        "reporting_currency": "USD",
        "local_currency": "THB",
        "tax_jurisdiction": "TH",
        "sea_specific_flags": [
            "thb_fx_volatility",
            "tourism_cycle_sensitivity",
        ],
    },
    ".KL": {
        "primary_market": "MY",
        "benchmark_symbol": "^KLSE",
        "benchmark_name": "FBMKLCI",
        "reporting_currency": "USD",
        "local_currency": "MYR",
        "tax_jurisdiction": "MY",
        "sea_specific_flags": [
            "myr_fx_volatility",
            "commodity_cycle_sensitivity",
        ],
    },
    ".PS": {
        "primary_market": "PH",
        "benchmark_symbol": "PSEI.PS",
        "benchmark_name": "PSEI",
        "reporting_currency": "USD",
        "local_currency": "PHP",
        "tax_jurisdiction": "PH",
        "sea_specific_flags": [
            "php_fx_volatility",
            "foreign_flow_reversal_risk",
        ],
    },
}

GENERIC_REGION_PROFILE: RegionProfile = {
    "primary_market": "US/EU generic",
    "benchmark_symbol": "^GSPC",
    "benchmark_name": "S&P 500",
    "reporting_currency": "USD",
    "local_currency": "USD",
    "tax_jurisdiction": "US/EU generic",
    "sea_specific_flags": [],
}

MIXED_SEA_PROFILE: RegionProfile = {
    "primary_market": "ASEAN_MULTI",
    "benchmark_symbol": "MSCI SEA",
    "benchmark_name": "MSCI SEA",
    "reporting_currency": "USD",
    "local_currency": "MULTI",
    "tax_jurisdiction": "ASEAN_MULTI",
    "sea_specific_flags": [
        "multi_currency_fx_translation_risk",
        "foreign_flow_reversal_risk",
        "cross_market_liquidity_fragmentation",
    ],
}

_VN_FINANCIAL_TICKERS = {
    "ACB.VN",
    "BID.VN",
    "CTG.VN",
    "EIB.VN",
    "HDB.VN",
    "MBB.VN",
    "MSB.VN",
    "SHB.VN",
    "SSI.VN",
    "STB.VN",
    "TCB.VN",
    "VCB.VN",
    "VCI.VN",
    "VIB.VN",
    "VPB.VN",
}
_VN_GROWTH_TICKERS = {
    "FPT.VN",
    "MWG.VN",
    "PNJ.VN",
    "VHM.VN",
    "VIC.VN",
    "VRE.VN",
}


def _symbol_suffix(symbol: str) -> str | None:
    upper = (symbol or "").strip().upper()
    return next(
        (suffix for suffix in SEA_SUFFIX_PROFILES if upper.endswith(suffix)), None
    )


def detect_region(tickers: List[str]) -> RegionProfile:  # noqa: UP006 - requested API
    clean = [
        (ticker or "").strip().upper()
        for ticker in tickers
        if str(ticker or "").strip()
    ]
    if not clean:
        return dict(GENERIC_REGION_PROFILE)

    suffix_counts = Counter(
        suffix for ticker in clean if (suffix := _symbol_suffix(ticker))
    )
    sea_count = sum(suffix_counts.values())
    total = len(clean)

    if sea_count == 0:
        return dict(GENERIC_REGION_PROFILE)

    top_suffix, top_count = suffix_counts.most_common(1)[0]
    if top_count / total > 0.5:
        return dict(SEA_SUFFIX_PROFILES[top_suffix])

    profile = dict(MIXED_SEA_PROFILE)
    flags: list[str] = []
    for suffix in sorted(suffix_counts):
        flags.extend(SEA_SUFFIX_PROFILES[suffix]["sea_specific_flags"][:1])
    profile["sea_specific_flags"] = list(
        dict.fromkeys([*profile["sea_specific_flags"], *flags])
    )
    return profile


def is_sea_region(profile: RegionProfile | dict | None) -> bool:
    return bool(profile and profile.get("primary_market") != "US/EU generic")


def humanize_sea_flag(flag: str) -> str:
    labels = {
        "foreign_ownership_limit_risk": "Foreign ownership limit risk",
        "vnd_liquidity_premium": "VND liquidity premium",
        "vietnam_securities_tax_0.1pct": "Vietnam securities transfer tax: 0.1%",
        "sgd_rate_sensitivity": "SGD rate sensitivity",
        "singapore_reit_rate_risk": "Singapore REIT rate risk",
        "mas_policy_band_fx_risk": "MAS policy-band FX risk",
        "idr_fx_volatility": "IDR FX volatility",
        "thb_fx_volatility": "THB FX volatility",
        "myr_fx_volatility": "MYR FX volatility",
        "php_fx_volatility": "PHP FX volatility",
        "foreign_flow_reversal_risk": "Foreign-flow reversal risk",
        "tourism_cycle_sensitivity": "Tourism cycle sensitivity",
        "commodity_cycle_sensitivity": "Commodity cycle sensitivity",
        "multi_currency_fx_translation_risk": "Multi-currency FX translation risk",
        "cross_market_liquidity_fragmentation": "Cross-market liquidity fragmentation",
    }
    return labels.get(flag, flag.replace("_", " ").title())


def sea_macro_context(profile: RegionProfile | dict | None) -> dict:
    if not profile or profile.get("primary_market") != "VN":
        return {}
    return {
        "sbv_policy_rate": {
            "label": "State Bank of Vietnam policy/refinancing rate",
            "value": None,
            "source": "SBV",
            "note": "Populate from SBV feed when available; included with FRED context for VN portfolios.",
        },
        "vnd_neer": {
            "label": "VND nominal effective exchange rate",
            "value": None,
            "source": "BIS/SBV",
            "note": "Track VND trade-weighted pressure alongside USD/VND spot.",
        },
        "hose_liquidity": {
            "label": "Ho Chi Minh Stock Exchange liquidity",
            "value": None,
            "source": "HOSE",
            "note": "Use turnover and foreign net flow when a market-data feed is configured.",
        },
    }


def dna_archetype_overlay(positions: list[dict], base_name: str) -> str:
    if not positions:
        return base_name
    symbols = [str(p.get("symbol") or "").strip().upper() for p in positions]
    profile = detect_region(symbols)
    if profile["primary_market"] != "VN":
        return base_name

    financial_weight = 0.0
    growth_weight = 0.0
    total_weight = 0.0
    for position in positions:
        sym = str(position.get("symbol") or "").strip().upper()
        try:
            weight = float(position.get("weight") or position.get("weight_pct") or 0)
        except (TypeError, ValueError):
            weight = 0.0
        if weight > 1:
            weight /= 100
        if weight <= 0:
            weight = 1 / max(len(positions), 1)
        total_weight += weight
        sector = str(position.get("sector") or position.get("industry") or "").lower()
        if sym in _VN_FINANCIAL_TICKERS or "bank" in sector or "financial" in sector:
            financial_weight += weight
        if sym in _VN_GROWTH_TICKERS or "technology" in sector or "consumer" in sector:
            growth_weight += weight

    if total_weight > 0 and financial_weight / total_weight >= 0.45:
        suffix = "Vietnam Financial Sector"
    elif total_weight > 0 and growth_weight / total_weight >= 0.35:
        suffix = "Vietnam Growth Tilt"
    else:
        suffix = "Vietnam Growth Tilt"
    return base_name if suffix in base_name else f"{base_name} — {suffix}"
