"""Unit tests for indicative FX helpers (display-only)."""

from unittest.mock import patch

import pytest

from core.config import settings
from services.fx_format import (
    format_pdf_market_value_cell,
    get_cross_rate,
    indicative_sgd_suffix,
)


def test_get_cross_rate_identity() -> None:
    assert get_cross_rate("USD", "USD") == 1.0


@patch("services.fx_format.requests.get")
def test_get_cross_rate_fetches(mock_get, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "FX_DISPLAY_ENABLE", True)
    import services.fx_format as fx

    fx._rate_cache.clear()
    mock_get.return_value.json.return_value = {"success": True, "rates": {"SGD": 1.35}}
    mock_get.return_value.status_code = 200
    r = get_cross_rate("USD", "SGD")
    assert r == pytest.approx(1.35)
    r2 = get_cross_rate("USD", "SGD")
    assert r2 == pytest.approx(1.35)
    assert mock_get.call_count == 1


def test_fx_display_disabled_no_indicative(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "FX_DISPLAY_ENABLE", False)
    assert indicative_sgd_suffix(1_000_000, "VND") is None


def test_indicative_sgd_uses_rate(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "FX_DISPLAY_ENABLE", True)
    with patch("services.fx_format.get_cross_rate", return_value=5e-5):
        s = indicative_sgd_suffix(10_000_000, "VND")
    assert s is not None
    assert "S$" in s


def test_format_pdf_market_value_usd(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "FX_DISPLAY_ENABLE", True)
    cell = format_pdf_market_value_cell(
        {"symbol": "AAPL", "value": 10000, "native_currency": "USD"}
    )
    assert cell.startswith("$")


def test_format_pdf_market_value_vn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "FX_DISPLAY_ENABLE", False)
    cell = format_pdf_market_value_cell(
        {"symbol": "HPG.VN", "value": 1_000_000, "native_currency": "VND"}
    )
    assert "VND" in cell
