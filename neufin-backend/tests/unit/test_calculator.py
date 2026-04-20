"""Unit tests for services/calculator.py — portfolio metrics calculation."""

import inspect
from unittest.mock import AsyncMock, patch

import pytest

# ── Helpers ───────────────────────────────────────────────────────────────────

SAMPLE_POSITIONS = [
    {"symbol": "AAPL", "shares": 10},
    {"symbol": "MSFT", "shares": 5},
    {"symbol": "GOOGL", "shares": 3},
]

SAMPLE_POSITIONS_WITH_COST = [
    {"symbol": "AAPL", "shares": 10, "cost_basis": 150.0},
    {"symbol": "MSFT", "shares": 5, "cost_basis": 280.0},
    {"symbol": "GOOGL", "shares": 3, "cost_basis": 2800.0},
]

MOCK_PRICES = {
    "AAPL": 185.0,
    "MSFT": 415.0,
    "GOOGL": 175.0,
}


@pytest.fixture
def mock_prices():
    """Patch live price resolution with deterministic test prices."""
    from services import calculator as calc
    from services.market_cache import PriceResult

    patch_kwargs = {}
    if inspect.iscoroutinefunction(calc.get_price_with_fallback):
        patch_kwargs["new_callable"] = AsyncMock

    with patch("services.calculator.get_price_with_fallback", **patch_kwargs) as m:
        m.side_effect = lambda symbol, **kwargs: PriceResult(
            symbol=symbol,
            price={
                "AAPL": 189.50,
                "MSFT": 415.20,
                "GOOGL": 175.80,
                "NVDA": 875.40,
                "TSLA": 245.60,
                "SQ": 68.30,
            }.get(symbol, 100.0),
            status="live",
        )
        yield m


# ── HHI concentration ─────────────────────────────────────────────────────────


class TestHHI:
    def test_single_stock_hhi_is_one(self):
        """A portfolio with one stock has HHI = 1.0."""
        from services.calculator import _hhi

        assert _hhi([1.0]) == pytest.approx(1.0)

    def test_equal_weights_minimize_hhi(self):
        """N equal weights → HHI = 1/N."""
        from services.calculator import _hhi

        n = 10
        weights = [1 / n] * n
        assert _hhi(weights) == pytest.approx(1 / n)

    def test_hhi_between_zero_and_one(self):
        from services.calculator import _hhi

        weights = [0.5, 0.3, 0.2]
        result = _hhi(weights)
        assert 0.0 < result <= 1.0


# ── DNA score components ──────────────────────────────────────────────────────


class TestDNAScoreComponents:
    def test_hhi_score_max_for_perfect_diversification(self):
        """25 positions of equal weight → HHI score should approach 25."""
        from services.calculator import _score_hhi

        weights = [1 / 25] * 25
        score = _score_hhi(weights)
        assert score == pytest.approx(25, abs=2)

    def test_hhi_score_min_for_single_stock(self):
        from services.calculator import _score_hhi

        score = _score_hhi([1.0])
        assert score == pytest.approx(0, abs=2)

    def test_beta_score_optimal_near_one(self):
        """Portfolio beta of ~1.0 should score close to maximum (25 pts)."""
        from services.calculator import _score_beta

        score = _score_beta(1.0)
        assert score >= 20

    def test_beta_score_penalty_for_high_beta(self):
        from services.calculator import _score_beta

        score_high = _score_beta(2.0)
        score_optimal = _score_beta(1.0)
        assert score_high < score_optimal

    def test_beta_score_penalty_for_low_beta(self):
        from services.calculator import _score_beta

        score_low = _score_beta(0.2)
        score_optimal = _score_beta(1.0)
        assert score_low < score_optimal


# ── Price fetching ────────────────────────────────────────────────────────────


class TestPriceFetching:
    @patch("services.calculator._yfinance_batch")
    @patch("services.calculator._polygon_batch")
    def test_yahoo_fills_when_polygon_empty(self, mock_polygon, mock_yfinance):
        mock_polygon.return_value = {}
        mock_yfinance.return_value = {"HPG.VN": 22.4, "^FTSE": 7800.0}
        import services.calculator as calc
        from services.calculator import _fetch_prices_batch

        calc._BLACKLIST.clear()
        result = _fetch_prices_batch(["HPG.VN", "^FTSE"])
        mock_yfinance.assert_called()
        assert result["HPG.VN"] == pytest.approx(22.4)
        assert result["^FTSE"] == pytest.approx(7800.0)

    @patch("services.calculator._polygon_batch")
    def test_uses_polygon_first(self, mock_polygon):
        mock_polygon.return_value = {"AAPL": 185.0}
        # Clear any existing blacklist state
        import services.calculator as calc
        from services.calculator import _fetch_prices_batch

        calc._BLACKLIST.clear()
        result = _fetch_prices_batch(["AAPL"])
        assert "AAPL" in result

    def test_price_cache_prevents_duplicate_calls(self):
        """Cached prices should not trigger another network call."""
        import time

        import services.calculator as calc

        calc._PRICE_CACHE["TEST"] = (99.0, time.time())
        from services.calculator import _get_cached_price

        price = _get_cached_price("TEST")
        assert price == 99.0


# ── Integration-style unit test (mocked network) ─────────────────────────────


class TestCalculatePortfolioMetrics:
    @patch("services.calculator._fetch_beta")
    @patch("services.calculator._fetch_historical_returns")
    def test_returns_expected_keys(self, mock_hist, mock_beta, mock_prices):
        mock_beta.return_value = 1.1
        mock_hist.return_value = None  # correlation skipped if no history

        from services.calculator import calculate_portfolio_metrics

        result = calculate_portfolio_metrics(SAMPLE_POSITIONS)

        assert "total_value" in result
        assert "hhi" in result
        assert "weighted_beta" in result
        assert "positions" in result

    @patch("services.calculator._fetch_beta")
    @patch("services.calculator._fetch_historical_returns")
    def test_total_value_correct(self, mock_hist, mock_beta, mock_prices):
        mock_beta.return_value = 1.0
        mock_hist.return_value = None

        from services.calculator import calculate_portfolio_metrics

        result = calculate_portfolio_metrics(SAMPLE_POSITIONS)

        expected = 10 * 189.50 + 5 * 415.20 + 3 * 175.80
        assert result["total_value"] == pytest.approx(expected, rel=0.01)

    @patch("services.calculator._fetch_beta")
    @patch("services.calculator._fetch_historical_returns")
    def test_tax_alpha_present_with_cost_basis(self, mock_hist, mock_beta, mock_prices):
        mock_beta.return_value = 1.0
        mock_hist.return_value = None

        from services.calculator import calculate_portfolio_metrics

        result = calculate_portfolio_metrics(SAMPLE_POSITIONS_WITH_COST)

        assert "tax_alpha_score" in result

    @patch("services.calculator.compute_market_value")
    @patch("services.calculator._fetch_beta")
    @patch("services.calculator._fetch_historical_returns")
    @patch("services.calculator.get_price_with_fallback")
    def test_vn_position_includes_usd_market_value(
        self,
        mock_price,
        mock_hist,
        mock_beta,
        mock_market_value,
    ):
        from services.calculator import calculate_portfolio_metrics
        from services.market_cache import PriceResult

        mock_price.return_value = PriceResult(
            symbol="HPG.VN", price=25000.0, status="live"
        )
        mock_hist.return_value = None
        mock_beta.return_value = 1.0
        mock_market_value.return_value = {
            "ticker": "HPG.VN",
            "price_local": 25000.0,
            "fx_rate": 0.00004,
            "price_usd": 1.0,
            "market_value_usd": 100.0,
            "source": "twelvedata",
            "timestamp": "2026-04-21T00:00:00+00:00",
        }

        result = calculate_portfolio_metrics([{"symbol": "HPG.VN", "shares": 100}])

        assert result["positions"][0]["market_value_usd"] == pytest.approx(100.0)
        assert result["positions"][0]["data_unavailable"] is False
        assert result["positions"][0]["price_unavailable_message"] is None

    @patch("services.calculator.compute_market_value")
    @patch("services.calculator._fetch_beta")
    @patch("services.calculator._fetch_historical_returns")
    @patch("services.calculator.get_price_with_fallback")
    def test_all_vn_price_failures_return_degraded_metrics(
        self,
        mock_price,
        mock_hist,
        mock_beta,
        mock_market_value,
    ):
        from data_providers.ticker_normalizer import DataUnavailableError
        from services.calculator import calculate_portfolio_metrics
        from services.market_cache import PriceResult

        mock_price.return_value = PriceResult(
            symbol="HPG.VN",
            price=None,
            status="unresolvable",
            warning="HPG.VN could not be priced and was excluded from analysis.",
        )
        mock_hist.return_value = None
        mock_beta.return_value = 1.0
        mock_market_value.side_effect = DataUnavailableError(
            "Price unavailable for HPG.VN"
        )

        result = calculate_portfolio_metrics([{"symbol": "HPG.VN", "shares": 100}])

        position = result["positions"][0]
        assert result["total_value"] == 0.0
        assert result["failed_tickers"] == ["HPG.VN"]
        assert position["market_value_usd"] is None
        assert position["data_unavailable"] is True
        assert (
            position["price_unavailable_message"]
            == "Price data unavailable for HPG.VN. Upload confirmed prices or retry."
        )
