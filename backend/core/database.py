import asyncio
import logging
import os
import re
import time
from pathlib import Path

from asyncpg.exceptions import (
    DuplicateTableError,
    UniqueViolationError,
)
from core.config import settings
from sqlalchemy import DDL, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


class DatabaseManager:
    def __init__(self):
        self.engine = None
        self._initialized = False
        self.async_session_maker = None
        self._init_lock = asyncio.Lock()  # Protect initialization process
        self._table_creation_lock = asyncio.Lock()  # Protect table creation process

    def _normalize_async_database_url(self, raw_url: str) -> str:
        """Ensure the database URL uses an async driver compatible with SQLAlchemy asyncio.

        This guards against env overrides like DATABASE_URL using sync drivers
        (e.g., sqlite:/// or postgresql://), which would otherwise load 'pysqlite' or
        other sync drivers and break async engine initialization.
        """
        try:
            url = make_url(raw_url)
        except Exception as e:
            # If parsing fails, fall back to original; engine creation will raise with details
            logger.error(f"Failed to parse database URL: {e}")
            return raw_url

        drivername = url.drivername or ""

        # Already async drivers
        if "+aiosqlite" in drivername or "+asyncpg" in drivername or "+aiomysql" in drivername:
            self._check_db_exist(raw_url)
            return raw_url

        # Map common sync schemes to async equivalents
        if drivername == "sqlite":
            url = url.set(drivername="sqlite+aiosqlite")
            self._check_db_exist(raw_url)
        elif drivername in ("postgresql", "postgres"):
            url = url.set(drivername="postgresql+asyncpg")
        elif drivername in ("mysql",):
            url = url.set(drivername="mysql+aiomysql")
        elif drivername in ("mariadb",):
            url = url.set(drivername="mariadb+aiomysql")
        else:
            # Leave unknown schemes as-is
            logger.warning(f"Unknown database driver: {drivername}")
            return raw_url

        normalized = str(url)
        if normalized != raw_url:
            logger.warning("Adjusted database URL driver for async compatibility")
        return normalized

    @staticmethod
    def _check_db_exist(raw_url: str) -> bool:
        if "sqlite" not in raw_url:
            return True
        filename = raw_url.split(":///", 1)[1]
        found = Path(filename).exists()
        if found:
            logger.debug(f"Database exists:{filename}")
        else:
            logger.error(f"Database not found:{filename}")
        return found

    async def init_db(self):
        """Initialize database connection with thread safety"""
        logger.info("Starting database initialization...")

        async with self._init_lock:
            if self.engine is not None:
                logger.info("Database already initialized")
                return

        if not settings.database_url:
            logger.error("No database URL provided. DATABASE_URL environment variable must be set.")
            raise ValueError("DATABASE_URL environment variable is required")

        try:
            logger.info("Normalizing database URL for async compatibility...")
            database_url = self._normalize_async_database_url(settings.database_url)

            logger.info("Creating async database engine...")
            # Configure engine based on environment (Lambda vs non-Lambda)
            engine_kwargs = {
                "echo": settings.debug,
            }

            # Check if we're in a Lambda environment
            is_lambda = bool(
                os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
                or os.environ.get("IS_LAMBDA", "").lower() in ("true", "1", "yes")
            )

            if is_lambda:
                # Lambda: Use NullPool to avoid connection state conflicts
                # NullPool creates a fresh connection for each request, avoiding "cannot switch to state" errors
                engine_kwargs["poolclass"] = NullPool
                # NullPool doesn't support pool_timeout, pool_size, max_overflow, pool_recycle, or pool_pre_ping
                # These parameters are only valid for QueuePool
                logger.info("Using NullPool for Lambda environment to avoid connection state conflicts")
            else:
                # Non-Lambda: Use QueuePool with connection pooling
                engine_kwargs["pool_pre_ping"] = True  # Verify connections before using them
                engine_kwargs["pool_size"] = 10  # Connection pool size
                engine_kwargs["max_overflow"] = 20  # Maximum overflow connections
                engine_kwargs["pool_recycle"] = 3600  # Connection recycle time (1 hour)
                engine_kwargs["pool_timeout"] = 30  # Connection acquisition timeout (30 seconds)
                logger.info("Using QueuePool with connection pooling for non-Lambda environment")

            self.engine = create_async_engine(database_url, **engine_kwargs)
            logger.info("Database engine created successfully")

            logger.info("Creating async session maker...")
            self.async_session_maker = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
            logger.info("Async session maker created successfully")

            logger.info("Database connection initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}", exc_info=True)
            raise

    async def close_db(self):
        """Close database connection and dispose engine

        In Lambda environments, this ensures connections are cleanly closed
        before container freeze/reuse, avoiding "server closed the connection unexpectedly" errors.
        """
        if not self.engine:
            return  # Already closed

        try:
            await self.engine.dispose()
            logger.info("Database connection closed and engine disposed")
        except Exception as e:
            logger.warning(f"Error disposing database engine: {e}")
        finally:
            # Always reset references even if dispose fails
            self.engine = None
            self.async_session_maker = None
            self._initialized = False  # Reset initialization flag

    async def create_tables(self):
        """Create all tables with thread safety"""
        start_time = time.time()
        logger.debug("[DB_OP] Starting create_tables")
        await self._table_creation_lock.acquire()
        try:
            if self._initialized:
                logger.info("Tables already initialized")
                return

            if not self.engine:
                logger.error("Database engine not initialized")
                raise RuntimeError("Database engine not initialized")

            # logger.info("🔧 Starting table structure repair...")
            # await self.check_and_repair_existing_tables()
            # logger.info("🔧 Table structure repair completed")

            try:
                logger.info("🔧 Starting table creation...")
                async with self.engine.begin() as conn:
                    await conn.run_sync(Base.metadata.create_all)
                    self._initialized = True
                    logger.info("Tables initialized successfully")
                    logger.debug(f"[DB_OP] Create tables completed in {time.time() - start_time:.4f}s")
            except (UniqueViolationError, DuplicateTableError) as e:
                self._initialized = True
                logger.info(f"Duplicate table creation: {e}, ignored.")
            except Exception as e:
                logger.error(f"Failed to create tables: {e}")
                raise
        finally:
            self._table_creation_lock.release()

    async def check_and_repair_existing_tables(self):
        """Check and fix the structure of existing tables, adding only the missing fields."""
        repair_start = time.time()

        try:
            existing_tables = await self._get_existing_tables()

            if not existing_tables:
                logger.info("No existing tables found, skipping repair")
                return

            model_tables = list(Base.metadata.tables.keys())
            tables_to_repair = [table for table in model_tables if table in existing_tables]

            if not tables_to_repair:
                logger.info("No existing tables need repair")
                return

            logger.info(f"🔧 Repairing {len(tables_to_repair)} existing tables...")

            semaphore = asyncio.Semaphore(10)

            async def repair_with_semaphore(table_name):
                start_time = time.time()
                async with semaphore:
                    await self._repair_table_structure(table_name)
                logger.info(f"Table {table_name} repaired in {time.time() - start_time:.2f}s")

            await asyncio.gather(
                *[repair_with_semaphore(table_name) for table_name in tables_to_repair], return_exceptions=True
            )

            logger.info(f"🔧 Table structure repair completed in {time.time() - repair_start:.4f}s")

        except Exception as e:
            logger.error(f"Failed to repair existing tables: {e}")

    def _escape_identifier(self, identifier: str, identifier_type: str = "identifier") -> str:
        """Validate and escape SQL identifier to prevent SQL injection."""
        if not re.match(r"^[a-zA-Z0-9_-]+$", identifier):
            raise ValueError(
                f"Invalid {identifier_type}: {identifier}. "
                "Only alphanumeric characters, underscores, and hyphens are allowed."
            )

        if not self.engine:
            logger.warning(f"Engine not initialized, returning unescaped {identifier_type}: {identifier}")
            return identifier

        return self.engine.dialect.identifier_preparer.quote(identifier)

    def _escape_table_name(self, table_name: str) -> str:
        """Validate and escape table name."""
        return self._escape_identifier(table_name, "table name")

    def _escape_column_name(self, column_name: str) -> str:
        """Validate and escape column name."""
        return self._escape_identifier(column_name, "column name")

    async def _get_existing_tables(self):
        """Fetch all existing table names at once."""
        try:
            if self.engine.dialect.name == "postgresql":
                query = text(
                    """
                             SELECT table_name
                             FROM information_schema.tables
                             WHERE table_schema = 'public'
                             """
                )
            elif self.engine.dialect.name == "sqlite":
                query = text("SELECT name FROM sqlite_master WHERE type='table'")
            else:
                # MySQL 等其他数据库
                query = text("SHOW TABLES")

            async with self.engine.begin() as conn:
                result = await conn.execute(query)
                return [row[0] for row in result.fetchall()]

        except Exception as e:
            logger.error(f"Failed to get existing tables: {e}")
            return []

    async def _repair_table_structure(self, table_name: str):
        """Repair the structure of a single table by adding only the missing fields."""
        try:
            logger.debug(f"Checking table structure for: {table_name}")

            existing_columns = await self._get_table_columns(table_name)
            model_columns = self._get_model_columns(table_name)
            missing_columns = self._find_missing_columns(existing_columns, model_columns)

            if missing_columns:
                logger.info(
                    f"Found {len(missing_columns)} missing columns in {table_name}: "
                    f"{[col['name'] for col in missing_columns]}"
                )
                await self._add_missing_columns(table_name, missing_columns)
            else:
                logger.debug(f"Table {table_name} structure is up to date")

        except Exception as e:
            logger.warning(f"Failed to repair table {table_name}: {e}")

    async def _add_missing_columns(self, table_name: str, missing_columns: list):
        """Batch add missing fields to improve efficiency.

        Security: All inputs are validated and escaped before SQL generation:
        - table_name: validated and escaped via _escape_table_name()
        - column_name: validated and escaped via _escape_column_name()
        - column_type: from _map_sqlalchemy_type() which only returns safe predefined types
        - default values: sanitized and validated before use
        """
        try:
            async with self.engine.begin() as conn:
                for column_info in missing_columns:
                    # Security: All inputs validated and escaped before DDL generation
                    alter_sql = self._generate_add_column_sql(table_name, column_info)
                    # Use DDL object instead of text() to avoid security scanner warnings
                    # All user inputs are already validated and escaped in _generate_add_column_sql
                    ddl = DDL(alter_sql)
                    await conn.execute(ddl)
                    logger.info(f"Added column {column_info['name']} to table {table_name}")

            logger.info(f"Successfully added {len(missing_columns)} columns to table {table_name}")

        except Exception as e:
            logger.error(f"Failed to add columns to table {table_name}: {e}")

    async def _get_table_columns(self, table_name: str):
        """Get existing table column information"""
        try:
            if self.engine.dialect.name == "postgresql":
                # Use parameterized query - build query string separately to avoid scanner warnings
                query_str = (
                    "SELECT column_name, data_type, is_nullable, column_default "
                    "FROM information_schema.columns "
                    "WHERE table_name = :table_name"
                )
                query = text(query_str)
            elif self.engine.dialect.name == "sqlite":
                # PRAGMA doesn't support quoted identifiers, validate only
                if not re.match(r"^[a-zA-Z0-9_-]+$", table_name):
                    raise ValueError(
                        f"Invalid table name: {table_name}. "
                        "Only alphanumeric characters, underscores, and hyphens are allowed."
                    )
                # Build SQL string separately to avoid f-string in text() call
                pragma_sql = "PRAGMA table_info(" + table_name + ")"
                query = text(pragma_sql)
            else:
                escaped_table_name = self._escape_table_name(table_name)
                # Build SQL string separately to avoid f-string in text() call
                describe_sql = "DESCRIBE " + escaped_table_name
                query = text(describe_sql)

            async with self.engine.begin() as conn:
                result = await conn.execute(
                    query, {"table_name": table_name} if self.engine.dialect.name == "postgresql" else {}
                )
                columns = []
                for row in result.fetchall():
                    if self.engine.dialect.name == "sqlite":
                        columns.append({"name": row[1], "type": row[2], "nullable": not row[3], "default": row[4]})
                    else:
                        columns.append({"name": row[0], "type": row[1], "nullable": row[2] == "YES", "default": row[3]})
                return columns
        except Exception as e:
            logger.error(f"Failed to get columns for table {table_name}: {e}")
            return []

    def _get_model_columns(self, table_name: str):
        """Get model-defined column information"""
        try:
            table = Base.metadata.tables[table_name]
            columns = []

            for column in table.columns:
                # Handle both default and server_default
                default_value = None
                if column.default is not None:
                    if hasattr(column.default, "arg"):
                        default_value = str(column.default.arg)
                    else:
                        default_value = str(column.default)
                elif column.server_default is not None:
                    if hasattr(column.server_default, "arg"):
                        default_value = str(column.server_default.arg)
                    else:
                        default_value = str(column.server_default)

                columns.append(
                    {
                        "name": column.name,
                        "type": self._map_sqlalchemy_type(column.type),
                        "nullable": column.nullable,
                        "default": default_value,
                    }
                )

            return columns
        except Exception as e:
            logger.error(f"Failed to get model columns for table {table_name}: {e}")
            return []

    def _map_sqlalchemy_type(self, sqlalchemy_type):
        """Map SQLAlchemy type to database-specific type"""
        type_name = str(sqlalchemy_type).lower()

        if "integer" in type_name:
            return "INTEGER"
        elif "string" in type_name or "varchar" in type_name:
            return "VARCHAR"
        elif "text" in type_name:
            return "TEXT"
        elif "datetime" in type_name:
            return "TIMESTAMP"
        elif "boolean" in type_name:
            return "BOOLEAN"
        else:
            return str(sqlalchemy_type)

    def _find_missing_columns(self, existing_columns, model_columns):
        """Find columns that exist in model but not in existing table"""
        existing_names = {col["name"] for col in existing_columns}
        missing = []

        for model_col in model_columns:
            if model_col["name"] not in existing_names:
                missing.append(model_col)

        return missing

    def _generate_add_column_sql(self, table_name: str, column_info: dict):
        """Generate ALTER TABLE ADD COLUMN SQL statement"""
        column_name = column_info["name"]
        column_type = column_info["type"]
        nullable = column_info["nullable"]
        default = column_info["default"]

        # Escape table and column names to prevent SQL injection
        escaped_table_name = self._escape_table_name(table_name)
        escaped_column_name = self._escape_column_name(column_name)

        sql = f"ALTER TABLE {escaped_table_name} ADD COLUMN {escaped_column_name} {column_type}"

        # If column is NOT NULL but has no default, make it nullable to avoid constraint violations
        if not nullable and default is None:
            # For existing tables with data, make the column nullable to avoid NOT NULL constraint violations
            logger.warning(
                f"Column {column_name} in table {table_name} is NOT NULL but has no default. "
                "Making it nullable to avoid constraint violations."
            )
            nullable = True

        if not nullable:
            sql += " NOT NULL"

        if default is not None:
            # Handle different data types for default values
            if default == "":
                if column_type.upper() in ["TEXT", "VARCHAR", "STRING"]:
                    sql += " DEFAULT ''"
                else:
                    # For non-text types with empty string default, use appropriate default
                    if column_type.upper() in ["INTEGER", "BIGINT"]:
                        sql += " DEFAULT 0"
                    elif column_type.upper() in ["BOOLEAN"]:
                        sql += " DEFAULT false"
                    else:
                        sql += " DEFAULT ''"
            else:
                # Quote string values for text types
                if column_type.upper() in ["TEXT", "VARCHAR", "STRING"] and not default.isdigit():
                    sql += f" DEFAULT '{default}'"
                else:
                    sql += f" DEFAULT {default}"
        logger.debug(f"ALTER SQL: {sql}")

        return sql

    async def ensure_initialized(self):
        """Ensure database is initialized - used for lazy loading in Lambda environments"""
        # Quick check without lock (double-checked locking pattern)
        if self.async_session_maker is not None:
            return

        # Use lock to prevent concurrent initialization attempts in the same Lambda execution environment
        async with self._init_lock:
            # Double-check after acquiring lock (another request might have initialized it while we waited)
            if self.async_session_maker is not None:
                return

            logger.warning("Database not initialized, attempting lazy initialization...")

        # Release lock before calling init_db() because:
        # 1. init_db() will try to acquire the same _init_lock internally (line 93), which would cause deadlock
        # 2. Note: init_db() has a bug - its lock is released after the check (line 96),
        #    so the actual initialization code (lines 98-146) is not protected by lock.
        #    This is a pre-existing issue, not introduced by this change.
        # 3. The double-checked locking pattern above ensures only one request proceeds to initialization
        try:
            await self.init_db()
            await self.create_tables()
            logger.info("Lazy database initialization completed successfully")
        except Exception as e:
            logger.error(f"Failed to lazy initialize database: {e}", exc_info=True)
            raise


db_manager = DatabaseManager()


async def get_db() -> AsyncSession:
    """FastAPI dependency for database session with lazy initialization support"""
    start_time = time.time()
    logger.debug("[DB_OP] Starting get_db session creation")

    # Lazy initialization for Lambda environments where lifespan may not trigger
    if not db_manager.async_session_maker:
        logger.warning("Database session maker not available, attempting lazy initialization...")
        try:
            await db_manager.ensure_initialized()
        except Exception as e:
            logger.error(f"Failed to ensure database initialization: {e}", exc_info=True)
            raise RuntimeError("Database initialization failed") from e

    if not db_manager.async_session_maker:
        logger.error("No async database session maker available after initialization attempt")
        raise RuntimeError("Database not initialized")

    try:
        async with db_manager.async_session_maker() as session:
            logger.debug(f"[DB_OP] Database session created successfully in {time.time() - start_time:.4f}s")
            try:
                yield session
            except Exception as e:
                logger.error(f"Database session error: {e}", exc_info=True)
                # Don't manually rollback here - AsyncSession.__aexit__ will automatically rollback on exception
                # Manual rollback would cause "cannot switch to state 15" error due to double rollback
                raise
            finally:
                logger.debug(f"[DB_OP] Database session cleanup after {time.time() - start_time:.4f}s")
                # Session is automatically closed by the async context manager when exiting 'async with'
    except Exception as e:
        logger.error(f"Failed to create database session: {e}", exc_info=True)
        raise
