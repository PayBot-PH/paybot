#!/usr/bin/env python
# -*- coding: utf-8 -*-
# @Desc   :

import asyncio
import importlib
import os
import pkgutil
from logging.config import fileConfig

import models
from alembic import context
from core.database import Base
from sqlalchemy import pool
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

# Automatically import all ORM models under Models
for _, module_name, _ in pkgutil.iter_modules(models.__path__):
    importlib.import_module(f"{models.__name__}.{module_name}")

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Read DATABASE_URL from environment variable
database_url = os.environ.get("DATABASE_URL")
if not database_url:
    # Fall back to settings default (e.g. SQLite for local dev)
    try:
        from core.config import settings as _settings
        database_url = _settings.database_url
    except (ImportError, AttributeError, Exception) as _e:
        import logging as _logging
        _logging.getLogger(__name__).warning("Could not load settings for database URL: %s", _e)
if database_url:
    import logging as _log
    _alembic_logger = _log.getLogger(__name__)

    # Strip stray whitespace / newlines that can appear in Railway env vars.
    database_url = database_url.strip()

    # Normalize postgres:// → postgresql:// (Railway uses the legacy scheme;
    # SQLAlchemy 2.0 no longer accepts it and raises a parse error).
    if database_url.startswith("postgres://"):
        database_url = "postgresql://" + database_url[len("postgres://"):]

    # Log the URL scheme for diagnostics without exposing credentials.
    _scheme = database_url.split("://")[0] if "://" in database_url else "<no-scheme>"
    _alembic_logger.info("Alembic database URL scheme: %s", _scheme)

    # Normalize to async driver.
    try:
        url = make_url(database_url)
    except Exception as _e:
        # Emit a clear message so Railway logs show the problem immediately.
        _alembic_logger.error(
            "Cannot parse DATABASE_URL (scheme=%s, length=%d, prefix=%r): %s",
            _scheme,
            len(database_url),
            database_url[:6],
            _e,
        )
        raise
    if url.drivername in ("postgresql", "postgres"):
        url = url.set(drivername="postgresql+asyncpg")
        database_url = str(url)
    elif url.drivername == "sqlite":
        url = url.set(drivername="sqlite+aiosqlite")
        database_url = str(url)
    config.set_main_option("sqlalchemy.url", database_url)

target_metadata = Base.metadata


def alembic_include_object(object, name, type_, reflected, compare_to):
    # type_ can be 'table', 'index', 'column', 'constraint'
    # ignore particular table_name
    if type_ == "table" and name in ["users", "sessions", "oidc_states"]:
        return False
    return True


def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        include_object=alembic_include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online():
    connectable = create_async_engine(config.get_main_option("sqlalchemy.url"), poolclass=pool.NullPool)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations():
    try:
        # If there is no event loop currently, use asyncio.run directly
        loop = asyncio.get_running_loop()
        loop.create_task(run_migrations_online())
    except RuntimeError:
        asyncio.run(run_migrations_online())


run_migrations()
