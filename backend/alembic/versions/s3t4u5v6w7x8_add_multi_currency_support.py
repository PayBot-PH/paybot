"""add multi-currency exchange rate and conversion support

Revision ID: s3t4u5v6w7x8
Revises: r2s3t4u5v6w7
Create Date: 2026-06-06 03:15:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision: str = "s3t4u5v6w7x8"
down_revision: Union[str, Sequence[str], None] = "r2s3t4u5v6w7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _col_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return bind.execute(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name=:t AND column_name=:c"
            ),
            {"t": table, "c": column},
        ).fetchone() is not None
    result = bind.execute(text(f"PRAGMA table_info({table})"))
    return any(row[1] == column for row in result)


def _table_exists(table: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return bind.execute(
            text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema='public' AND table_name=:t"
            ),
            {"t": table},
        ).fetchone() is not None
    result = bind.execute(text(f"PRAGMA table_info({table})"))
    return result.fetchone() is not None


def _index_exists(index_name: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return bind.execute(
            text(
                "SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = :idx_name)"
            ),
            {"idx_name": index_name},
        ).fetchone()[0]
    result = bind.execute(text(f"PRAGMA index_info({index_name})"))
    return result.fetchone() is not None


def upgrade() -> None:
    # Add conversion_count column to wallets
    if not _col_exists("wallets", "conversion_count"):
        op.add_column(
            "wallets",
            sa.Column("conversion_count", sa.Integer(), nullable=False, server_default="0")
        )

    # Create exchange_rate_history table
    if not _table_exists("exchange_rate_history"):
        op.create_table(
            "exchange_rate_history",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column("currency_pair", sa.String(), nullable=False),
            sa.Column("rate", sa.Float(), nullable=False),
            sa.Column("provider", sa.String(), nullable=False),
            sa.Column("source", sa.String(), nullable=True),
            sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        
        # Create indices for exchange_rate_history
        op.create_index(
            "idx_xrate_history_pair",
            "exchange_rate_history",
            ["currency_pair"]
        )
        op.create_index(
            "idx_xrate_history_recorded",
            "exchange_rate_history",
            ["recorded_at"]
        )
        op.create_index(
            "idx_xrate_history_pair_date",
            "exchange_rate_history",
            ["currency_pair", "recorded_at"]
        )

    # Create exchange_rate_override table
    if not _table_exists("exchange_rate_override"):
        op.create_table(
            "exchange_rate_override",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column("currency_pair", sa.String(), nullable=False),
            sa.Column("override_rate", sa.Float(), nullable=False),
            sa.Column("reason", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        
        # Create indices for exchange_rate_override
        op.create_index(
            "idx_xrate_override_pair",
            "exchange_rate_override",
            ["currency_pair"]
        )
        op.create_index(
            "idx_xrate_override_admin",
            "exchange_rate_override",
            ["created_by"]
        )

    # Create currency_conversion table
    if not _table_exists("currency_conversion"):
        op.create_table(
            "currency_conversion",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column("wallet_id", sa.Integer(), nullable=False),
            sa.Column("from_currency", sa.String(), nullable=False),
            sa.Column("to_currency", sa.String(), nullable=False),
            sa.Column("from_amount", sa.Float(), nullable=False),
            sa.Column("to_amount", sa.Float(), nullable=False),
            sa.Column("rate_applied", sa.Float(), nullable=False),
            sa.Column("conversion_fee_rate", sa.Float(), nullable=False, server_default="0.01"),
            sa.Column("conversion_fee_amount", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("status", sa.String(), nullable=False, server_default="completed"),
            sa.Column("failure_reason", sa.String(), nullable=True),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("reference_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        
        # Create indices for currency_conversion
        op.create_index(
            "idx_conversion_wallet",
            "currency_conversion",
            ["wallet_id"]
        )
        op.create_index(
            "idx_conversion_status",
            "currency_conversion",
            ["status"]
        )
        op.create_index(
            "idx_conversion_created",
            "currency_conversion",
            ["created_at"]
        )


def downgrade() -> None:
    # Drop indices
    if _index_exists("idx_conversion_created"):
        op.drop_index("idx_conversion_created")
    if _index_exists("idx_conversion_status"):
        op.drop_index("idx_conversion_status")
    if _index_exists("idx_conversion_wallet"):
        op.drop_index("idx_conversion_wallet")
    
    if _index_exists("idx_xrate_override_admin"):
        op.drop_index("idx_xrate_override_admin")
    if _index_exists("idx_xrate_override_pair"):
        op.drop_index("idx_xrate_override_pair")
    
    if _index_exists("idx_xrate_history_pair_date"):
        op.drop_index("idx_xrate_history_pair_date")
    if _index_exists("idx_xrate_history_recorded"):
        op.drop_index("idx_xrate_history_recorded")
    if _index_exists("idx_xrate_history_pair"):
        op.drop_index("idx_xrate_history_pair")
    
    # Drop tables
    if _table_exists("currency_conversion"):
        op.drop_table("currency_conversion")
    if _table_exists("exchange_rate_override"):
        op.drop_table("exchange_rate_override")
    if _table_exists("exchange_rate_history"):
        op.drop_table("exchange_rate_history")
    
    # Drop column
    if _col_exists("wallets", "conversion_count"):
        op.drop_column("wallets", "conversion_count")
