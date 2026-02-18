import asyncio
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

from core.database import db_manager
from sqlalchemy import Date, DateTime, MetaData, Table, func, select
from sqlalchemy.exc import NoSuchTableError, SQLAlchemyError

logger = logging.getLogger(__name__)

MOCK_DATA_DIR = Path(__file__).resolve().parent.parent / "mock_data"
MAX_CONCURRENT_LOADS = 5


async def initialize_mock_data():
    """Populate tables with mock JSON data when they are empty."""
    if "MGX_IGNORE_INIT_DATA" in os.environ:
        logger.info("Ignore initialize data")
        return
    if not db_manager.engine:
        logger.warning("Database engine is not ready; skipping mock data initialization")
        return

    if not MOCK_DATA_DIR.exists():
        logger.info("mock_data directory not found, skipping mock initialization")
        return

    data_files = sorted(MOCK_DATA_DIR.glob("*.json"))
    if not data_files:
        logger.info("No mock JSON files detected; skipping mock initialization")
        return

    semaphore = asyncio.Semaphore(MAX_CONCURRENT_LOADS)

    async def load_file(data_file: Path):
        async with semaphore:
            try:
                await _load_table_from_file(data_file)
            except Exception as exc:  # pragma: no cover - defensive
                logger.error("Unexpected error loading %s: %s", data_file.name, exc)

    await asyncio.gather(*(load_file(data_file) for data_file in data_files))


def _prepare_records(raw_data: Any, table: Table) -> list[dict[str, Any]]:
    """Filter JSON payload to match the table definition and coerce values."""
    if isinstance(raw_data, dict):
        records_iterable: Iterable[dict[str, Any]] = [raw_data]
    elif isinstance(raw_data, list):
        records_iterable = [item for item in raw_data if isinstance(item, dict)]
    else:
        return []

    column_map = {column.name: column for column in table.columns}
    prepared: list[dict[str, Any]] = []

    for entry in records_iterable:
        filtered = {}
        for key, value in entry.items():
            if key not in column_map:
                continue
            column = column_map[key]
            typed_value = _coerce_temporal_value(value, column)
            filtered[key] = _coerce_value(typed_value, column)
        if filtered:
            prepared.append(filtered)

    return prepared


def _coerce_temporal_value(value: Any, column) -> Any:
    """Convert ISO-like strings to Date/DateTime objects when needed."""
    if value is None or not isinstance(value, str):
        return value

    column_type = column.type
    if isinstance(column_type, Date):
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            return value

    if isinstance(column_type, DateTime):
        val_wo_z = value.replace("Z", "+00:00")
        for parser in (lambda v: datetime.fromisoformat(v), lambda v: datetime.strptime(v, "%Y-%m-%d %H:%M:%S")):
            try:
                return parser(val_wo_z)
            except ValueError:
                continue
        return value

    return value


def _coerce_value(value: Any, column) -> Any:
    """Coerce nested structures to JSON strings when the column is not JSON."""
    if value is None:
        return None

    if isinstance(value, (dict, list)):
        visit_name = getattr(column.type, "__visit_name__", "").lower()
        if "json" in visit_name:
            return value
        return json.dumps(value, ensure_ascii=False)

    return value


async def _reflect_table(conn, table_name: str) -> Table:
    """Reflect a table definition inside a synchronous context."""

    def _reflect(sync_conn):
        metadata = MetaData()
        return Table(table_name, metadata, autoload_with=sync_conn)

    return await conn.run_sync(_reflect)


async def _load_table_from_file(data_file: Path):
    table_name = data_file.stem
    logger.info("Processing mock data file %s for table %s", data_file.name, table_name)

    async with db_manager.engine.begin() as conn:
        try:
            table = await _reflect_table(conn, table_name)
        except NoSuchTableError:
            logger.warning("Table %s does not exist; skipping %s", table_name, data_file.name)
            return
        except SQLAlchemyError as exc:
            logger.error("Failed to reflect table %s: %s", table_name, exc)
            return

        row_count = await conn.scalar(select(func.count()).select_from(table))
        if row_count and row_count > 0:
            logger.info("Table %s already has %d rows; skipping mock insert", table_name, row_count)
            return

        try:
            raw_records = json.loads(data_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            logger.error("Invalid JSON in %s: %s", data_file.name, exc)
            return

        records = _prepare_records(raw_records, table)
        if not records:
            logger.warning("No valid records found in %s after preparing data", data_file.name)
            return

        try:
            await conn.execute(table.insert(), records)
            logger.info("Inserted %d mock records into %s", len(records), table_name)
        except SQLAlchemyError as exc:
            logger.error("Failed to insert mock data into %s: %s", table_name, exc)
