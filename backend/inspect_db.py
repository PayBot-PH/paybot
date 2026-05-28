import asyncio
import logging
from sqlalchemy import text
from core.database import db_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def inspect():
    try:
        async with db_manager.async_session_maker() as db:
            result = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'pos_terminals'"))
            columns = [row[0] for row in result]
            logger.info(f"Columns in pos_terminals: {columns}")
            
            result = await db.execute(text("SELECT count(*) FROM pos_terminals"))
            count = result.scalar()
            logger.info(f"Count in pos_terminals: {count}")
    except Exception as e:
        logger.error(f"Inspection failed: {e}")

if __name__ == "__main__":
    asyncio.run(inspect())
