"""sync schema: drop wallet_topups, rename indexes

Revision ID: d4825d2e0284
Revises: b1a2n3k4d5e6
Create Date: 2026-03-22 04:27:42.484257

Brings the database schema in line with the current ORM models:
  - Drops the deprecated wallet_topups table (no longer referenced by any model or service)
  - Removes old ix_* index names created by earlier migrations and creates the
    new idx_* index names that match the current model __table_args__ declarations
  - Drops the named unique constraint on paymongo_webhook_events.event_id
    (replaced by the column-level unique=True index ix_paymongo_webhook_events_event_id)

All operations are guarded by existence checks so the migration is safe to run
on both fresh databases and existing Railway/Render PostgreSQL instances.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = 'd4825d2e0284'
down_revision: Union[str, Sequence[str], None] = 'b1a2n3k4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _dialect() -> str:
    return op.get_bind().dialect.name


def _table_exists(name: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return bind.execute(
            text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema='public' AND table_name=:t"
            ),
            {"t": name},
        ).fetchone() is not None
    return bind.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:t"), {"t": name}
    ).fetchone() is not None


def _index_exists(index_name: str, table_name: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return bind.execute(
            text("SELECT 1 FROM pg_indexes WHERE indexname = :n"),
            {"n": index_name},
        ).fetchone() is not None
    return bind.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='index' AND name=:n"),
        {"n": index_name},
    ).fetchone() is not None


def _constraint_exists(constraint_name: str, table_name: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return bind.execute(
            text(
                "SELECT 1 FROM information_schema.table_constraints "
                "WHERE constraint_name=:n AND table_name=:t"
            ),
            {"n": constraint_name, "t": table_name},
        ).fetchone() is not None
    # SQLite doesn't support named constraints in the same way; skip safely.
    return False


def upgrade() -> None:
    """Sync DB schema with current ORM models."""

    # ── 1. Drop deprecated wallet_topups table ────────────────────────────────
    if _table_exists("wallet_topups"):
        for idx in [
            "ix_wallet_topups_id",
            "ix_wallet_topups_user_id",
            "ix_wallet_topups_paymongo_source_id",
            "ix_wallet_topups_paymongo_payment_intent_id",
            "ix_wallet_topups_paymongo_checkout_session_id",
            "ix_wallet_topups_reference_number",
        ]:
            if _index_exists(idx, "wallet_topups"):
                op.drop_index(idx, table_name="wallet_topups")
        op.drop_table("wallet_topups")

    # ── 2. Drop named unique constraint on paymongo_webhook_events ────────────
    # The named constraint is superseded by the column-level unique index.
    if _constraint_exists("uq_paymongo_webhook_events_event_id", "paymongo_webhook_events"):
        op.drop_constraint(
            "uq_paymongo_webhook_events_event_id",
            "paymongo_webhook_events",
            type_="unique",
        )

    # ── 3. Drop old ix_* indexes and create new idx_* indexes ─────────────────

    # admin_users — generic auto-generated PK index no longer declared in model
    if _index_exists("ix_admin_users_id", "admin_users"):
        op.drop_index("ix_admin_users_id", table_name="admin_users")

    # api_configs
    if not _index_exists("idx_api_configs_user_id", "api_configs"):
        op.create_index("idx_api_configs_user_id", "api_configs", ["user_id"], unique=False)

    # bot_logs
    if not _index_exists("idx_bot_logs_user_id", "bot_logs"):
        op.create_index("idx_bot_logs_user_id", "bot_logs", ["user_id"], unique=False)

    # custom_roles
    if _index_exists("ix_custom_roles_id", "custom_roles"):
        op.drop_index("ix_custom_roles_id", table_name="custom_roles")

    # customers
    if not _index_exists("idx_customers_user_id", "customers"):
        op.create_index("idx_customers_user_id", "customers", ["user_id"], unique=False)

    # disbursements
    if not _index_exists("idx_disbursements_user_id", "disbursements"):
        op.create_index("idx_disbursements_user_id", "disbursements", ["user_id"], unique=False)
    if not _index_exists("idx_disbursements_status", "disbursements"):
        op.create_index("idx_disbursements_status", "disbursements", ["status"], unique=False)

    # kyb_registrations
    if _index_exists("ix_kyb_registrations_id", "kyb_registrations"):
        op.drop_index("ix_kyb_registrations_id", table_name="kyb_registrations")

    # kyc_verifications
    if _index_exists("ix_kyc_verifications_id", "kyc_verifications"):
        op.drop_index("ix_kyc_verifications_id", table_name="kyc_verifications")

    # refunds
    if not _index_exists("idx_refunds_user_id", "refunds"):
        op.create_index("idx_refunds_user_id", "refunds", ["user_id"], unique=False)

    # subscriptions
    if not _index_exists("idx_subscriptions_user_id", "subscriptions"):
        op.create_index("idx_subscriptions_user_id", "subscriptions", ["user_id"], unique=False)
    if not _index_exists("idx_subscriptions_status", "subscriptions"):
        op.create_index("idx_subscriptions_status", "subscriptions", ["status"], unique=False)

    # topup_requests
    if _index_exists("ix_topup_requests_id", "topup_requests"):
        op.drop_index("ix_topup_requests_id", table_name="topup_requests")

    # transactions — rename ix_* → idx_*
    for old_idx in (
        "ix_transactions_user_id",
        "ix_transactions_status",
        "ix_transactions_external_id",
    ):
        if _index_exists(old_idx, "transactions"):
            op.drop_index(old_idx, table_name="transactions")
    if not _index_exists("idx_txn_user_id", "transactions"):
        op.create_index("idx_txn_user_id", "transactions", ["user_id"], unique=False)
    if not _index_exists("idx_txn_status", "transactions"):
        op.create_index("idx_txn_status", "transactions", ["status"], unique=False)

    # wallet_transactions — rename ix_* → idx_*
    for old_idx in (
        "ix_wallet_transactions_wallet_id",
        "ix_wallet_transactions_user_status_type",
    ):
        if _index_exists(old_idx, "wallet_transactions"):
            op.drop_index(old_idx, table_name="wallet_transactions")
    if not _index_exists("idx_wtxn_wallet_id", "wallet_transactions"):
        op.create_index("idx_wtxn_wallet_id", "wallet_transactions", ["wallet_id"], unique=False)
    if not _index_exists("idx_wtxn_user_type_status", "wallet_transactions"):
        op.create_index(
            "idx_wtxn_user_type_status",
            "wallet_transactions",
            ["user_id", "transaction_type", "status"],
            unique=False,
        )

    # wallets — rename ix_* → idx_*
    if _index_exists("ix_wallets_user_id_currency", "wallets"):
        op.drop_index("ix_wallets_user_id_currency", table_name="wallets")
    if not _index_exists("idx_wallets_user_currency", "wallets"):
        op.create_index("idx_wallets_user_currency", "wallets", ["user_id", "currency"], unique=False)


def downgrade() -> None:
    """Revert schema sync: restore wallet_topups and original index names."""

    # ── wallets
    if _index_exists("idx_wallets_user_currency", "wallets"):
        op.drop_index("idx_wallets_user_currency", table_name="wallets")
    if not _index_exists("ix_wallets_user_id_currency", "wallets"):
        op.create_index("ix_wallets_user_id_currency", "wallets", ["user_id", "currency"], unique=False)

    # ── wallet_transactions
    if _index_exists("idx_wtxn_user_type_status", "wallet_transactions"):
        op.drop_index("idx_wtxn_user_type_status", table_name="wallet_transactions")
    if _index_exists("idx_wtxn_wallet_id", "wallet_transactions"):
        op.drop_index("idx_wtxn_wallet_id", table_name="wallet_transactions")
    if not _index_exists("ix_wallet_transactions_wallet_id", "wallet_transactions"):
        op.create_index("ix_wallet_transactions_wallet_id", "wallet_transactions", ["wallet_id"], unique=False)
    if not _index_exists("ix_wallet_transactions_user_status_type", "wallet_transactions"):
        op.create_index(
            "ix_wallet_transactions_user_status_type",
            "wallet_transactions",
            ["user_id", "status", "transaction_type"],
            unique=False,
        )

    # ── transactions
    if _index_exists("idx_txn_user_id", "transactions"):
        op.drop_index("idx_txn_user_id", table_name="transactions")
    if _index_exists("idx_txn_status", "transactions"):
        op.drop_index("idx_txn_status", table_name="transactions")
    if not _index_exists("ix_transactions_user_id", "transactions"):
        op.create_index("ix_transactions_user_id", "transactions", ["user_id"], unique=False)
    if not _index_exists("ix_transactions_status", "transactions"):
        op.create_index("ix_transactions_status", "transactions", ["status"], unique=False)
    if not _index_exists("ix_transactions_external_id", "transactions"):
        op.create_index("ix_transactions_external_id", "transactions", ["external_id"], unique=False)

    # ── topup_requests
    if not _index_exists("ix_topup_requests_id", "topup_requests"):
        op.create_index("ix_topup_requests_id", "topup_requests", ["id"], unique=False)

    # ── subscriptions
    if _index_exists("idx_subscriptions_user_id", "subscriptions"):
        op.drop_index("idx_subscriptions_user_id", table_name="subscriptions")
    if _index_exists("idx_subscriptions_status", "subscriptions"):
        op.drop_index("idx_subscriptions_status", table_name="subscriptions")

    # ── refunds
    if _index_exists("idx_refunds_user_id", "refunds"):
        op.drop_index("idx_refunds_user_id", table_name="refunds")

    # ── paymongo_webhook_events — restore named unique constraint
    if not _constraint_exists("uq_paymongo_webhook_events_event_id", "paymongo_webhook_events"):
        op.create_unique_constraint(
            "uq_paymongo_webhook_events_event_id",
            "paymongo_webhook_events",
            ["event_id"],
        )

    # ── kyc_verifications
    if not _index_exists("ix_kyc_verifications_id", "kyc_verifications"):
        op.create_index("ix_kyc_verifications_id", "kyc_verifications", ["id"], unique=False)

    # ── kyb_registrations
    if not _index_exists("ix_kyb_registrations_id", "kyb_registrations"):
        op.create_index("ix_kyb_registrations_id", "kyb_registrations", ["id"], unique=False)

    # ── disbursements
    if _index_exists("idx_disbursements_user_id", "disbursements"):
        op.drop_index("idx_disbursements_user_id", table_name="disbursements")
    if _index_exists("idx_disbursements_status", "disbursements"):
        op.drop_index("idx_disbursements_status", table_name="disbursements")

    # ── customers
    if _index_exists("idx_customers_user_id", "customers"):
        op.drop_index("idx_customers_user_id", table_name="customers")

    # ── custom_roles
    if not _index_exists("ix_custom_roles_id", "custom_roles"):
        op.create_index("ix_custom_roles_id", "custom_roles", ["id"], unique=False)

    # ── bot_logs
    if _index_exists("idx_bot_logs_user_id", "bot_logs"):
        op.drop_index("idx_bot_logs_user_id", table_name="bot_logs")

    # ── api_configs
    if _index_exists("idx_api_configs_user_id", "api_configs"):
        op.drop_index("idx_api_configs_user_id", table_name="api_configs")

    # ── admin_users
    if not _index_exists("ix_admin_users_id", "admin_users"):
        op.create_index("ix_admin_users_id", "admin_users", ["id"], unique=False)

    # ── Restore wallet_topups table
    if not _table_exists("wallet_topups"):
        op.create_table(
            "wallet_topups",
            sa.Column("id", sa.INTEGER(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.VARCHAR(), nullable=False),
            sa.Column("amount", sa.FLOAT(), nullable=False),
            sa.Column("currency", sa.VARCHAR(), server_default=sa.text("'PHP'"), nullable=False),
            sa.Column("paymongo_source_id", sa.VARCHAR(), nullable=True),
            sa.Column("paymongo_payment_intent_id", sa.VARCHAR(), nullable=True),
            sa.Column("paymongo_checkout_session_id", sa.VARCHAR(), nullable=True),
            sa.Column("reference_number", sa.VARCHAR(), nullable=True),
            sa.Column("payment_method", sa.VARCHAR(), nullable=True),
            sa.Column("status", sa.VARCHAR(), server_default=sa.text("'pending'"), nullable=False),
            sa.Column("description", sa.VARCHAR(), nullable=True),
            sa.Column("checkout_url", sa.VARCHAR(), nullable=True),
            sa.Column("created_at", sa.DATETIME(), nullable=True),
            sa.Column("updated_at", sa.DATETIME(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_wallet_topups_id", "wallet_topups", ["id"], unique=False)
        op.create_index("ix_wallet_topups_user_id", "wallet_topups", ["user_id"], unique=False)
        op.create_index("ix_wallet_topups_paymongo_source_id", "wallet_topups", ["paymongo_source_id"], unique=False)
        op.create_index("ix_wallet_topups_paymongo_payment_intent_id", "wallet_topups", ["paymongo_payment_intent_id"], unique=False)
        op.create_index("ix_wallet_topups_paymongo_checkout_session_id", "wallet_topups", ["paymongo_checkout_session_id"], unique=False)
        op.create_index("ix_wallet_topups_reference_number", "wallet_topups", ["reference_number"], unique=False)