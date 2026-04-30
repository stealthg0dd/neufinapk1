from services.pdf_generator import (
    _build_execution_actions,
    _compute_impact_table,
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


def test_equal_weight_execution_actions_resolve_price_data_first():
    actions = _build_execution_actions(
        [
            {"symbol": "VCI", "weight": 1 / 3},
            {"symbol": "HPG", "weight": 1 / 3},
            {"symbol": "MBB", "weight": 1 / 3},
        ],
        1_000_000,
    )

    assert len(actions) == 1
    assert actions[0]["action_type"] == "RESOLVE PRICE DATA FIRST"
    assert actions[0]["is_data_quality_action"] is True
    assert "VCI.VN" in actions[0]["summary"]


def test_execution_action_uses_hhi_target_and_skips_near_optimal_positions():
    actions = _build_execution_actions(
        [
            {"symbol": "VCI.VN", "weight": 0.40, "current_price": 25.0},
            {"symbol": "HPG.VN", "weight": 0.20, "current_price": 20.0},
            {"symbol": "MBB.VN", "weight": 0.15, "current_price": 15.0},
            {"symbol": "VCB.VN", "weight": 0.15, "current_price": 30.0},
            {"symbol": "GAS.VN", "weight": 0.10, "current_price": 35.0},
        ],
        1_000_000,
    )

    assert actions[0]["ticker"] == "VCI.VN"
    assert actions[0]["target_weight_pct"] == 35.0
    assert "HHI-optimal" in actions[0]["optimization_rationale"]
    assert all(action["ticker"] != "GAS.VN" for action in actions)


def test_impact_table_returns_before_after_rows():
    rows = _compute_impact_table(
        {
            "hhi": 0.245,
            "weighted_beta": 1.1,
            "total_value": 1_000_000,
            "regime_label": "Risk-Off",
            "churn_risk_score": 70,
            "churn_risk_level": "HIGH",
            "region_profile": {"primary_market": "VN"},
            "positions": [
                {"symbol": "VCI.VN", "weight": 0.42},
                {"symbol": "HPG.VN", "weight": 0.25},
                {"symbol": "MBB.VN", "weight": 0.18},
                {"symbol": "GAS.VN", "weight": 0.15},
            ],
        },
        [],
    )

    metrics = [row[0] for row in rows]
    assert "HHI Concentration" in metrics
    assert "VaR (95%, 1-day)" in metrics
    assert ("Churn Risk", "HIGH", "MEDIUM", "↓ Better") in rows
