"""merge multiple heads and add currency/reference_code to topup_requests

Revision ID: c3d4e5f6a1b2
Revises: d1e2f3a4b5c6, a3f1e2d4c5b6, e1f2a3b4c5d6
Create Date: 2026-03-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = 'c3d4e5f6a1b2'
down_revision: Union[str, Sequence[str], None] = ('d1e2f3a4b5c6', 'a3f1e2d4c5b6', 'e1f2a3b4c5d6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, col: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        return bind.execute(
            text("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=:t AND column_name=:c"),
            {"t": table, "c": col},
        ).fetchone() is not None
    rows = bind.execute(text(f'PRAGMA table_info("{table}")')).fetchall()
    return any(row[1] == col for row in rows)


def upgrade() -> None:
    if not _column_exists('topup_requests', 'currency'):
        op.add_column('topup_requests', sa.Column('currency', sa.String(), nullable=False, server_default='USD'))
    if not _column_exists('topup_requests', 'reference_code'):
        op.add_column('topup_requests', sa.Column('reference_code', sa.String(), nullable=True))


def downgrade() -> None:
    if _column_exists('topup_requests', 'reference_code'):
        op.drop_column('topup_requests', 'reference_code')
    if _column_exists('topup_requests', 'currency'):
        op.drop_column('topup_requests', 'currency')
