"""Add PIN authentication columns to admin_users

Revision ID: e1f2a3b4c5d6
Revises: f4e19613f3a8
Create Date: 2026-02-28 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'f4e19613f3a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        return bind.execute(
            text("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=:t"),
            {"t": name},
        ).fetchone() is not None
    return bind.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:t"), {"t": name}
    ).fetchone() is not None


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
    # If admin_users does not exist yet it will be created fresh (with PIN
    # columns included) by migration c1d2e3f4a5b6, so there is nothing to do.
    if not _table_exists('admin_users'):
        return
    if not _column_exists('admin_users', 'pin_hash'):
        op.add_column('admin_users', sa.Column('pin_hash', sa.String(length=128), nullable=True))
    if not _column_exists('admin_users', 'pin_salt'):
        op.add_column('admin_users', sa.Column('pin_salt', sa.String(length=64), nullable=True))
    if not _column_exists('admin_users', 'pin_failed_attempts'):
        op.add_column('admin_users', sa.Column('pin_failed_attempts', sa.Integer(), nullable=False, server_default='0'))
    if not _column_exists('admin_users', 'pin_locked_until'):
        op.add_column('admin_users', sa.Column('pin_locked_until', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    if not _table_exists('admin_users'):
        return
    if _column_exists('admin_users', 'pin_locked_until'):
        op.drop_column('admin_users', 'pin_locked_until')
    if _column_exists('admin_users', 'pin_failed_attempts'):
        op.drop_column('admin_users', 'pin_failed_attempts')
    if _column_exists('admin_users', 'pin_salt'):
        op.drop_column('admin_users', 'pin_salt')
    if _column_exists('admin_users', 'pin_hash'):
        op.drop_column('admin_users', 'pin_hash')
