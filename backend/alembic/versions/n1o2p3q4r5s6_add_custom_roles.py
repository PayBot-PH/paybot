"""add custom_roles table

Revision ID: n1o2p3q4r5s6
Revises: m1n2o3p4q5r6
Create Date: 2026-03-14 20:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "n1o2p3q4r5s6"
down_revision: Union[str, None] = "m1n2o3p4q5r6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "custom_roles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=True),
        sa.Column("color", sa.String(length=32), nullable=False, server_default="blue"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_super_admin", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("can_manage_payments", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("can_manage_disbursements", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("can_view_reports", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("can_manage_wallet", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("can_manage_transactions", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("can_manage_bot", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("can_approve_topups", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index(op.f("ix_custom_roles_id"), "custom_roles", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_custom_roles_id"), table_name="custom_roles")
    op.drop_table("custom_roles")
