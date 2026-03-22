"""add bank_deposit_requests table

Revision ID: l1m2n3o4p5q6
Revises: k1l2m3n4o5p6
Create Date: 2026-03-14 07:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'l1m2n3o4p5q6'
down_revision: Union[str, Sequence[str], None] = 'k1l2m3n4o5p6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create bank_deposit_requests table."""
    op.create_table(
        'bank_deposit_requests',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('chat_id', sa.String(), nullable=False),
        sa.Column('telegram_username', sa.String(), nullable=True),
        sa.Column('channel', sa.String(), nullable=False),
        sa.Column('account_number', sa.String(), nullable=False),
        sa.Column('amount_php', sa.Float(), nullable=False),
        sa.Column('receipt_file_id', sa.String(), nullable=True),
        sa.Column('status', sa.String(), server_default='pending', nullable=False),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('approved_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_bank_deposit_requests_chat_id'), 'bank_deposit_requests', ['chat_id'], unique=False)


def downgrade() -> None:
    """Drop bank_deposit_requests table."""
    op.drop_index(op.f('ix_bank_deposit_requests_chat_id'), table_name='bank_deposit_requests')
    op.drop_table('bank_deposit_requests')
