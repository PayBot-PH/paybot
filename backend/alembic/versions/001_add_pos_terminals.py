"""
Alembic migration for POS Terminal feature
Add pos_terminals, pos_terminal_requests, and pos_terminal_transactions tables
"""
revision = '001_add_pos_terminals'
down_revision = 'd4825d2e0284'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    # 1. Create or Update pos_terminals
    if 'pos_terminals' not in tables:
        op.create_table(
            'pos_terminals',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('terminal_code', sa.String(length=50), nullable=False),
            sa.Column('terminal_name', sa.String(length=255), nullable=False),
            sa.Column('device_id', sa.String(length=255), nullable=True),
            sa.Column('last_device_id', sa.String(length=255), nullable=True),
            sa.Column('operator_pin', sa.String(length=255), nullable=True),
            sa.Column('authorized_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('user_id', sa.String(length=64), nullable=False),
            sa.Column('merchant_id', sa.String(length=64), nullable=True),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('is_t0_settlement', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('enabled_payment_methods', sa.JSON(), nullable=False),
            sa.Column('daily_transaction_limit', sa.Integer(), nullable=True),
            sa.Column('max_transaction_amount', sa.Integer(), nullable=True),
            sa.Column('location', sa.String(length=255), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('assigned_by', sa.String(length=64), nullable=True),
            sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('deactivated_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('terminal_code')
        )
        op.create_index('idx_terminal_code', 'pos_terminals', ['terminal_code'])
        op.create_index('idx_terminal_user_id', 'pos_terminals', ['user_id'])
        op.create_index('idx_terminal_status', 'pos_terminals', ['status'])
        op.create_index('idx_terminal_device_id', 'pos_terminals', ['device_id'])
    else:
        # Table exists, ensure all columns are present
        cols = [c['name'] for c in inspector.get_columns('pos_terminals')]
        if 'device_id' not in cols:
            op.add_column('pos_terminals', sa.Column('device_id', sa.String(length=255), nullable=True))
        if 'last_device_id' not in cols:
            op.add_column('pos_terminals', sa.Column('last_device_id', sa.String(length=255), nullable=True))
        if 'operator_pin' not in cols:
            op.add_column('pos_terminals', sa.Column('operator_pin', sa.String(length=255), nullable=True))
        if 'authorized_at' not in cols:
            op.add_column('pos_terminals', sa.Column('authorized_at', sa.DateTime(timezone=True), nullable=True))
        if 'is_t0_settlement' not in cols:
            op.add_column('pos_terminals', sa.Column('is_t0_settlement', sa.Boolean(), nullable=False, server_default='false'))
        if 'merchant_id' not in cols:
            op.add_column('pos_terminals', sa.Column('merchant_id', sa.String(length=64), nullable=True))
        if 'description' not in cols:
            op.add_column('pos_terminals', sa.Column('description', sa.Text(), nullable=True))
        if 'assigned_by' not in cols:
            op.add_column('pos_terminals', sa.Column('assigned_by', sa.String(length=64), nullable=True))
        if 'assigned_at' not in cols:
            op.add_column('pos_terminals', sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=True))

    # 2. pos_terminal_devices
    if 'pos_terminal_devices' not in tables:
        op.create_table(
            'pos_terminal_devices',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('device_id', sa.String(length=255), nullable=False),
            sa.Column('brand', sa.String(length=100), nullable=True),
            sa.Column('model', sa.String(length=100), nullable=True),
            sa.Column('os_version', sa.String(length=50), nullable=True),
            sa.Column('app_version', sa.String(length=50), nullable=True),
            sa.Column('is_authorized', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('last_seen_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('metadata_json', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('device_id')
        )
        op.create_index('idx_device_identifier', 'pos_terminal_devices', ['device_id'])

    # 3. pos_terminal_requests
    if 'pos_terminal_requests' not in tables:
        op.create_table(
            'pos_terminal_requests',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.String(length=64), nullable=False),
            sa.Column('user_name', sa.String(length=255), nullable=False),
            sa.Column('user_email', sa.String(length=255), nullable=True),
            sa.Column('user_phone', sa.String(length=20), nullable=True),
            sa.Column('business_name', sa.String(length=255), nullable=False),
            sa.Column('business_type', sa.String(length=100), nullable=True),
            sa.Column('location', sa.String(length=255), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('required_payment_methods', sa.JSON(), nullable=False),
            sa.Column('monthly_transaction_volume', sa.Integer(), nullable=True),
            sa.Column('average_transaction_amount', sa.Integer(), nullable=True),
            sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
            sa.Column('rejection_reason', sa.Text(), nullable=True),
            sa.Column('assigned_terminal_id', sa.Integer(), nullable=True),
            sa.Column('reviewed_by', sa.String(length=64), nullable=True),
            sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('idx_request_user_id', 'pos_terminal_requests', ['user_id'])
        op.create_index('idx_request_status', 'pos_terminal_requests', ['status'])

    # 4. pos_terminal_transactions
    if 'pos_terminal_transactions' not in tables:
        op.create_table(
            'pos_terminal_transactions',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('terminal_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.String(length=64), nullable=False),
            sa.Column('order_id', sa.String(length=100), nullable=False),
            sa.Column('description', sa.String(length=255), nullable=False),
            sa.Column('amount', sa.Integer(), nullable=False),
            sa.Column('currency', sa.String(length=3), nullable=False, server_default='PHP'),
            sa.Column('payment_method', sa.String(length=50), nullable=False),
            sa.Column('maya_checkout_id', sa.String(length=255), nullable=True),
            sa.Column('paymongo_checkout_id', sa.String(length=255), nullable=True),
            sa.Column('xendit_invoice_id', sa.String(length=255), nullable=True),
            sa.Column('payment_url', sa.String(length=2048), nullable=True),
            sa.Column('customer_name', sa.String(length=255), nullable=True),
            sa.Column('customer_email', sa.String(length=255), nullable=True),
            sa.Column('customer_phone', sa.String(length=20), nullable=True),
            sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
            sa.Column('failure_reason', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('order_id')
        )
        op.create_index('idx_pos_txn_terminal_id', 'pos_terminal_transactions', ['terminal_id'])
        op.create_index('idx_pos_txn_user_id', 'pos_terminal_transactions', ['user_id'])
        op.create_index('idx_pos_txn_status', 'pos_terminal_transactions', ['status'])


def downgrade() -> None:
    op.drop_table('pos_terminal_transactions')
    op.drop_table('pos_terminal_requests')
    op.drop_table('pos_terminal_devices')
    op.drop_table('pos_terminals')
