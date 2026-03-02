"""add wallet_topups and paymongo_webhook_events tables

Revision ID: i1j2k3l4m5n6
Revises: h1i2j3k4l5m6
Create Date: 2026-03-01 08:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "i1j2k3l4m5n6"
down_revision: Union[str, Sequence[str], None] = "h1i2j3k4l5m6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create wallet_topups and paymongo_webhook_events tables."""
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = set(inspector.get_table_names())

    if "wallet_topups" not in existing:
        op.create_table(
            "wallet_topups",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("amount", sa.Float(), nullable=False),
            sa.Column("currency", sa.String(), nullable=False, server_default="PHP"),
            sa.Column("paymongo_source_id", sa.String(), nullable=True),
            sa.Column("paymongo_payment_intent_id", sa.String(), nullable=True),
            sa.Column("paymongo_checkout_session_id", sa.String(), nullable=True),
            sa.Column("reference_number", sa.String(), nullable=True),
            sa.Column("payment_method", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="pending"),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("checkout_url", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_wallet_topups_id"), "wallet_topups", ["id"], unique=False)
        op.create_index(op.f("ix_wallet_topups_user_id"), "wallet_topups", ["user_id"], unique=False)
        op.create_index(op.f("ix_wallet_topups_paymongo_source_id"), "wallet_topups", ["paymongo_source_id"], unique=False)
        op.create_index(op.f("ix_wallet_topups_paymongo_payment_intent_id"), "wallet_topups", ["paymongo_payment_intent_id"], unique=False)
        op.create_index(op.f("ix_wallet_topups_paymongo_checkout_session_id"), "wallet_topups", ["paymongo_checkout_session_id"], unique=False)
        op.create_index(op.f("ix_wallet_topups_reference_number"), "wallet_topups", ["reference_number"], unique=False)

    if "paymongo_webhook_events" not in existing:
        op.create_table(
            "paymongo_webhook_events",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("event_id", sa.String(), nullable=False),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("event_id", name="uq_paymongo_webhook_events_event_id"),
        )
        op.create_index(op.f("ix_paymongo_webhook_events_id"), "paymongo_webhook_events", ["id"], unique=False)
        op.create_index(op.f("ix_paymongo_webhook_events_event_id"), "paymongo_webhook_events", ["event_id"], unique=True)


def downgrade() -> None:
    """Drop wallet_topups and paymongo_webhook_events tables."""
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = set(inspector.get_table_names())

    if "paymongo_webhook_events" in existing:
        op.drop_index(op.f("ix_paymongo_webhook_events_event_id"), table_name="paymongo_webhook_events")
        op.drop_index(op.f("ix_paymongo_webhook_events_id"), table_name="paymongo_webhook_events")
        op.drop_table("paymongo_webhook_events")

    if "wallet_topups" in existing:
        op.drop_index(op.f("ix_wallet_topups_reference_number"), table_name="wallet_topups")
        op.drop_index(op.f("ix_wallet_topups_paymongo_checkout_session_id"), table_name="wallet_topups")
        op.drop_index(op.f("ix_wallet_topups_paymongo_payment_intent_id"), table_name="wallet_topups")
        op.drop_index(op.f("ix_wallet_topups_paymongo_source_id"), table_name="wallet_topups")
        op.drop_index(op.f("ix_wallet_topups_user_id"), table_name="wallet_topups")
        op.drop_index(op.f("ix_wallet_topups_id"), table_name="wallet_topups")
        op.drop_table("wallet_topups")
