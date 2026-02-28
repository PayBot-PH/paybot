"""Add PIN authentication columns to admin_users

Revision ID: e1f2a3b4c5d6
Revises: f4e19613f3a8
Create Date: 2026-02-28 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'f4e19613f3a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('admin_users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('pin_hash', sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column('pin_salt', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('pin_failed_attempts', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('pin_locked_until', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('admin_users', schema=None) as batch_op:
        batch_op.drop_column('pin_locked_until')
        batch_op.drop_column('pin_failed_attempts')
        batch_op.drop_column('pin_salt')
        batch_op.drop_column('pin_hash')
