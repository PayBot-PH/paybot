"""add message templates and controls to bot_settings

Revision ID: k1l2m3n4o5p6
Revises: j1k2l3m4n5o6
Create Date: 2026-03-13 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision: str = "k1l2m3n4o5p6"
down_revision: Union[str, Sequence[str], None] = "j1k2l3m4n5o6"
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
        ("welcome_message_en",      sa.Text()),
        ("welcome_message_zh",      sa.Text()),
        ("payment_success_message", sa.Text()),
        ("payment_failed_message",  sa.Text()),
        ("payment_pending_message", sa.Text()),
        ("maintenance_message",     sa.Text()),
        ("maintenance_mode",        sa.String()),
        ("commands_enabled",        sa.Text()),
    ]:
        if not _col_exists("bot_settings", col):
            op.add_column("bot_settings", sa.Column(col, type_, nullable=True))


def downgrade() -> None:
    for col in [
        "welcome_message_en",
        "welcome_message_zh",
        "payment_success_message",
        "payment_failed_message",
        "payment_pending_message",
        "maintenance_message",
        "maintenance_mode",
        "commands_enabled",
    ]:
        if _col_exists("bot_settings", col):
            op.drop_column("bot_settings", col)
