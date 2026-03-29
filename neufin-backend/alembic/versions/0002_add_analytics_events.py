"""Add analytics_events table (unblocks commented-out track() calls in main.py).

Revision ID: 0002
Revises: 0001
Create Date: 2025-01-10 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS analytics_events (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
            session_id  TEXT,
            event_name  TEXT NOT NULL,
            properties  JSONB DEFAULT '{}',
            ip_hash     TEXT,
            created_at  TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

        -- Only service role can insert; users cannot read their own raw events
        CREATE POLICY "service_role_insert" ON analytics_events
            FOR INSERT WITH CHECK (true);
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_analytics_events_user
            ON analytics_events (user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_analytics_events_name
            ON analytics_events (event_name, created_at DESC);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS analytics_events CASCADE;")
