"""add email to kyb_registrations

Revision ID: h1i2j3k4l5m6
Revises: g1h2i3j4k5l6
Create Date: 2026-03-01 06:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'h1i2j3k4l5m6'
down_revision: Union[str, Sequence[str], None] = 'g1h2i3j4k5l6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add email column to kyb_registrations if it does not already exist."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col['name'] for col in inspector.get_columns('kyb_registrations')}
    if 'email' not in columns:
        op.add_column('kyb_registrations', sa.Column('email', sa.String(length=256), nullable=True))


def downgrade() -> None:
    """Drop email column from kyb_registrations if it exists."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col['name'] for col in inspector.get_columns('kyb_registrations')}
    if 'email' in columns:
        op.drop_column('kyb_registrations', 'email')
