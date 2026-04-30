from services.pdf_generator import compute_ic_readiness


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
