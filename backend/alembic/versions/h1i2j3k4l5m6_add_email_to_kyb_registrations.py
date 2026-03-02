"""add email to kyb_registrations

Revision ID: h1i2j3k4l5m6
Revises: g1h2i3j4k5l6
Create Date: 2026-03-01 06:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision: str = 'h1i2j3k4l5m6'
down_revision: Union[str, Sequence[str], None] = 'g1h2i3j4k5l6'
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
    if not _table_exists('kyb_registrations'):
        return
    if not _column_exists('kyb_registrations', 'email'):
        op.add_column('kyb_registrations', sa.Column('email', sa.String(length=256), nullable=True))


def downgrade() -> None:
    if not _table_exists('kyb_registrations'):
        return
    if _column_exists('kyb_registrations', 'email'):
        op.drop_column('kyb_registrations', 'email')
