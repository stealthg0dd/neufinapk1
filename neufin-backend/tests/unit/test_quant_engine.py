from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from services import quant_model_engine


@pytest.mark.asyncio
async def test_analyze_financial_modes_returns_composite_payload(monkeypatch):
    async def fake_build_risk(symbols, weights):
        return (
            {
                "avg_pairwise_correlation": 0.22,
                "diversification_index": 4.2,
            },
            None,
        )

    async def fake_alpha(symbols, weights, risk_report):
        return (
            {
                "alpha_score": 71.5,
                "model_scores": {
                    "xgboost_cross_sectional_factor_scoring": 74.0,
                    "gnn_relational_signal": 69.0,
                    "nlp_sentiment_score": 71.5,
                },
            },
            [],
        )

    async def fake_risk(symbols, weights, risk_report):
        return (
            {
                "risk_adjusted_metrics": {
                    "sharpe": 1.2,
                    "sortino": 1.4,
                    "max_drawdown": 0.16,
                    "volatility": 0.24,
                    "sharpe_proxy": 1.2,
                    "volatility_annualized_proxy": 0.24,
                    "max_drawdown_proxy": 0.16,
                },
                "model_scores": {
                    "multi_factor_correlation": 77.0,
                    "stress_tester": 68.0,
                    "concentration_hhi": 72.0,
                },
                "stress": {"scenarios_sampled": 3, "weakest_impacts": []},
            },
            [],
        )

    async def fake_forecast(positions):
        return (
            {
                "forecast_outputs": {
                    "price_direction": "up",
                    "price_direction_confidence": 63.0,
                    "volatility_forecast": 0.21,
                },
                "model_scores": {"lstm_style_temporal_analysis": 63.0},
            },
            [],
        )

    async def fake_macro():
        return (
            {
                "regime_context": {
                    "current_regime": "risk_on",
                    "label": "risk_on",
                    "confidence": 0.64,
                    "positioning_recommendation": "Add cyclical risk selectively.",
                },
                "model_scores": {
                    "regime_detector": 64.0,
                    "macro_watcher": 64.0,
                },
            },
            [],
        )

    monkeypatch.setattr(quant_model_engine, "_build_risk_report", fake_build_risk)
    monkeypatch.setattr(quant_model_engine, "_run_alpha_mode", fake_alpha)
    monkeypatch.setattr(quant_model_engine, "_run_risk_mode", fake_risk)
    monkeypatch.setattr(quant_model_engine, "_run_forecast_mode", fake_forecast)
    monkeypatch.setattr(quant_model_engine, "_run_macro_mode", fake_macro)

    result = await quant_model_engine.analyze_financial_modes(
        "portfolio-1",
        [
            {"symbol": "AAPL", "weight_pct": 60},
            {"symbol": "MSFT", "weight_pct": 40},
        ],
        ["institutional"],
    )

    assert result["alpha_score"] == 71.5
    assert result["risk_adjusted_metrics"]["sharpe"] == 1.2
    assert result["forecast_outputs"]["price_direction"] == "up"
    assert result["forecast"]["price_direction_confidence"] == 63.0
    assert result["regime_context"]["current_regime"] == "risk_on"
    assert "institutional_ensemble" in result["model_contribution"]
    assert result["model_contribution"] == result["model_contribution_breakdown"]
    assert isinstance(result["composite_dna_modifier"], float)


@pytest.mark.asyncio
async def test_analyze_financial_modes_skips_when_modes_empty():
    result = await quant_model_engine.analyze_financial_modes(
        "portfolio-1",
        [{"symbol": "AAPL", "weight_pct": 100}],
        [],
    )
    assert result == {}


@pytest.mark.asyncio
async def test_run_models_accepts_portfolio_dict(monkeypatch):
    captured: dict[str, object] = {}

    async def fake_analyze(portfolio_id, positions, modes):
        captured["portfolio_id"] = portfolio_id
        captured["positions"] = positions
        captured["modes"] = modes
        return {"alpha_score": 55.0}

    monkeypatch.setattr(quant_model_engine, "analyze_financial_modes", fake_analyze)

    result = await quant_model_engine.run_models(
        {
            "id": "portfolio-42",
            "positions": [{"symbol": "AAPL", "weight_pct": 100}],
        },
        ["alpha"],
    )

    assert result == {"alpha_score": 55.0}
    assert captured == {
        "portfolio_id": "portfolio-42",
        "positions": [{"symbol": "AAPL", "weight_pct": 100}],
        "modes": ["alpha"],
    }


@pytest.fixture
def client():
    with patch("database.create_client") as mock_supabase:
        mock_supabase.return_value = MagicMock()
        from main import app
        from routers.quant import get_current_user

        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            id="user-1",
            email="admin@neufin.ai",
        )
        try:
            with TestClient(app) as c:
                yield c
        finally:
            app.dependency_overrides.clear()


def test_quant_route_skips_when_no_modes(client):
    with patch("routers.quant.supabase") as mock_supabase:
        response = client.post(
            "/api/quant/analyze",
            json={
                "portfolio_id": "portfolio-1",
                "financial_modes": [],
                "positions": [],
            },
        )

    assert response.status_code == 200
    assert response.json()["skipped"] is True
    mock_supabase.table.assert_not_called()
