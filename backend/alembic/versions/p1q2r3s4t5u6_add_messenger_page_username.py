"""add messenger_page_username to bot_settings

Revision ID: p1q2r3s4t5u6
Revises: o1p2q3r4s5t6
Create Date: 2026-03-30 06:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "p1q2r3s4t5u6"
down_revision: Union[str, None] = "o1p2q3r4s5t6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing_cols = {c["name"] for c in inspect(bind).get_columns("bot_settings")}
    if "messenger_page_username" not in existing_cols:
        op.add_column(
            "bot_settings",
            sa.Column("messenger_page_username", sa.String(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("bot_settings", "messenger_page_username")
