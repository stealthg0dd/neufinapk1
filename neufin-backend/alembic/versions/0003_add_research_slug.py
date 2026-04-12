"""Add slug column and unique index to research_notes

Revision ID: 0003_add_research_slug
Revises: 0002_add_analytics_events
Create Date: 2026-04-08
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0003_add_research_slug"
down_revision = "0002_add_analytics_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE research_notes
        ADD COLUMN IF NOT EXISTS slug TEXT;
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS research_notes_slug_idx
        ON research_notes(slug);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS research_notes_slug_idx;")
    op.execute("ALTER TABLE research_notes DROP COLUMN IF EXISTS slug;")
