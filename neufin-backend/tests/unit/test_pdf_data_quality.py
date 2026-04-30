from services.pdf_generator import (
    _compute_risk_metric_labels,
    _correlation_label,
    compute_ic_readiness,
    detect_structural_biases,
    get_defensive_alternatives,
)


def test_poor_price_quality_clamps_ic_readiness_to_draft():
    readiness = compute_ic_readiness(
        {
            "positions": [{"symbol": "VCI", "shares": 100}],
            "prices_fresh": True,
            "cost_basis_provided": True,
            "benchmark_set": True,
            "swarm_available": True,
            "data_quality": {
                "data_quality": "POOR",
                "weights_suspicious": False,
            },
        }
    )

    assert readiness["tier"] == "DRAFT"
    assert any(flag["item"] == "Price resolution" for flag in readiness["flags"])


def test_risk_metric_fallbacks_compute_var_and_sharpe_proxy():
    labels = _compute_risk_metric_labels(
        {
            "total_value": 1_000_000,
            "weighted_beta": 1.1,
            "region_profile": {"primary_market": "VN"},
            "regime_label": "Market-Neutral",
        },
        {},
        {},
        [],
    )

    assert "beta-estimated" in labels["var"][0]
    assert "VN vol 1.8%" in labels["var"][0]
    assert "beta-estimated" in labels["var_99"][0]
    assert "10-day horizon" in labels["var_10"][0]
    assert "CAPM proxy" in labels["sharpe"][0]


def test_missing_correlation_is_unknown_not_zero():
    label, status = _correlation_label(
        {"avg_corr": None, "correlation_status": "UNKNOWN"}
    )

    assert label == "Not computed (insufficient price history)"
    assert status == "UNKNOWN"


def test_equal_weight_portfolio_does_not_trigger_overweight_bias():
    biases = detect_structural_biases(
        [
            {"symbol": "AAA", "weight": 1 / 3},
            {"symbol": "BBB", "weight": 1 / 3},
            {"symbol": "CCC", "weight": 1 / 3},
        ],
        "VN",
    )

    names = [bias["name"] for bias in biases]
    assert "Equal-Weight Portfolio Detected" in names
    assert "Conviction Overweight" not in names


def test_vn_defensive_alternatives_are_vn_native():
    defensive = get_defensive_alternatives("VN")

    assert defensive["weight_label"] == "Defensive (VGBs/VCB.VN/GAS.VN)"
    assert "VCB.VN" in defensive["rotation_text"]
    assert "XLU" not in defensive["rotation_text"]
    assert defensive["qualitative_scenarios"][0][1] == "VN-Index -35% (2022)"
