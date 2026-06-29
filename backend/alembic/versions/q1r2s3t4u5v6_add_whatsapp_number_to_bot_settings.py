"""add whatsapp_number to bot_settings

Revision ID: q1r2s3t4u5v6
Revises: p1q2r3s4t5u6
Create Date: 2026-03-30 14:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "q1r2s3t4u5v6"
down_revision: Union[str, None] = "p1q2r3s4t5u6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing_cols = {c["name"] for c in inspect(bind).get_columns("bot_settings")}
    if "whatsapp_number" not in existing_cols:
        op.add_column(
            "bot_settings",
            sa.Column("whatsapp_number", sa.String(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("bot_settings", "whatsapp_number")
