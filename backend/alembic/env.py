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

# connect_args to pass to create_async_engine (used for SSL on PostgreSQL)
_engine_connect_args: dict = {}

if database_url:
    import logging as _log
    _alembic_logger = _log.getLogger(__name__)

    # Strip stray whitespace / newlines that can appear in Railway/Render env vars.
    database_url = database_url.strip()

    # Normalize postgres:// → postgresql:// (legacy scheme not accepted by SQLAlchemy 2.0)
    if database_url.startswith("postgres://"):
        database_url = "postgresql://" + database_url[len("postgres://"):]

    # Log the URL scheme for diagnostics without exposing credentials.
    _scheme = database_url.split("://")[0] if "://" in database_url else "<no-scheme>"
    _alembic_logger.info("Alembic database URL scheme: %s", _scheme)

    # Normalize to async driver.
    try:
        url = make_url(database_url)
    except Exception as _e:
        _alembic_logger.error(
            "Cannot parse DATABASE_URL (scheme=%s, length=%d, prefix=%r): %s",
            _scheme,
            len(database_url),
            database_url[:6],
            _e,
        )
        # DATABASE_URL is malformed – try DATABASE_PUBLIC_URL before giving up.
        try:
            from core.config import settings as _cfg
            _fallback = _cfg.database_public_url.strip()
        except Exception:
            _fallback = os.environ.get("DATABASE_PUBLIC_URL", "").strip()
        if _fallback:
            if _fallback.startswith("postgres://"):
                _fallback = "postgresql://" + _fallback[len("postgres://"):]
            try:
                url = make_url(_fallback)
                database_url = _fallback
                _alembic_logger.warning("Fell back to DATABASE_PUBLIC_URL for Alembic migrations")
            except Exception as _fe:
                _alembic_logger.error("DATABASE_PUBLIC_URL is also unparseable: %s", _fe)
                raise _e
        else:
            raise
    if url.drivername in ("postgresql", "postgres"):
        url = url.set(drivername="postgresql+asyncpg")

        # asyncpg does not accept libpq query parameters — strip them all.
        # sslmode is captured so we can honour an explicit 'disable' request.
        _query = dict(url.query)
        _sslmode = _query.pop("sslmode", None)
        for _libpq_param in ("sslcert", "sslkey", "sslrootcert", "sslcrl", "gssencmode", "channel_binding"):
            _query.pop(_libpq_param, None)
        url = url.set(query=_query)
        database_url = url.render_as_string(hide_password=False)

        # Determine whether to use SSL.
        # Use asyncpg's built-in ssl='prefer' mode for all non-local, non-disabled
        # connections.  This attempts TLS but gracefully falls back to an
        # unencrypted connection when the server declines (e.g. Railway internal),
        # avoiding the ssl_is_advisory=False trap from passing a custom SSLContext
        # in asyncpg >= 0.30 which made SSL mandatory and broke Render deploys.
        _host = str(url.host or "")
        _is_local = _host in ("localhost", "127.0.0.1", "::1", "") or _host.endswith(".local")
        _wants_ssl = not _is_local and _sslmode != "disable"

        if _wants_ssl:
            # ssl='prefer': attempt TLS (no cert verification), fall back to
            # plaintext if the server declines — works for Render, Railway, etc.
            _engine_connect_args["ssl"] = "prefer"
            _alembic_logger.info(
                "asyncpg: ssl=prefer for host=%s (sslmode=%s)", _host, _sslmode or "not-set"
            )
    elif url.drivername == "sqlite":
        url = url.set(drivername="sqlite+aiosqlite")
        database_url = url.render_as_string(hide_password=False)
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
    # Merge connect_timeout into connect_args so asyncpg doesn't hang on an
    # unreachable DB host (e.g. Railway PostgreSQL not yet ready at boot).
    _ca = dict(_engine_connect_args)
    _url = config.get_main_option("sqlalchemy.url") or ""
    if "postgresql" in _url or "postgres" in _url:
        _ca.setdefault("timeout", 30)  # asyncpg: give up after 30s
    connectable = create_async_engine(
        _url,
        poolclass=pool.NullPool,
        connect_args=_ca,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations():
    asyncio.run(run_migrations_online())


run_migrations()
