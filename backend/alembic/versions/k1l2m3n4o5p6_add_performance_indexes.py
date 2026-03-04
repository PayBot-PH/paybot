"""add performance indexes to frequently queried columns

Revision ID: k1l2m3n4o5p6
Revises: j1k2l3m4n5o6
Create Date: 2026-03-04 06:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision: str = "k1l2m3n4o5p6"
down_revision: Union[str, Sequence[str], None] = "j1k2l3m4n5o6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (index_name, table, columns)
_INDEXES = [
    ("ix_transactions_user_id", "transactions", ["user_id"]),
    ("ix_transactions_status", "transactions", ["status"]),
    ("ix_transactions_external_id", "transactions", ["external_id"]),
    ("ix_wallets_user_id_currency", "wallets", ["user_id", "currency"]),
    ("ix_wallet_transactions_wallet_id", "wallet_transactions", ["wallet_id"]),
    ("ix_wallet_transactions_user_status_type", "wallet_transactions", ["user_id", "status", "transaction_type"]),
    ("ix_usdt_send_requests_user_id", "usdt_send_requests", ["user_id"]),
    ("ix_usdt_send_requests_status", "usdt_send_requests", ["status"]),
    ("ix_kyb_registrations_status", "kyb_registrations", ["status"]),
]


def _index_exists(index_name: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return bind.execute(
            text(
                "SELECT 1 FROM pg_indexes WHERE indexname = :n"
            ),
            {"n": index_name},
        ).fetchone() is not None
    # SQLite: query sqlite_master for the index name
    result = bind.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='index' AND name=:n"),
        {"n": index_name},
    )
    return result.fetchone() is not None


def upgrade() -> None:
    for index_name, table, columns in _INDEXES:
        if not _index_exists(index_name):
            op.create_index(index_name, table, columns)


def downgrade() -> None:
    for index_name, table, _columns in reversed(_INDEXES):
        if _index_exists(index_name):
            op.drop_index(index_name, table_name=table)
