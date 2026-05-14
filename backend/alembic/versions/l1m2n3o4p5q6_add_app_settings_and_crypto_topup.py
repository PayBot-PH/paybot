"""add app_settings and crypto_topup_requests tables

Revision ID: l1m2n3o4p5q6
Revises: k1l2m3n4o5p6
Create Date: 2026-03-11 06:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision: str = "l1m2n3o4p5q6"
down_revision: Union[str, Sequence[str], None] = "k1l2m3n4o5p6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    """Return True if the named table already exists (handles fresh vs existing DB)."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return (
            bind.execute(
                text(
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema='public' AND table_name=:t"
                ),
                {"t": name},
            ).fetchone()
            is not None
        )
    return (
        bind.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:t"), {"t": name}
        ).fetchone()
        is not None
    )


def upgrade() -> None:
    if not _table_exists("app_settings"):
        op.create_table(
            "app_settings",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("key", sa.String(), nullable=False),
            sa.Column("value", sa.String(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_app_settings_id"), "app_settings", ["id"], unique=False)
        op.create_index(op.f("ix_app_settings_key"), "app_settings", ["key"], unique=True)

    if not _table_exists("crypto_topup_requests"):
        op.create_table(
            "crypto_topup_requests",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("wallet_id", sa.Integer(), nullable=True),
            sa.Column("amount_usdt", sa.Float(), nullable=False),
            sa.Column("tx_hash", sa.String(), nullable=False),
            sa.Column("network", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("reviewed_by", sa.String(), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_crypto_topup_requests_id"), "crypto_topup_requests", ["id"], unique=False
        )


def downgrade() -> None:
    if _table_exists("crypto_topup_requests"):
        op.drop_index(op.f("ix_crypto_topup_requests_id"), table_name="crypto_topup_requests")
        op.drop_table("crypto_topup_requests")

    if _table_exists("app_settings"):
        op.drop_index(op.f("ix_app_settings_key"), table_name="app_settings")
        op.drop_index(op.f("ix_app_settings_id"), table_name="app_settings")
        op.drop_table("app_settings")
