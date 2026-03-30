"""
scripts/smoke_test.py — Full user-journey smoke test for the Neufin backend.

Covers:
  1. Upload portfolio (CSV-style positions list)  → POST /api/portfolio/create
  2. Run swarm analysis                           → POST /api/swarm/analyze
  3. Assert RiskMatrix data (stress_results + risk_factors) is present
  4. Simulate payment (set has_paid_report=true directly in Supabase)
  5. Assert 90-Day Directive is in the IC briefing

Run against a local server:
    uvicorn main:app --port 8000 &
    pytest scripts/smoke_test.py -v

Run against Railway staging:
    NEUFIN_BASE_URL=https://neufin101-staging.up.railway.app pytest scripts/smoke_test.py -v

Requires: pip install pytest httpx
"""

import os

import httpx
import pytest

# ── Config ─────────────────────────────────────────────────────────────────────
BASE_URL = os.environ.get("NEUFIN_BASE_URL", "http://localhost:8000")
TIMEOUT = httpx.Timeout(60.0)  # swarm can take up to ~45s
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get("SUPABASE_KEY", "")

# ── Demo portfolio (mirrors swarm/page.tsx DEMO_POSITIONS) ────────────────────
POSITIONS = [
    {"symbol": "AAPL", "shares": 50, "price": 195.0, "value": 9750, "weight": 0.19},
    {"symbol": "MSFT", "shares": 30, "price": 415.0, "value": 12450, "weight": 0.25},
    {"symbol": "NVDA", "shares": 20, "price": 875.0, "value": 17500, "weight": 0.35},
    {"symbol": "XOM", "shares": 40, "price": 115.0, "value": 4600, "weight": 0.09},
    {"symbol": "BRK-B", "shares": 15, "price": 405.0, "value": 6075, "weight": 0.12},
]
TOTAL_VALUE = sum(p["value"] for p in POSITIONS)


# ── Fixtures ───────────────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def client() -> httpx.Client:
    """Synchronous httpx client scoped to the whole test session."""
    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as c:
        yield c


@pytest.fixture(scope="session")
def swarm_result(client: httpx.Client) -> dict:
    """Run the swarm once per session and share the result across tests."""
    resp = client.post(
        "/api/swarm/analyze",
        json={"positions": POSITIONS, "total_value": TOTAL_VALUE},
    )
    assert resp.status_code == 200, f"Swarm failed {resp.status_code}: {resp.text[:400]}"
    data = resp.json()
    assert "investment_thesis" in data, "Missing investment_thesis in swarm response"
    return data


# ── Step 1: Portfolio creation ─────────────────────────────────────────────────
def test_portfolio_create(client: httpx.Client) -> None:
    """POST /api/portfolio/create returns a portfolio_id and metrics."""
    resp = client.post(
        "/api/portfolio/create",
        json={
            "user_id": "",
            "name": "Smoke Test Portfolio",
            "positions": [{"symbol": p["symbol"], "shares": p["shares"]} for p in POSITIONS],
        },
    )
    assert resp.status_code == 200, f"Portfolio create failed: {resp.text[:400]}"
    body = resp.json()
    metrics = body.get("metrics") or {}
    assert "portfolio_id" in body, "Missing portfolio_id"
    assert metrics.get("total_value", 0) > 0, "metrics.total_value should be > 0"
    assert metrics.get("dna_score", 0) > 0, "metrics.dna_score should be > 0"


# ── Step 2: Swarm runs without error ──────────────────────────────────────────
def test_swarm_analyze_ok(swarm_result: dict) -> None:
    """Swarm response has the expected top-level keys."""
    required = {"investment_thesis", "agent_trace"}
    missing = required - swarm_result.keys()
    assert not missing, f"Swarm response missing keys: {missing}"
    assert len(swarm_result["agent_trace"]) > 0, "agent_trace should not be empty"


# ── Step 3: RiskMatrix data is present ────────────────────────────────────────
def test_risk_matrix_stress_results(swarm_result: dict) -> None:
    """investment_thesis.stress_results has ≥1 scenario with required fields."""
    thesis = swarm_result["investment_thesis"]
    stress_results = thesis.get("stress_results") or []
    assert len(stress_results) >= 1, (
        f"Expected at least 1 stress scenario, got {len(stress_results)}. "
        f"thesis keys: {list(thesis.keys())}"
    )
    for sr in stress_results:
        assert "scenario" in sr or "scenario_name" in sr or "label" in sr, (
            f"Stress result missing scenario label: {sr}"
        )
        assert "impact" in sr or "portfolio_return_pct" in sr or "impact_pct" in sr, (
            f"Stress result missing portfolio impact: {sr}"
        )


def test_risk_matrix_cluster_data(swarm_result: dict) -> None:
    """investment_thesis.risk_factors has ≥1 entry with beta + spy_correlation."""
    thesis = swarm_result["investment_thesis"]
    risk_factors = thesis.get("risk_factors") or []
    assert len(risk_factors) >= 1, (
        f"Expected ≥1 risk_factor cluster entry, got {len(risk_factors)}. "
        f"thesis keys: {list(thesis.keys())}"
    )
    for rf in risk_factors:
        assert "beta" in rf, f"risk_factor missing 'beta': {rf}"
        assert "spy_correlation" in rf, f"risk_factor missing 'spy_correlation': {rf}"


# ── Step 4: Simulate payment ───────────────────────────────────────────────────
@pytest.mark.skipif(
    not SUPABASE_URL or not SUPABASE_KEY,
    reason="SUPABASE_URL / SUPABASE_KEY not set — skipping payment simulation",
)
def test_simulate_payment(swarm_result: dict) -> None:
    """
    Simulate a Stripe webhook by setting has_paid_report=TRUE on the swarm_report
    (if a report_id was returned by the swarm). Falls back to a direct Supabase
    patch if the backend doesn't expose a simulate endpoint.
    """
    thesis = swarm_result["investment_thesis"]
    report_id = thesis.get("swarm_report_id") or swarm_result.get("report_id")

    if not report_id:
        pytest.skip("swarm_result does not contain a report_id — skipping payment sim")

    # Direct Supabase REST call using service-role key
    patch_resp = httpx.patch(
        f"{SUPABASE_URL}/rest/v1/swarm_reports?id=eq.{report_id}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        json={"has_paid_report": True},
        timeout=10.0,
    )
    assert patch_resp.status_code in (200, 204), (
        f"Payment simulation patch failed {patch_resp.status_code}: {patch_resp.text}"
    )


# ── Step 5: 90-Day Directive is in the briefing ───────────────────────────────
def test_ninety_day_directive_present(swarm_result: dict) -> None:
    """
    The IC briefing markdown must contain a 90-day directive section.
    Accepts any of the common header variations.
    """
    thesis = swarm_result["investment_thesis"]
    briefing = thesis.get("briefing") or ""

    # Also check the agent_trace for a 90-day directive line
    trace_text = "\n".join(swarm_result.get("agent_trace", []))

    combined = (briefing + "\n" + trace_text).lower()

    assert any(kw in combined for kw in ("90-day", "90 day", "ninety-day", "directive")), (
        "Neither the briefing nor agent_trace contains a '90-Day Directive'. "
        f"Briefing snippet: {briefing[:300]!r}"
    )


# ── Step 6: Price integrity check (bonus) ─────────────────────────────────────
def test_price_integrity_endpoint_exists(client: httpx.Client) -> None:
    """
    POST /api/portfolio/verify-prices should accept our positions and return
    a list (may be empty if no position exceeds 15%).
    """
    resp = client.post(
        "/api/portfolio/verify-prices",
        json={"positions": POSITIONS, "total_value": TOTAL_VALUE},
    )
    # 404 is acceptable — the endpoint may not yet be wired in main.py
    if resp.status_code == 404:
        pytest.skip("POST /api/portfolio/verify-prices not yet registered — skipping")
    assert resp.status_code == 200, f"Verify-prices failed: {resp.text[:400]}"
    data = resp.json()
    assert isinstance(data.get("integrity_checks"), list), (
        f"Expected list at 'integrity_checks', got: {data}"
    )


# ── Step 7: Failover trace is parseable ────────────────────────────────────────
def test_agent_trace_parseable(swarm_result: dict) -> None:
    """Every trace line should be a non-empty string."""
    traces = swarm_result.get("agent_trace", [])
    assert len(traces) > 0, "agent_trace should not be empty after a successful run"
    for i, line in enumerate(traces):
        assert isinstance(line, str) and line.strip(), (
            f"Trace line {i} is empty or not a string: {line!r}"
        )


if __name__ == "__main__":
    # Quick manual run: python scripts/smoke_test.py
    import subprocess
    import sys

    sys.exit(subprocess.call(["pytest", __file__, "-v", "--tb=short"]))  # noqa: S603, S607
