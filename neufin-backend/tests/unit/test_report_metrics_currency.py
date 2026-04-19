"""Canonical portfolio headlines must not mis-count unpriced rows as zero value."""

import pytest

from services.report_metrics import canonical_portfolio_headlines


def test_unresolvable_position_does_not_inflate_aum_via_zero_price():
    positions = [
        {
            "symbol": "HPG.VN",
            "shares": 100,
            "value": 0,
            "price": 0,
            "price_status": "unresolvable",
        }
    ]
    out = canonical_portfolio_headlines(
        {"total_value": 5000.0},
        {},
        {},
        positions,
    )
    # No valid marks → fall back to stored total
    assert out["total_value"] == 5000.0


def test_native_price_used_when_present():
    positions = [
        {
            "symbol": "HPG.VN",
            "shares": 10,
            "native_price": 25.5,
            "native_currency": "VND",
        }
    ]
    out = canonical_portfolio_headlines({}, {}, {}, positions)
    assert out["total_value"] == pytest.approx(255.0)


def test_value_column_wins_over_reconstruction():
    positions = [
        {
            "symbol": "VCI.VN",
            "shares": 100,
            "value": 1_500_000.0,
            "native_price": 15000.0,
        }
    ]
    out = canonical_portfolio_headlines({}, {}, {}, positions)
    assert out["total_value"] == pytest.approx(1_500_000.0)
