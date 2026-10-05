"""Add durable workflow notifications.

Revision ID: 20261004_02
Revises: 20261004_01
Create Date: 2026-10-04 00:05:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20261004_02"
down_revision = "20261004_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workflow_notifications",
        sa.Column("notification_id", sa.Text(), primary_key=True),
        sa.Column("case_id", sa.Text(), nullable=False),
        sa.Column("recipient_role", sa.Text(), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("read_at", sa.Text()),
    )


def downgrade() -> None:
    op.drop_table("workflow_notifications")