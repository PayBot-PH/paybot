"""add organization scoping fields

Revision ID: t6u7v8w9x0y1
Revises: s3t4u5v6w7x8
Create Date: 2026-06-30 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "t6u7v8w9x0y1"
down_revision: Union[str, Sequence[str], None] = "s3t4u5v6w7x8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return bind.execute(
            text("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=:t"),
            {"t": name},
        ).fetchone() is not None
    return bind.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:t"), {"t": name}
    ).fetchone() is not None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return bind.execute(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name=:t AND column_name=:c"
            ),
            {"t": table, "c": column},
        ).fetchone() is not None
    return bind.execute(
        text(f"PRAGMA table_info('{table}')")
    ).fetchall() and any(r[1] == column for r in bind.execute(text(f"PRAGMA table_info('{table}')")).fetchall())


def _index_exists(name: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return bind.execute(
            text("SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=:n"),
            {"n": name},
        ).fetchone() is not None
    return bind.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='index' AND name=:n"), {"n": name}
    ).fetchone() is not None


def upgrade() -> None:
    if _table_exists("admin_users"):
        if not _column_exists("admin_users", "can_manage_team"):
            op.add_column("admin_users", sa.Column("can_manage_team", sa.Boolean(), nullable=False, server_default="false"))
        if not _column_exists("admin_users", "organization_id"):
            op.add_column("admin_users", sa.Column("organization_id", sa.String(length=64), nullable=True))
        if not _column_exists("admin_users", "organization_name"):
            op.add_column("admin_users", sa.Column("organization_name", sa.String(length=256), nullable=True))
        if not _index_exists("ix_admin_users_organization_id"):
            op.create_index("ix_admin_users_organization_id", "admin_users", ["organization_id"], unique=False)

    if _table_exists("team_invitations"):
        if not _column_exists("team_invitations", "organization_id"):
            op.add_column("team_invitations", sa.Column("organization_id", sa.String(length=64), nullable=True))
        if not _column_exists("team_invitations", "organization_name"):
            op.add_column("team_invitations", sa.Column("organization_name", sa.String(length=256), nullable=True))
        if not _index_exists("ix_team_invitations_organization_id"):
            op.create_index("ix_team_invitations_organization_id", "team_invitations", ["organization_id"], unique=False)

    if _table_exists("wallets"):
        if not _column_exists("wallets", "organization_id"):
            op.add_column("wallets", sa.Column("organization_id", sa.String(), nullable=True))
        if not _index_exists("idx_wallets_organization_currency"):
            op.create_index("idx_wallets_organization_currency", "wallets", ["organization_id", "currency"], unique=False)


def downgrade() -> None:
    if _table_exists("wallets"):
        if _index_exists("idx_wallets_organization_currency"):
            op.drop_index("idx_wallets_organization_currency", table_name="wallets")
        if _column_exists("wallets", "organization_id"):
            op.drop_column("wallets", "organization_id")

    if _table_exists("team_invitations"):
        if _index_exists("ix_team_invitations_organization_id"):
            op.drop_index("ix_team_invitations_organization_id", table_name="team_invitations")
        if _column_exists("team_invitations", "organization_name"):
            op.drop_column("team_invitations", "organization_name")
        if _column_exists("team_invitations", "organization_id"):
            op.drop_column("team_invitations", "organization_id")

    if _table_exists("admin_users"):
        if _index_exists("ix_admin_users_organization_id"):
            op.drop_index("ix_admin_users_organization_id", table_name="admin_users")
        if _column_exists("admin_users", "organization_name"):
            op.drop_column("admin_users", "organization_name")
        if _column_exists("admin_users", "organization_id"):
            op.drop_column("admin_users", "organization_id")
        if _column_exists("admin_users", "can_manage_team"):
            op.drop_column("admin_users", "can_manage_team")
