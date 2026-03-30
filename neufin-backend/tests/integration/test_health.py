"""Integration tests — require a running backend (localhost:8000 or TEST_BASE_URL)."""

import os

import httpx
import pytest

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8000")


@pytest.fixture(scope="module")
def http():
    try:
        probe = httpx.get(f"{BASE_URL}/health", timeout=3.0)
        if probe.status_code >= 500:
            pytest.skip(f"Backend unhealthy at {BASE_URL}")
    except Exception:
        pytest.skip(f"Backend not running at {BASE_URL}")
    with httpx.Client(base_url=BASE_URL, timeout=30) as client:
        yield client


class TestHealthEndpoint:
    def test_health_returns_200(self, http):
        response = http.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"


class TestPublicEndpoints:
    def test_market_health_endpoint(self, http):
        response = http.get("/api/market/health")
        assert response.status_code == 200
        data = response.json()
        assert "regime" in data

    def test_leaderboard_endpoint(self, http):
        response = http.get("/api/dna/leaderboard")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_swarm_global_chat(self, http):
        response = http.post(
            "/api/swarm/global-chat",
            json={"message": "What is the current market regime?"},
        )
        assert response.status_code == 200
        assert "reply" in response.json()


class TestAuthProtection:
    def test_portfolio_list_requires_auth(self, http):
        response = http.get("/api/portfolio/list")
        assert response.status_code == 401

    def test_swarm_analyze_requires_auth(self, http):
        response = http.post("/api/swarm/analyze", json={"portfolio_id": "fake"})
        assert response.status_code == 401

    def test_vault_history_requires_auth(self, http):
        response = http.get("/api/vault/history")
        assert response.status_code == 401

    def test_report_checkout_requires_auth(self, http):
        response = http.post("/api/reports/checkout", params={"plan": "single"})
        assert response.status_code == 401
