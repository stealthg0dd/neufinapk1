from __future__ import annotations

import math
import types

import pandas as pd
import pytest

from data_providers import ticker_normalizer
from data_providers.ticker_normalizer import (
    DataUnavailableError,
    compute_market_value,
    get_fx_rate,
    normalize_sea_ticker,
)


def test_normalize_vn_stock_for_twelvedata() -> None:
    symbol, params, api = normalize_sea_ticker("HPG.VN")

    assert symbol == "HPG"
    assert api == "twelvedata"
    assert params == {
        "symbol": "HPG",
        "exchange": "HOSE",
        "country": "Vietnam",
    }


def test_normalize_vn_index_for_twelvedata() -> None:
    symbol, params, api = normalize_sea_ticker("^VNINDEX", is_index=True)

    assert symbol == "VNINDEX"
    assert api == "twelvedata"
    assert params == {"symbol": "VNINDEX", "country": "Vietnam"}


def test_normalize_vn_index_for_yahoo_fallback() -> None:
    symbol, params, api = normalize_sea_ticker(
        "^VNINDEX",
        api_preference="yahoo",
        is_index=True,
    )

    assert symbol == "^VNINDEX.VN"
    assert api == "yahoo"
    assert params == {"symbol": "^VNINDEX.VN"}


def test_get_fx_rate_uses_twelvedata_then_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ticker_normalizer._FX_CACHE.clear()
    monkeypatch.setattr(ticker_normalizer.settings, "TWELVEDATA_API_KEY", "td-key")
    monkeypatch.setattr(ticker_normalizer.settings, "ALPHA_VANTAGE_API_KEY", "av-key")

    class Response:
        status_code = 200

        @staticmethod
        def json() -> dict[str, str]:
            return {"price": "0.00004"}

    calls: list[dict] = []

    def fake_get(url: str, params: dict, timeout: float) -> Response:
        calls.append({"url": url, "params": params, "timeout": timeout})
        return Response()

    monkeypatch.setattr(ticker_normalizer.requests, "get", fake_get)

    assert get_fx_rate("VND", "USD") == 0.00004
    assert get_fx_rate("VND", "USD") == 0.00004
    assert len(calls) == 1
    assert calls[0]["params"]["symbol"] == "VND/USD"


def test_get_fx_rate_raises_without_live_or_cached_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ticker_normalizer._FX_CACHE.clear()
    monkeypatch.setattr(ticker_normalizer.settings, "TWELVEDATA_API_KEY", None)
    monkeypatch.setattr(ticker_normalizer.settings, "ALPHA_VANTAGE_API_KEY", None)

    with pytest.raises(DataUnavailableError):
        get_fx_rate("VND", "USD")


def test_get_fx_rate_inverts_provider_quote(monkeypatch: pytest.MonkeyPatch) -> None:
    ticker_normalizer._FX_CACHE.clear()
    monkeypatch.setattr(ticker_normalizer.settings, "TWELVEDATA_API_KEY", "td-key")
    monkeypatch.setattr(ticker_normalizer.settings, "ALPHA_VANTAGE_API_KEY", None)

    class Response:
        status_code = 200

        def __init__(self, payload: dict[str, str]) -> None:
            self.payload = payload

        def json(self) -> dict[str, str]:
            return self.payload

    def fake_get(url: str, params: dict, timeout: float) -> Response:
        if params["symbol"] == "VND/USD":
            return Response({"status": "error", "message": "unsupported pair"})
        assert params["symbol"] == "USD/VND"
        return Response({"price": "25000"})

    monkeypatch.setattr(ticker_normalizer.requests, "get", fake_get)

    assert get_fx_rate("VND", "USD") == pytest.approx(0.00004)


def test_compute_market_value_uses_local_price_and_fx(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_td_price(symbol: str) -> tuple[float, str]:
        assert symbol == "HPG.VN"
        return 25000.0, "twelvedata"

    monkeypatch.setattr(ticker_normalizer, "_fetch_twelvedata_price", fake_td_price)
    monkeypatch.setattr(ticker_normalizer, "_fetch_yahoo_price", lambda _: None)
    monkeypatch.setattr(ticker_normalizer, "get_fx_rate", lambda base, quote: 0.00004)

    payload = compute_market_value("HPG.VN", 100)

    assert payload["ticker"] == "HPG.VN"
    assert payload["price_local"] == 25000.0
    assert payload["fx_rate"] == 0.00004
    assert payload["price_usd"] == 1.0
    assert payload["market_value_usd"] == 100.0
    assert payload["source"] == "twelvedata"


def test_compute_market_value_raises_when_price_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(ticker_normalizer, "_fetch_twelvedata_price", lambda _: None)
    monkeypatch.setattr(ticker_normalizer, "_fetch_yahoo_price", lambda _: None)

    with pytest.raises(DataUnavailableError):
        compute_market_value("HPG.VN", 100)


def test_compute_market_value_falls_back_to_yahoo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(ticker_normalizer, "_fetch_twelvedata_price", lambda _: None)
    monkeypatch.setattr(ticker_normalizer, "get_fx_rate", lambda base, quote: 0.00004)

    class Ticker:
        def __init__(self, symbol: str) -> None:
            assert symbol == "HPG.VN"

        @staticmethod
        def history(period: str, auto_adjust: bool) -> pd.DataFrame:
            assert period == "5d"
            assert auto_adjust is True
            return pd.DataFrame({"Close": [math.nan, 26000.0]})

    monkeypatch.setitem(
        __import__("sys").modules, "yfinance", types.SimpleNamespace(Ticker=Ticker)
    )

    payload = compute_market_value("HPG.VN", 10)

    assert payload["source"] == "yahoo"
    assert payload["market_value_usd"] == pytest.approx(10.4)
