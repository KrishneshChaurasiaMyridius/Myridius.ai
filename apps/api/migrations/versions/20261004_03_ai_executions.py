"""Add AI execution telemetry ledger.

Revision ID: 20261004_03
Revises: 20261004_02
Create Date: 2026-10-05 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20261004_03"
down_revision = "20261004_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_executions",
        sa.Column("execution_id", sa.Text(), primary_key=True),
        sa.Column("case_id", sa.Text(), nullable=False),
        sa.Column("execution_json", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("ai_executions")
