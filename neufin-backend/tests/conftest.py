"""Shared pytest fixtures and configuration."""

import os


def _set_required_env(key: str, value: str) -> None:
    """Ensure required test env vars are non-empty."""
    if not os.environ.get(key):
        os.environ[key] = value


# Ensure test environment never uses production credentials
_set_required_env("SUPABASE_URL", "https://test.supabase.co")
_set_required_env("SUPABASE_KEY", "test-key")
_set_required_env("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
_set_required_env("SUPABASE_JWT_SECRET", "test-secret-at-least-32-chars-long!!")
_set_required_env("ANTHROPIC_API_KEY", "sk-ant-test")
_set_required_env("STRIPE_SECRET_KEY", "sk_test_placeholder")
_set_required_env("STRIPE_WEBHOOK_SECRET", "whsec_test")
_set_required_env("FERNET_MASTER_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
_set_required_env("APP_BASE_URL", "http://localhost:8000")
_set_required_env("ENVIRONMENT", "test")
_set_required_env("ALLOWED_ORIGINS", "http://localhost:3000")
