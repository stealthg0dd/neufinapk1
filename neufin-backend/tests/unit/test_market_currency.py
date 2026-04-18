"""Tests for services/market_currency.py."""

from services.market_currency import (
    finnhub_symbol,
    infer_native_currency,
    is_international_listed,
)


def test_infer_native_currency_vn_l_usd():
    assert infer_native_currency("HPG.VN") == "VND"
    assert infer_native_currency("BP.L") == "GBP"
    assert infer_native_currency("AAPL") == "USD"


def test_finnhub_symbol_preserves_regional_dots():
    assert finnhub_symbol("HPG.VN") == "HPG.VN"
    assert finnhub_symbol("BP.L") == "BP.L"
    assert finnhub_symbol("BRK.B") == "BRK-B"


def test_is_international_listed():
    assert is_international_listed("MBB.VN") is True
    assert is_international_listed("AAPL") is False
