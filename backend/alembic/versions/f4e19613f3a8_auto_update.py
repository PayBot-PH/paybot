"""auto update

Revision ID: f4e19613f3a8
Revises: f2a2bf750f7a
Create Date: 2026-02-18 05:07:55.765812

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = 'f4e19613f3a8'
down_revision: Union[str, Sequence[str], None] = 'f2a2bf750f7a'
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
    if not _table_exists('customers'):
        op.create_table('customers',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('total_payments', sa.Integer(), nullable=True),
        sa.Column('total_amount', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_customers_id'), 'customers', ['id'], unique=False)
    if not _table_exists('disbursements'):
        op.create_table('disbursements',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('external_id', sa.String(), nullable=True),
        sa.Column('xendit_id', sa.String(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(), nullable=True),
        sa.Column('bank_code', sa.String(), nullable=True),
        sa.Column('account_number', sa.String(), nullable=True),
        sa.Column('account_name', sa.String(), nullable=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('disbursement_type', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_disbursements_id'), 'disbursements', ['id'], unique=False)
    if not _table_exists('refunds'):
        op.create_table('refunds',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('transaction_id', sa.Integer(), nullable=True),
        sa.Column('external_id', sa.String(), nullable=True),
        sa.Column('xendit_id', sa.String(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('reason', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('refund_type', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_refunds_id'), 'refunds', ['id'], unique=False)
    if not _table_exists('subscriptions'):
        op.create_table('subscriptions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('plan_name', sa.String(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(), nullable=True),
        sa.Column('interval', sa.String(), nullable=True),
        sa.Column('customer_name', sa.String(), nullable=True),
        sa.Column('customer_email', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('next_billing_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('total_cycles', sa.Integer(), nullable=True),
        sa.Column('external_id', sa.String(), nullable=True),
        sa.Column('xendit_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_subscriptions_id'), 'subscriptions', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    if _table_exists('subscriptions'):
        op.drop_index(op.f('ix_subscriptions_id'), table_name='subscriptions')
        op.drop_table('subscriptions')
    if _table_exists('refunds'):
        op.drop_index(op.f('ix_refunds_id'), table_name='refunds')
        op.drop_table('refunds')
    if _table_exists('disbursements'):
        op.drop_index(op.f('ix_disbursements_id'), table_name='disbursements')
        op.drop_table('disbursements')
    if _table_exists('customers'):
        op.drop_index(op.f('ix_customers_id'), table_name='customers')
        op.drop_table('customers')
