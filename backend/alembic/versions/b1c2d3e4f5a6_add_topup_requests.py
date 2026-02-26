"""add topup_requests table

Revision ID: b1c2d3e4f5a6
Revises: a1b2c3d4e5f6
Create Date: 2026-02-26 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create topup_requests table."""
    op.create_table(
        'topup_requests',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('chat_id', sa.String(), nullable=False),
        sa.Column('telegram_username', sa.String(), nullable=True),
        sa.Column('amount_usdt', sa.Float(), nullable=False),
        sa.Column('receipt_file_id', sa.String(), nullable=True),
        sa.Column('status', sa.String(), server_default='pending', nullable=False),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('approved_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_topup_requests_id'), 'topup_requests', ['id'], unique=False)
    op.create_index(op.f('ix_topup_requests_chat_id'), 'topup_requests', ['chat_id'], unique=False)


def downgrade() -> None:
    """Drop topup_requests table."""
    op.drop_index(op.f('ix_topup_requests_chat_id'), table_name='topup_requests')
    op.drop_index(op.f('ix_topup_requests_id'), table_name='topup_requests')
    op.drop_table('topup_requests')
