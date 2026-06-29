"""add unique constraint for api_configs service+key

Revision ID: add_uq_api_configs_service_key
Revises: f4e19613f3a8
Create Date: 2026-06-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = 'add_uq_api_configs_service_key'
down_revision = 'f4e19613f3a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    # This migration aims to ensure uniqueness on (service_name, config_key).
    # Strategy:
    # 1) Remove duplicate rows, keeping the row with the highest id for each pair.
    # 2) Create a unique index on (service_name, config_key) if not exists.

    if dialect == 'postgresql':
        # Delete duplicates keeping max(id)
        op.execute(text("""
        DELETE FROM api_configs a
        USING api_configs b
        WHERE a.service_name = b.service_name
          AND a.config_key = b.config_key
          AND a.id < b.id;
        """))
        # Create unique index if missing
        op.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind = 'i' AND c.relname = 'uq_api_configs_service_key'
            ) THEN
                CREATE UNIQUE INDEX uq_api_configs_service_key ON api_configs (service_name, config_key);
            END IF;
        END$$;
        """))
    else:
        # Fallback: SQLite and others support CREATE UNIQUE INDEX IF NOT EXISTS
        try:
            op.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_api_configs_service_key ON api_configs (service_name, config_key);"))
        except Exception:
            # best-effort: if table missing or index creation fails, raise to surface problem
            raise


def downgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect == 'postgresql':
        op.execute(text("DROP INDEX IF EXISTS uq_api_configs_service_key"))
    else:
        op.execute(text("DROP INDEX IF EXISTS uq_api_configs_service_key"))
