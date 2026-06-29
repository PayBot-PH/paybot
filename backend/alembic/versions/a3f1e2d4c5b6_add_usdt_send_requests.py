"""add usdt send requests

Revision ID: a3f1e2d4c5b6
Revises: f4e19613f3a8
Create Date: 2026-02-27 20:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision: str = 'a3f1e2d4c5b6'
down_revision: Union[str, Sequence[str], None] = 'f4e19613f3a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    """Return True if the named table already exists (idempotency guard)."""
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        return bind.execute(
            text("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=:t"),
            {"t": name},
        ).fetchone() is not None
    return bind.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:t"), {"t": name}
    ).fetchone() is not None


def upgrade() -> None:
    if not _table_exists('usdt_send_requests'):
        op.create_table(
            'usdt_send_requests',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('user_id', sa.String(), nullable=False),
            sa.Column('wallet_id', sa.Integer(), nullable=False),
            sa.Column('to_address', sa.String(), nullable=False),
            sa.Column('amount', sa.Float(), nullable=False),
            sa.Column('note', sa.String(), nullable=True),
            sa.Column('status', sa.String(), nullable=False),
            sa.Column('denial_reason', sa.String(), nullable=True),
            sa.Column('reviewed_by', sa.String(), nullable=True),
            sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_usdt_send_requests_id'), 'usdt_send_requests', ['id'], unique=False)


def downgrade() -> None:
    if _table_exists('usdt_send_requests'):
        op.drop_index(op.f('ix_usdt_send_requests_id'), table_name='usdt_send_requests')
        op.drop_table('usdt_send_requests')
