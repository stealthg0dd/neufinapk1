"""
tests/test_error_responses.py

Asserts that every public-facing endpoint returns errors in the standardised shape:
    {error: str, message: str, trace_id: str, timestamp: ISO-8601}

No raw Python exception messages or stack traces should leak to clients.
"""

from __future__ import annotations

import re

from fastapi.testclient import TestClient

from main import app

client = TestClient(app, raise_server_exceptions=False)

# ── helpers ────────────────────────────────────────────────────────────────────

ISO8601_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")


def assert_error_shape(body: dict) -> None:
    """Validate the standard error envelope."""
    assert "error" in body, f"Missing 'error' key: {body}"
    assert "message" in body, f"Missing 'message' key: {body}"
    assert "trace_id" in body, f"Missing 'trace_id' key: {body}"
    assert "timestamp" in body, f"Missing 'timestamp' key: {body}"
    assert (
        isinstance(body["error"], str) and body["error"]
    ), "error must be a non-empty string"
    assert (
        isinstance(body["message"], str) and body["message"]
    ), "message must be a non-empty string"
    assert (
        isinstance(body["trace_id"], str) and body["trace_id"]
    ), "trace_id must be a non-empty string"
    assert ISO8601_RE.match(
        body["timestamp"]
    ), f"timestamp is not ISO-8601: {body['timestamp']}"


# ── test cases ─────────────────────────────────────────────────────────────────


class TestAnalyzeDnaErrors:
    def test_no_file_returns_error_shape(self):
        """POST /api/analyze-dna with no file should 422 with standard shape."""
        resp = client.post("/api/analyze-dna")
        assert resp.status_code == 422
        assert_error_shape(resp.json())

    def test_invalid_content_type_returns_error_shape(self):
        """POST /api/analyze-dna with bad JSON body should 422 with standard shape."""
        resp = client.post("/api/analyze-dna", json={"not": "a file"})
        assert resp.status_code == 422
        assert_error_shape(resp.json())


class TestReportsCheckoutErrors:
    def test_missing_body_returns_error_shape(self):
        """POST /api/reports/checkout with empty body → 422 standard shape."""
        resp = client.post("/api/reports/checkout", json={})
        assert resp.status_code in (400, 422, 401), resp.text
        assert_error_shape(resp.json())

    def test_bad_body_type_returns_error_shape(self):
        """POST /api/reports/checkout with non-JSON body → error standard shape."""
        resp = client.post(
            "/api/reports/checkout",
            data="not-json",
            headers={"Content-Type": "text/plain"},
        )
        assert resp.status_code in (400, 422), resp.text
        assert_error_shape(resp.json())


class TestVaultUnauthenticated:
    def test_get_vault_history_no_auth_returns_error_shape(self):
        """GET /api/vault/history without auth should return 401 standard shape."""
        resp = client.get("/api/vault/history")
        assert resp.status_code == 401
        assert_error_shape(resp.json())


class TestStripeWebhookErrors:
    def test_bad_signature_returns_error_shape(self):
        """POST /api/stripe/webhook with invalid signature → 400 standard shape."""
        resp = client.post(
            "/api/stripe/webhook",
            content=b'{"type":"checkout.session.completed"}',
            headers={
                "Content-Type": "application/json",
                "stripe-signature": "t=1,v1=invalidsignature",
            },
        )
        assert resp.status_code == 400
        assert_error_shape(resp.json())


class TestReportsFulfillErrors:
    def test_missing_report_id_returns_error_shape(self):
        """GET /api/reports/fulfill with no report_id → error standard shape."""
        resp = client.get("/api/reports/fulfill")
        assert resp.status_code in (400, 422), resp.text
        assert_error_shape(resp.json())


class TestNotFoundErrors:
    def test_unknown_route_returns_error_shape(self):
        """GET on a non-existent route should return a 4xx in standard shape.
        Returns 405 (not 404) due to the catch-all OPTIONS route; both cases
        must return our {error, message, trace_id, timestamp} envelope."""
        resp = client.get("/api/does-not-exist-xyz")
        assert resp.status_code in (404, 405)
        assert_error_shape(resp.json())
