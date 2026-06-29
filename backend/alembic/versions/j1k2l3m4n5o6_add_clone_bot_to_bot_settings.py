"""add clone bot fields to bot_settings

Revision ID: j1k2l3m4n5o6
Revises: i1j2k3l4m5n6
Create Date: 2026-03-03 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision: str = "j1k2l3m4n5o6"
down_revision: Union[str, Sequence[str], None] = "i1j2k3l4m5n6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _col_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return bind.execute(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name=:t AND column_name=:c"
            ),
            {"t": table, "c": column},
        ).fetchone() is not None
    result = bind.execute(text(f"PRAGMA table_info({table})"))
    return any(row[1] == column for row in result)


def upgrade() -> None:
    for col, type_ in [
        ("custom_bot_token",    sa.String()),
        ("custom_bot_name",     sa.String()),
        ("custom_bot_username", sa.String()),
        ("custom_bot_id",       sa.String()),
        ("custom_webhook_url",  sa.String()),
        ("webhook_secret",      sa.String()),
    ]:
        if not _col_exists("bot_settings", col):
            op.add_column("bot_settings", sa.Column(col, type_, nullable=True))


def downgrade() -> None:
    for col in [
        "custom_bot_token",
        "custom_bot_name",
        "custom_bot_username",
        "custom_bot_id",
        "custom_webhook_url",
        "webhook_secret",
    ]:
        if _col_exists("bot_settings", col):
            op.drop_column("bot_settings", col)
