"""add users and oidc_states tables

Revision ID: a1b2c3d4e5f6
Revises: f4e19613f3a8
Create Date: 2026-02-22 14:53:54.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision: str = 'a1b2c3d4e5f6'
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


def upgrade() -> None:
    if not _table_exists('users'):
        op.create_table(
            'users',
            sa.Column('id', sa.String(length=255), nullable=False),
            sa.Column('email', sa.String(length=255), nullable=False),
            sa.Column('name', sa.String(length=255), nullable=True),
            sa.Column('role', sa.String(length=50), nullable=False, server_default='user'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('last_login', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)

    if not _table_exists('oidc_states'):
        op.create_table(
            'oidc_states',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('state', sa.String(length=255), nullable=False),
            sa.Column('nonce', sa.String(length=255), nullable=False),
            sa.Column('code_verifier', sa.String(length=255), nullable=False),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_oidc_states_id'), 'oidc_states', ['id'], unique=False)
        op.create_index(op.f('ix_oidc_states_state'), 'oidc_states', ['state'], unique=True)


def downgrade() -> None:
    if _table_exists('oidc_states'):
        op.drop_index(op.f('ix_oidc_states_state'), table_name='oidc_states')
        op.drop_index(op.f('ix_oidc_states_id'), table_name='oidc_states')
        op.drop_table('oidc_states')
    if _table_exists('users'):
        op.drop_index(op.f('ix_users_id'), table_name='users')
        op.drop_table('users')
