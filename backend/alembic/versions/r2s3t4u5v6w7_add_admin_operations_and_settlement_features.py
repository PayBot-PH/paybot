"""add admin operations and settlement features to wallets and disbursements

Revision ID: r2s3t4u5v6w7
Revises: f3b4c5d6e7f8
Create Date: 2026-06-06 02:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision: str = "r2s3t4u5v6w7"
down_revision: Union[str, Sequence[str], None] = "f3b4c5d6e7f8"
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


def _index_exists(index_name: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return bind.execute(
            text(
                "SELECT 1 FROM information_schema.schemata s "
                "JOIN information_schema.tables t ON s.schema_name = t.table_schema "
                "JOIN information_schema.constraint_column_usage c ON t.table_name = c.table_name "
                "WHERE c.constraint_name = :idx_name"
            ),
            {"idx_name": index_name},
        ).fetchone() is not None
    result = bind.execute(text(f"PRAGMA index_info({index_name})"))
    return result.fetchone() is not None


def upgrade() -> None:
    # Add wallet admin operation columns
    wallet_columns = [
        ("is_frozen", sa.Boolean(), False),
        ("freeze_reason", sa.String(), None),
        ("total_credits", sa.Float(), 0.0),
        ("total_debits", sa.Float(), 0.0),
        ("transaction_count", sa.Integer(), 0),
        ("last_activity", sa.DateTime(timezone=True), None),
    ]
    
    for col_name, col_type, default in wallet_columns:
        if not _col_exists("wallets", col_name):
            op.add_column(
                "wallets",
                sa.Column(col_name, col_type, nullable=True, server_default=str(default) if default is not None else None)
            )
    
    # Add disbursement settlement columns
    disbursement_columns = [
        ("settlement_batch_id", sa.String(), None),
        ("settlement_priority", sa.String(), "normal"),
        ("processing_fee", sa.Float(), 0.0),
        ("net_amount", sa.Float(), None),
        ("scheduled_at", sa.DateTime(timezone=True), None),
        ("processed_at", sa.DateTime(timezone=True), None),
        ("completed_at", sa.DateTime(timezone=True), None),
        ("failure_reason", sa.String(), None),
        ("retry_count", sa.Integer(), 0),
    ]
    
    for col_name, col_type, default in disbursement_columns:
        if not _col_exists("disbursements", col_name):
            op.add_column(
                "disbursements",
                sa.Column(col_name, col_type, nullable=True, server_default=str(default) if default is not None else None)
            )
    
    # Add indices for wallet admin operations
    wallet_indices = [
        ("idx_wallets_status", "wallets", ["is_frozen"]),
    ]
    
    for idx_name, table_name, columns in wallet_indices:
        if not _index_exists(idx_name):
            op.create_index(idx_name, table_name, columns)
    
    # Add indices for disbursement settlement
    disbursement_indices = [
        ("idx_disbursements_settlement_batch", "disbursements", ["settlement_batch_id"]),
    ]
    
    for idx_name, table_name, columns in disbursement_indices:
        if not _index_exists(idx_name):
            op.create_index(idx_name, table_name, columns)


def downgrade() -> None:
    # Remove wallet admin columns
    wallet_columns = [
        "is_frozen",
        "freeze_reason",
        "total_credits",
        "total_debits",
        "transaction_count",
        "last_activity",
    ]
    
    for col in wallet_columns:
        if _col_exists("wallets", col):
            op.drop_column("wallets", col)
    
    # Remove disbursement settlement columns
    disbursement_columns = [
        "settlement_batch_id",
        "settlement_priority",
        "processing_fee",
        "net_amount",
        "scheduled_at",
        "processed_at",
        "completed_at",
        "failure_reason",
        "retry_count",
    ]
    
    for col in disbursement_columns:
        if _col_exists("disbursements", col):
            op.drop_column("disbursements", col)
    
    # Remove indices
    wallet_indices = ["idx_wallets_status"]
    disbursement_indices = ["idx_disbursements_settlement_batch"]
    
    for idx_name in wallet_indices + disbursement_indices:
        if _index_exists(idx_name):
            op.drop_index(idx_name)
