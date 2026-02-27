"""add kyb_registrations table

Revision ID: d1e2f3a4b5c6
Revises: c1d2e3f4a5b6
Create Date: 2026-02-27 22:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, Sequence[str], None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create kyb_registrations table if it does not already exist."""
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = set(inspector.get_table_names())

    if 'kyb_registrations' not in existing:
        op.create_table(
            'kyb_registrations',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('chat_id', sa.String(length=64), nullable=False),
            sa.Column('telegram_username', sa.String(length=128), nullable=True),
            sa.Column('step', sa.String(length=32), nullable=False, server_default='full_name'),
            sa.Column('full_name', sa.String(length=256), nullable=True),
            sa.Column('phone', sa.String(length=64), nullable=True),
            sa.Column('address', sa.String(length=512), nullable=True),
            sa.Column('bank_name', sa.String(length=128), nullable=True),
            sa.Column('id_photo_file_id', sa.String(length=256), nullable=True),
            sa.Column('status', sa.String(length=32), nullable=False, server_default='in_progress'),
            sa.Column('rejection_reason', sa.String(length=512), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_kyb_registrations_id'), 'kyb_registrations', ['id'], unique=False)
        op.create_index(op.f('ix_kyb_registrations_chat_id'), 'kyb_registrations', ['chat_id'], unique=True)


def downgrade() -> None:
    """Drop kyb_registrations table if it exists."""
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = set(inspector.get_table_names())

    if 'kyb_registrations' in existing:
        op.drop_index(op.f('ix_kyb_registrations_chat_id'), table_name='kyb_registrations')
        op.drop_index(op.f('ix_kyb_registrations_id'), table_name='kyb_registrations')
        op.drop_table('kyb_registrations')
