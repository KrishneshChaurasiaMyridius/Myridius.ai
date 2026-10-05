"""Create the governed workbench persistence baseline.

Revision ID: 20261004_01
Revises:
Create Date: 2026-10-04 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20261004_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cases",
        sa.Column("case_id", sa.Text(), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("change_type", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("inherent_risk", sa.Integer(), nullable=False),
        sa.Column("residual_risk", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("submitted_at", sa.Text()),
        sa.Column("intake_json", sa.Text(), nullable=False),
        sa.Column("risk_assessment_json", sa.Text()),
        sa.Column("assessment_draft_json", sa.Text()),
        sa.Column("analyst_override_json", sa.Text()),
        sa.Column("committee_decision_json", sa.Text()),
    )
    op.create_table(
        "audit_events",
        sa.Column("event_id", sa.Text(), primary_key=True),
        sa.Column("case_id", sa.Text(), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("actor", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.Text(), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("previous_hash", sa.Text()),
        sa.Column("event_hash", sa.Text(), nullable=False, unique=True),
    )
    op.create_table(
        "intake_versions",
        sa.Column("case_id", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("intake_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("case_id", "version"),
    )
    op.create_table(
        "evidence_documents",
        sa.Column("document_id", sa.Text(), primary_key=True),
        sa.Column("case_id", sa.Text(), nullable=False),
        sa.Column("document_json", sa.Text(), nullable=False),
    )
    op.create_table(
        "risk_configurations",
        sa.Column("version", sa.Text(), primary_key=True),
        sa.Column("configuration_json", sa.Text(), nullable=False),
        sa.Column("active", sa.Integer(), nullable=False),
        sa.CheckConstraint("active IN (0, 1)", name="risk_configurations_active_check"),
    )
    op.create_table(
        "policy_sources",
        sa.Column("source_id", sa.Text(), primary_key=True),
        sa.Column("source_json", sa.Text(), nullable=False),
    )
    op.create_table(
        "policy_audit_events",
        sa.Column("event_id", sa.Text(), primary_key=True),
        sa.Column("source_id", sa.Text(), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("actor", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.Text(), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("policy_audit_events")
    op.drop_table("policy_sources")
    op.drop_table("risk_configurations")
    op.drop_table("evidence_documents")
    op.drop_table("intake_versions")
    op.drop_table("audit_events")
    op.drop_table("cases")