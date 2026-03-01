"""merge multiple heads and add currency/reference_code to topup_requests

Revision ID: c3d4e5f6a1b2
Revises: d1e2f3a4b5c6, a3f1e2d4c5b6, e1f2a3b4c5d6
Create Date: 2026-03-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = 'c3d4e5f6a1b2'
down_revision: Union[str, Sequence[str], None] = ('d1e2f3a4b5c6', 'a3f1e2d4c5b6', 'e1f2a3b4c5d6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    columns = [col['name'] for col in insp.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    with op.batch_alter_table('topup_requests') as batch_op:
        if not _column_exists('topup_requests', 'currency'):
            batch_op.add_column(sa.Column('currency', sa.String(), nullable=False, server_default='USD'))
        if not _column_exists('topup_requests', 'reference_code'):
            batch_op.add_column(sa.Column('reference_code', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('topup_requests') as batch_op:
        if _column_exists('topup_requests', 'reference_code'):
            batch_op.drop_column('reference_code')
        if _column_exists('topup_requests', 'currency'):
            batch_op.drop_column('currency')
