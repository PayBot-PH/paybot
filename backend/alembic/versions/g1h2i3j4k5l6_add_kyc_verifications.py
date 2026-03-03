"""add kyc_verifications table

Revision ID: g1h2i3j4k5l6
Revises: c3d4e5f6a1b2
Create Date: 2026-03-01 04:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision: str = 'g1h2i3j4k5l6'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        return bind.execute(
            text("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=:t"),
            {"t": name},
        ).fetchone() is not None
    return bind.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:t"), {"t": name}
    ).fetchone() is not None


def upgrade() -> None:
    if not _table_exists('kyc_verifications'):
        op.create_table(
            'kyc_verifications',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('chat_id', sa.String(length=64), nullable=False),
            sa.Column('telegram_username', sa.String(length=128), nullable=True),
            sa.Column('step', sa.String(length=32), nullable=False, server_default='full_name'),
            sa.Column('full_name', sa.String(length=256), nullable=True),
            sa.Column('date_of_birth', sa.String(length=32), nullable=True),
            sa.Column('nationality', sa.String(length=128), nullable=True),
            sa.Column('id_type', sa.String(length=64), nullable=True),
            sa.Column('id_number', sa.String(length=128), nullable=True),
            sa.Column('id_photo_file_id', sa.String(length=256), nullable=True),
            sa.Column('selfie_file_id', sa.String(length=256), nullable=True),
            sa.Column('status', sa.String(length=32), nullable=False, server_default='in_progress'),
            sa.Column('rejection_reason', sa.String(length=512), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_kyc_verifications_id'), 'kyc_verifications', ['id'], unique=False)
        op.create_index(op.f('ix_kyc_verifications_chat_id'), 'kyc_verifications', ['chat_id'], unique=True)


def downgrade() -> None:
    if _table_exists('kyc_verifications'):
        op.drop_index(op.f('ix_kyc_verifications_chat_id'), table_name='kyc_verifications')
        op.drop_index(op.f('ix_kyc_verifications_id'), table_name='kyc_verifications')
        op.drop_table('kyc_verifications')
