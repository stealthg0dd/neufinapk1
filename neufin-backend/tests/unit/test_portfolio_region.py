from __future__ import annotations

from services.portfolio_region import (
    detect_region,
    dna_archetype_overlay,
    humanize_sea_flag,
    sea_macro_context,
)


def test_detect_region_vietnam_majority() -> None:
    profile = detect_region(["HPG.VN", "MBB.VN", "AAPL"])

    assert profile["primary_market"] == "VN"
    assert profile["benchmark_symbol"] == "^VNINDEX.VN"
    assert profile["benchmark_name"] == "VN-Index"
    assert profile["local_currency"] == "VND"
    assert "foreign_ownership_limit_risk" in profile["sea_specific_flags"]


def test_detect_region_mixed_sea() -> None:
    profile = detect_region(["HPG.VN", "DBS.SI", "BBCA.JK", "AAPL"])

    assert profile["primary_market"] == "ASEAN_MULTI"
    assert profile["benchmark_symbol"] == "MSCI SEA"
    assert profile["local_currency"] == "MULTI"


def test_detect_region_generic_for_non_sea() -> None:
    profile = detect_region(["AAPL", "MSFT", "SAP.DE"])

    assert profile["primary_market"] == "US/EU generic"
    assert profile["sea_specific_flags"] == []


def test_humanize_sea_flag() -> None:
    assert humanize_sea_flag("vietnam_securities_tax_0.1pct") == (
        "Vietnam securities transfer tax: 0.1%"
    )


def test_vn_macro_context_includes_required_feeds() -> None:
    profile = detect_region(["HPG.VN", "MBB.VN"])
    macro = sea_macro_context(profile)

    assert set(macro) == {"sbv_policy_rate", "vnd_neer", "hose_liquidity"}


def test_dna_archetype_overlay_for_vn_financials() -> None:
    investor_type = dna_archetype_overlay(
        [
            {"symbol": "MBB.VN", "weight": 0.35},
            {"symbol": "SSI.VN", "weight": 0.25},
            {"symbol": "HPG.VN", "weight": 0.40},
        ],
        "Conviction Growth",
    )

    assert investor_type == "Conviction Growth — Vietnam Financial Sector"
