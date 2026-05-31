"""add secure auth columns to pos terminal

Revision ID: 8aa3587f0f7e
Revises: 001_pos_terminals
Create Date: 2026-05-26 19:51:25.676449

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8aa3587f0f7e'
down_revision: Union[str, Sequence[str], None] = '001_pos_terminals'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('pos_terminals')]

    if 'device_id' not in columns:
        op.add_column('pos_terminals', sa.Column('device_id', sa.String(length=255), nullable=True))
    if 'last_device_id' not in columns:
        op.add_column('pos_terminals', sa.Column('last_device_id', sa.String(length=255), nullable=True))
    if 'operator_pin' not in columns:
        op.add_column('pos_terminals', sa.Column('operator_pin', sa.String(length=255), nullable=True))
    if 'authorized_at' not in columns:
        op.add_column('pos_terminals', sa.Column('authorized_at', sa.DateTime(timezone=True), nullable=True))
    if 'is_t0_settlement' not in columns:
        op.add_column('pos_terminals', sa.Column('is_t0_settlement', sa.Boolean(), nullable=False, server_default='false'))

    # Check for index existence
    existing_indices = [i['name'] for i in inspector.get_indexes('pos_terminals')]
    if 'idx_terminal_device_id' not in existing_indices:
        op.create_index('idx_terminal_device_id', 'pos_terminals', ['device_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_terminal_device_id', table_name='pos_terminals')
    op.drop_column('pos_terminals', 'is_t0_settlement')
    op.drop_column('pos_terminals', 'authorized_at')
    op.drop_column('pos_terminals', 'operator_pin')
    op.drop_column('pos_terminals', 'last_device_id')
    op.drop_column('pos_terminals', 'device_id')
