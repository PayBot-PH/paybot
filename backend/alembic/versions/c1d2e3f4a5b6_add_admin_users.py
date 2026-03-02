"""add admin_users table

Revision ID: c1d2e3f4a5b6
Revises: b1c2d3e4f5a6
Create Date: 2026-02-27 19:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, Sequence[str], None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create admin_users table if it does not already exist."""
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = set(inspector.get_table_names())

    if 'admin_users' not in existing:
        op.create_table(
            'admin_users',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('telegram_id', sa.String(length=64), nullable=False),
            sa.Column('telegram_username', sa.String(length=128), nullable=True),
            sa.Column('name', sa.String(length=256), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('is_super_admin', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('can_manage_payments', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('can_manage_disbursements', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('can_view_reports', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('can_manage_wallet', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('can_manage_transactions', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('can_manage_bot', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('can_approve_topups', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('added_by', sa.String(length=64), nullable=True),
            # PIN authentication columns (added here for fresh installs;
            # existing databases get them via e1f2a3b4c5d6).
            sa.Column('pin_hash', sa.String(length=128), nullable=True),
            sa.Column('pin_salt', sa.String(length=64), nullable=True),
            sa.Column('pin_failed_attempts', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('pin_locked_until', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_admin_users_id'), 'admin_users', ['id'], unique=False)
        op.create_index(op.f('ix_admin_users_telegram_id'), 'admin_users', ['telegram_id'], unique=True)


def downgrade() -> None:
    """Drop admin_users table if it exists."""
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = set(inspector.get_table_names())

    if 'admin_users' in existing:
        op.drop_index(op.f('ix_admin_users_telegram_id'), table_name='admin_users')
        op.drop_index(op.f('ix_admin_users_id'), table_name='admin_users')
        op.drop_table('admin_users')
