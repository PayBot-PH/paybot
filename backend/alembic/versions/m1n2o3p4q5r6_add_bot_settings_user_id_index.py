"""add user_id index to bot_settings

Revision ID: m1n2o3p4q5r6
Revises: l1m2n3o4p5q6
Create Date: 2026-03-14 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'm1n2o3p4q5r6'
down_revision: Union[str, Sequence[str], None] = 'l1m2n3o4p5q6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add user_id index to bot_settings for faster per-user lookups."""
    op.create_index('idx_bot_settings_user_id', 'bot_settings', ['user_id'], unique=False)


def downgrade() -> None:
    """Drop user_id index from bot_settings."""
    op.drop_index('idx_bot_settings_user_id', table_name='bot_settings')
