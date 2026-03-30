"""
Regression test: /api/analyze-dna must accept CSV under any multipart field name.
Never returns 422 just because the field name differs.

Run:  pytest tests/test_analyze_dna_multipart.py
"""

import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# Minimal CSV that satisfies column requirements
SAMPLE_CSV = b"symbol,shares\nAAPL,10\nMSFT,5\n"

# Field names that must ALL work
FIELD_NAMES = ["file", "csv_file", "upload", "data"]


@pytest.fixture(scope="module")
def client():
    # Patch heavy dependencies so the test is unit-level and never hits network
    with (
        patch("database.supabase") as mock_supabase,
        patch("yfinance.download") as mock_yf,
        patch("services.ai_router.get_ai_analysis", new_callable=AsyncMock) as mock_ai,
        patch("services.analytics.track", new_callable=AsyncMock),
    ):
        # yfinance returns a DataFrame; ["Close"] gives a DataFrame (rows=dates, cols=tickers).
        # main.py uses isinstance(raw, pd.DataFrame) to detect this case.
        import pandas as pd

        mock_close_df = pd.DataFrame([{"AAPL": 180.0, "MSFT": 370.0}])
        mock_yf.return_value = {"Close": mock_close_df}

        # ai_router returns a fixed analysis dict
        mock_ai.return_value = {
            "investor_type": "Diversified Strategist",
            "strengths": ["s1", "s2", "s3"],
            "weaknesses": ["w1", "w2"],
            "recommendation": "Hold steady.",
        }

        # Supabase insert returns a minimal result
        insert_result = MagicMock()
        insert_result.data = [{"id": "test-id-123"}]
        mock_supabase.table.return_value.insert.return_value.execute.return_value = insert_result
        mock_supabase.auth.get_user.side_effect = Exception("no token")

        from main import app

        yield TestClient(app)


@pytest.mark.parametrize("field_name", FIELD_NAMES)
def test_any_field_name_accepted(client, field_name):
    """POST with field name '{field_name}' must not return 422."""
    response = client.post(
        "/api/analyze-dna",
        files={field_name: ("portfolio.csv", io.BytesIO(SAMPLE_CSV), "text/csv")},
    )
    assert response.status_code != 422, f"Field name '{field_name}' returned 422: {response.text}"


def test_no_file_returns_422(client):
    """POST with no file at all must return 422."""
    response = client.post("/api/analyze-dna", data={"not_a_file": "hello"})
    assert response.status_code == 422


def test_missing_columns_returns_422(client):
    """CSV without required columns must return 422."""
    bad_csv = b"ticker,quantity\nAAPL,10\n"
    response = client.post(
        "/api/analyze-dna",
        files={"file": ("bad.csv", io.BytesIO(bad_csv), "text/csv")},
    )
    assert response.status_code == 422
