"""auto update

Revision ID: 20732dd980d9
Revises: 
Create Date: 2026-02-18 04:33:22.340099

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '20732dd980d9'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    """Return True if the named table already exists (idempotency guard)."""
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
    """Upgrade schema."""
    if not _table_exists('api_configs'):
        op.create_table('api_configs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('config_key', sa.String(), nullable=False),
        sa.Column('config_value', sa.String(), nullable=False),
        sa.Column('service_name', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_api_configs_id'), 'api_configs', ['id'], unique=False)
    if not _table_exists('bot_logs'):
        op.create_table('bot_logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('log_type', sa.String(), nullable=False),
        sa.Column('message', sa.String(), nullable=False),
        sa.Column('telegram_chat_id', sa.String(), nullable=True),
        sa.Column('telegram_username', sa.String(), nullable=True),
        sa.Column('command', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_bot_logs_id'), 'bot_logs', ['id'], unique=False)
    if not _table_exists('bot_settings'):
        op.create_table('bot_settings',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('welcome_message', sa.String(), nullable=True),
        sa.Column('bot_status', sa.String(), server_default='inactive', nullable=True),
        sa.Column('webhook_url', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_bot_settings_id'), 'bot_settings', ['id'], unique=False)
    if not _table_exists('transactions'):
        op.create_table('transactions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('transaction_type', sa.String(), nullable=False),
        sa.Column('external_id', sa.String(), nullable=True),
        sa.Column('xendit_id', sa.String(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(), server_default='PHP', nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('customer_name', sa.String(), nullable=True),
        sa.Column('customer_email', sa.String(), nullable=True),
        sa.Column('payment_url', sa.String(), nullable=True),
        sa.Column('qr_code_url', sa.String(), nullable=True),
        sa.Column('telegram_chat_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_transactions_id'), 'transactions', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    if _table_exists('transactions'):
        op.drop_index(op.f('ix_transactions_id'), table_name='transactions')
        op.drop_table('transactions')
    if _table_exists('bot_settings'):
        op.drop_index(op.f('ix_bot_settings_id'), table_name='bot_settings')
        op.drop_table('bot_settings')
    if _table_exists('bot_logs'):
        op.drop_index(op.f('ix_bot_logs_id'), table_name='bot_logs')
        op.drop_table('bot_logs')
    if _table_exists('api_configs'):
        op.drop_index(op.f('ix_api_configs_id'), table_name='api_configs')
        op.drop_table('api_configs')