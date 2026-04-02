"""Initial schema — documents the baseline tables created via supabase_migrations_v1.sql.

Revision ID: 0001
Revises: (none)
Create Date: 2025-01-01 00:00:00

NOTE: These tables were created directly in Supabase. This migration is
documentary — it marks the starting point for Alembic tracking. Do NOT
run `alembic downgrade` to this migration in production as it would drop
all tables.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY, TEXT

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tables created externally via Supabase SQL Editor / supabase_migrations_v1.sql.
    # This is a no-op migration — the schema already exists.
    pass


def downgrade() -> None:
    # Intentionally left empty to prevent accidental data loss.
    # To drop tables, use Supabase dashboard.
    pass
