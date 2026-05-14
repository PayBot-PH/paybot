from typing import Annotated

from core.database import get_db
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

# Database session dependency
DbSession = Annotated[AsyncSession, Depends(get_db)]
