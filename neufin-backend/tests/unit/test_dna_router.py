"""Unit tests for routers/dna.py — DNA score generation and sharing."""
import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ── Fixtures ──────────────────────────────────────────────────────────────────

VALID_CSV = b"symbol,shares\nAAPL,10\nMSFT,5\nGOOGL,3\n"
VALID_CSV_WITH_COST = b"symbol,shares,cost_basis\nAAPL,10,150.00\nMSFT,5,280.00\n"

MOCK_METRICS = {
    "total_value": 3200.0,
    "hhi": 0.38,
    "weighted_beta": 1.1,
    "positions": [
        {"symbol": "AAPL", "shares": 10, "price": 185.0, "weight": 0.578},
        {"symbol": "MSFT", "shares": 5, "price": 415.0, "weight": 0.297},
        {"symbol": "GOOGL", "shares": 3, "price": 175.0, "weight": 0.164},
    ],
}

MOCK_AI_RESPONSE = {
    "dna_score": 74,
    "investor_type": "Balanced Growth",
    "strengths": ["Diversified sectors"],
    "weaknesses": ["High beta"],
    "recommendation": "Consider TLT.",
}


@pytest.fixture
def client():
    # Patch Supabase before importing app to avoid real DB connections
    with patch("database.create_client") as mock_supabase:
        mock_supabase.return_value = MagicMock()
        from main import app
        with TestClient(app) as c:
            yield c


# ── POST /api/dna/generate ────────────────────────────────────────────────────

class TestGenerateDNA:
    @patch("routers.dna.calculate_portfolio_metrics", return_value=MOCK_METRICS)
    @patch("routers.dna.get_ai_analysis", new_callable=AsyncMock, return_value=MOCK_AI_RESPONSE)
    @patch("routers.dna.supabase")
    def test_returns_dna_score(self, mock_db, mock_ai, mock_calc, client):
        mock_db.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": "test-uuid", "share_token": "abc12345"}]
        )
        response = client.post(
            "/api/dna/generate",
            files={"file": ("portfolio.csv", io.BytesIO(VALID_CSV), "text/csv")},
        )
        assert response.status_code == 200
        data = response.json()
        assert "dna_score" in data
        assert "share_token" in data

    def test_rejects_non_csv(self, client):
        response = client.post(
            "/api/dna/generate",
            files={"file": ("portfolio.txt", io.BytesIO(b"not,csv"), "text/plain")},
        )
        assert response.status_code == 400

    def test_rejects_invalid_csv(self, client):
        response = client.post(
            "/api/dna/generate",
            files={"file": ("bad.csv", io.BytesIO(b"\x00\xff\xfe"), "text/csv")},
        )
        assert response.status_code == 400


# ── GET /api/dna/share/{token} ────────────────────────────────────────────────

class TestShareEndpoint:
    @patch("routers.dna.supabase")
    def test_returns_shared_result(self, mock_db, client):
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"dna_score": 74, "investor_type": "Balanced Growth", "share_token": "abc12345", "view_count": 5}
        )
        response = client.get("/api/dna/share/abc12345")
        assert response.status_code == 200
        assert response.json()["share_token"] == "abc12345"

    @patch("routers.dna.supabase")
    def test_returns_404_for_unknown_token(self, mock_db, client):
        mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data=None
        )
        response = client.get("/api/dna/share/unknowntk")
        assert response.status_code == 404


# ── GET /api/dna/leaderboard ──────────────────────────────────────────────────

class TestLeaderboard:
    @patch("routers.dna.supabase")
    def test_returns_list(self, mock_db, client):
        mock_db.table.return_value.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"investor_type": "Momentum Trader", "dna_score": 91, "view_count": 43}]
        )
        response = client.get("/api/dna/leaderboard")
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, dict)
        assert isinstance(body.get("leaderboard"), list)
