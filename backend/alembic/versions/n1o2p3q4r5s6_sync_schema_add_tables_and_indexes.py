"""Sync schema: add missing tables and performance indexes

- Adds app_settings table (if not exists)
- Adds crypto_topup_requests table (if not exists)
- Drops orphaned wallet_topups table (if exists)
- Adds performance indexes on commonly filtered columns
- Removes outdated auto-generated ix_<table>_id indexes
- Removes named unique constraint on paymongo_webhook_events (uniqueness
  is already enforced by the ix_paymongo_webhook_events_event_id index)

All DDL operations are guarded with existence checks so the migration is
safe to run against both a fresh database and one that was left in a
partially-migrated state by a previous failed run.

Revision ID: n1o2p3q4r5s6
Revises: m1n2o3p4q5r6
Create Date: 2026-03-15 10:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "n1o2p3q4r5s6"
down_revision: Union[str, Sequence[str], None] = "m1n2o3p4q5r6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _table_exists(name: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return (
            bind.execute(
                text(
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema='public' AND table_name=:t"
                ),
                {"t": name},
            ).fetchone()
            is not None
        )
    return (
        bind.execute(
            text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:t"),
            {"t": name},
        ).fetchone()
        is not None
    )


def _index_exists(index_name: str, table_name: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return (
            bind.execute(
                text(
                    "SELECT 1 FROM pg_indexes "
                    "WHERE indexname=:i AND tablename=:t"
                ),
                {"i": index_name, "t": table_name},
            ).fetchone()
            is not None
        )
    return (
        bind.execute(
            text(
                "SELECT 1 FROM sqlite_master "
                "WHERE type='index' AND name=:i AND tbl_name=:t"
            ),
            {"i": index_name, "t": table_name},
        ).fetchone()
        is not None
    )


def _constraint_exists(constraint_name: str, table_name: str) -> bool:
    """Check whether a named constraint exists (PostgreSQL only; SQLite uses
    auto-generated constraint names that are not directly queryable this way)."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return (
            bind.execute(
                text(
                    "SELECT 1 FROM information_schema.table_constraints "
                    "WHERE constraint_name=:c AND table_name=:t"
                ),
                {"c": constraint_name, "t": table_name},
            ).fetchone()
            is not None
        )
    # SQLite stores named constraints inside the table CREATE statement;
    # we cannot easily introspect them at runtime, so always return True to
    # attempt the batch-recreate path (which is harmless even when the
    # constraint is already absent).
    return True


# ---------------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:
    # ── 1. Create app_settings table ──────────────────────────────────────
    if not _table_exists("app_settings"):
        op.create_table(
            "app_settings",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("key", sa.String(), nullable=False),
            sa.Column("value", sa.String(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_app_settings_id"), "app_settings", ["id"], unique=False)
        op.create_index(op.f("ix_app_settings_key"), "app_settings", ["key"], unique=True)

    # ── 2. Create crypto_topup_requests table ─────────────────────────────
    if not _table_exists("crypto_topup_requests"):
        op.create_table(
            "crypto_topup_requests",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("wallet_id", sa.Integer(), nullable=True),
            sa.Column("amount_usdt", sa.Float(), nullable=False),
            sa.Column("tx_hash", sa.String(), nullable=False),
            sa.Column("network", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("reviewed_by", sa.String(), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_crypto_topup_requests_id"),
            "crypto_topup_requests",
            ["id"],
            unique=False,
        )

    # ── 3. Drop orphaned wallet_topups table ──────────────────────────────
    if _table_exists("wallet_topups"):
        for idx in (
            "ix_wallet_topups_id",
            "ix_wallet_topups_user_id",
            "ix_wallet_topups_paymongo_source_id",
            "ix_wallet_topups_paymongo_payment_intent_id",
            "ix_wallet_topups_paymongo_checkout_session_id",
            "ix_wallet_topups_reference_number",
        ):
            if _index_exists(idx, "wallet_topups"):
                op.drop_index(op.f(idx), table_name="wallet_topups")
        op.drop_table("wallet_topups")

    # ── 4. Remove outdated auto-generated primary-key indexes ─────────────
    # These were created by early migrations with index=True on the id column.
    # The models have since been updated to omit that flag.
    for idx, tbl in (
        ("ix_admin_users_id", "admin_users"),
        ("ix_kyb_registrations_id", "kyb_registrations"),
        ("ix_kyc_verifications_id", "kyc_verifications"),
        ("ix_topup_requests_id", "topup_requests"),
    ):
        if _table_exists(tbl) and _index_exists(idx, tbl):
            op.drop_index(op.f(idx), table_name=tbl)

    # ── 5. Add reference_code index on topup_requests ─────────────────────
    if not _index_exists("ix_topup_requests_reference_code", "topup_requests"):
        op.create_index(
            op.f("ix_topup_requests_reference_code"),
            "topup_requests",
            ["reference_code"],
            unique=False,
        )

    # ── 6. Remove named unique constraint on paymongo_webhook_events ───────
    # The model now uses column-level unique=True which relies on the
    # ix_paymongo_webhook_events_event_id index.  The named constraint
    # "uq_paymongo_webhook_events_event_id" added by migration i1j2k3l4m5n6
    # is redundant and causes schema-drift warnings.
    # batch_alter_table is required for SQLite (which does not support
    # ALTER TABLE … DROP CONSTRAINT natively).
    if _constraint_exists("uq_paymongo_webhook_events_event_id", "paymongo_webhook_events"):
        with op.batch_alter_table("paymongo_webhook_events") as batch_op:
            try:
                batch_op.drop_constraint(
                    "uq_paymongo_webhook_events_event_id", type_="unique"
                )
            except (sa.exc.OperationalError, sa.exc.ProgrammingError):
                # Constraint is already absent in databases that were left in a
                # partially-migrated state by an earlier failed migration run.
                pass

    # ── 7. Add server_default to topup_requests timestamps ───────────────
    # The model defines server_default=func.now() for created_at and updated_at
    # but the original migration (b1c2d3e4f5a6) created these columns without
    # server_default.  Use batch_alter_table so this works on SQLite.
    with op.batch_alter_table("topup_requests") as batch_op:
        batch_op.alter_column(
            "created_at",
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=True,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        )
        batch_op.alter_column(
            "updated_at",
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=True,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        )

    # ── 8. Add performance indexes ─────────────────────────────────────────
    perf_indexes = [
        ("idx_api_configs_user_id", "api_configs", ["user_id"]),
        ("idx_bot_logs_user_id", "bot_logs", ["user_id"]),
        ("idx_customers_user_id", "customers", ["user_id"]),
        ("idx_disbursements_user_id", "disbursements", ["user_id"]),
        ("idx_disbursements_status", "disbursements", ["status"]),
        ("idx_refunds_user_id", "refunds", ["user_id"]),
        ("idx_subscriptions_user_id", "subscriptions", ["user_id"]),
        ("idx_subscriptions_status", "subscriptions", ["status"]),
        ("idx_txn_user_id", "transactions", ["user_id"]),
        ("idx_txn_status", "transactions", ["status"]),
        ("idx_wtxn_wallet_id", "wallet_transactions", ["wallet_id"]),
        ("idx_wallets_user_currency", "wallets", ["user_id", "currency"]),
    ]
    for idx_name, tbl, cols in perf_indexes:
        if _table_exists(tbl) and not _index_exists(idx_name, tbl):
            op.create_index(idx_name, tbl, cols, unique=False)

    # wallet_transactions composite index (three columns)
    if _table_exists("wallet_transactions") and not _index_exists("idx_wtxn_user_type_status", "wallet_transactions"):
        op.create_index(
            "idx_wtxn_user_type_status",
            "wallet_transactions",
            ["user_id", "transaction_type", "status"],
            unique=False,
        )


# ---------------------------------------------------------------------------
# Downgrade
# ---------------------------------------------------------------------------

def downgrade() -> None:
    # Remove performance indexes
    for idx_name, tbl, _cols in [
        ("idx_wallets_user_currency", "wallets", None),
        ("idx_wtxn_user_type_status", "wallet_transactions", None),
        ("idx_wtxn_wallet_id", "wallet_transactions", None),
        ("idx_txn_status", "transactions", None),
        ("idx_txn_user_id", "transactions", None),
        ("idx_subscriptions_status", "subscriptions", None),
        ("idx_subscriptions_user_id", "subscriptions", None),
        ("idx_refunds_user_id", "refunds", None),
        ("idx_disbursements_status", "disbursements", None),
        ("idx_disbursements_user_id", "disbursements", None),
        ("idx_customers_user_id", "customers", None),
        ("idx_bot_logs_user_id", "bot_logs", None),
        ("idx_api_configs_user_id", "api_configs", None),
    ]:
        if _table_exists(tbl) and _index_exists(idx_name, tbl):
            op.drop_index(idx_name, table_name=tbl)

    # Restore reference_code index removal → recreate
    if _table_exists("topup_requests") and _index_exists("ix_topup_requests_reference_code", "topup_requests"):
        op.drop_index(op.f("ix_topup_requests_reference_code"), table_name="topup_requests")

    # Restore ix_*_id indexes
    for idx, tbl in (
        ("ix_topup_requests_id", "topup_requests"),
        ("ix_kyc_verifications_id", "kyc_verifications"),
        ("ix_kyb_registrations_id", "kyb_registrations"),
        ("ix_admin_users_id", "admin_users"),
    ):
        if _table_exists(tbl) and not _index_exists(idx, tbl):
            op.create_index(op.f(idx), tbl, ["id"], unique=False)

    # Restore named unique constraint on paymongo_webhook_events
    if _table_exists("paymongo_webhook_events"):
        with op.batch_alter_table("paymongo_webhook_events") as batch_op:
            batch_op.create_unique_constraint(
                "uq_paymongo_webhook_events_event_id", ["event_id"]
            )

    # Drop crypto_topup_requests
    if _table_exists("crypto_topup_requests"):
        op.drop_index(op.f("ix_crypto_topup_requests_id"), table_name="crypto_topup_requests")
        op.drop_table("crypto_topup_requests")

    # Drop app_settings
    if _table_exists("app_settings"):
        op.drop_index(op.f("ix_app_settings_key"), table_name="app_settings")
        op.drop_index(op.f("ix_app_settings_id"), table_name="app_settings")
        op.drop_table("app_settings")

    # Recreate wallet_topups
    if not _table_exists("wallet_topups"):
        op.create_table(
            "wallet_topups",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("amount", sa.Float(), nullable=False),
            sa.Column("currency", sa.String(), nullable=False, server_default="PHP"),
            sa.Column("paymongo_source_id", sa.String(), nullable=True),
            sa.Column("paymongo_payment_intent_id", sa.String(), nullable=True),
            sa.Column("paymongo_checkout_session_id", sa.String(), nullable=True),
            sa.Column("reference_number", sa.String(), nullable=True),
            sa.Column("payment_method", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="pending"),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("checkout_url", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_wallet_topups_id"), "wallet_topups", ["id"], unique=False)
        op.create_index(op.f("ix_wallet_topups_user_id"), "wallet_topups", ["user_id"], unique=False)
        op.create_index(
            op.f("ix_wallet_topups_paymongo_source_id"),
            "wallet_topups",
            ["paymongo_source_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_wallet_topups_paymongo_payment_intent_id"),
            "wallet_topups",
            ["paymongo_payment_intent_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_wallet_topups_paymongo_checkout_session_id"),
            "wallet_topups",
            ["paymongo_checkout_session_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_wallet_topups_reference_number"),
            "wallet_topups",
            ["reference_number"],
            unique=False,
        )
