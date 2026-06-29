"""add messenger columns to bot_settings

Revision ID: o1p2q3r4s5t6
Revises: n1o2p3q4r5s6
Create Date: 2026-03-30 05:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "o1p2q3r4s5t6"
down_revision: Union[str, None] = "n1o2p3q4r5s6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_MESSENGER_COLUMNS = [
    ("messenger_bot_status", sa.String(), "inactive"),
    ("messenger_page_id", sa.String(), None),
    ("messenger_page_access_token", sa.String(), None),
    ("messenger_app_id", sa.String(), None),
    ("messenger_app_secret", sa.String(), None),
    ("messenger_verify_token", sa.String(), None),
]


def upgrade() -> None:
    bind = op.get_bind()
    existing_cols = {c["name"] for c in inspect(bind).get_columns("bot_settings")}
    for col_name, col_type, default in _MESSENGER_COLUMNS:
        if col_name not in existing_cols:
            op.add_column(
                "bot_settings",
                sa.Column(col_name, col_type, nullable=True, server_default=default),
            )


def downgrade() -> None:
    for col_name, _, _ in reversed(_MESSENGER_COLUMNS):
        op.drop_column("bot_settings", col_name)
