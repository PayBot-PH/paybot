"""add reference_code index to topup_requests

Revision ID: m1n2o3p4q5r6
Revises: l1m2n3o4p5q6
Create Date: 2026-03-11 07:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision: str = "m1n2o3p4q5r6"
down_revision: Union[str, Sequence[str], None] = "l1m2n3o4p5q6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_exists(index_name: str, table_name: str) -> bool:
    """Return True if the named index already exists."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return (
            bind.execute(
                text("SELECT 1 FROM pg_indexes WHERE indexname=:i AND tablename=:t"),
                {"i": index_name, "t": table_name},
            ).fetchone()
            is not None
        )
    return (
        bind.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='index' AND name=:i"), {"i": index_name}
        ).fetchone()
        is not None
    )


def upgrade() -> None:
    if not _index_exists("ix_topup_requests_reference_code", "topup_requests"):
        op.create_index(
            op.f("ix_topup_requests_reference_code"),
            "topup_requests",
            ["reference_code"],
            unique=False,
        )


def downgrade() -> None:
    if _index_exists("ix_topup_requests_reference_code", "topup_requests"):
        op.drop_index(
            op.f("ix_topup_requests_reference_code"), table_name="topup_requests"
        )
