from fastapi import APIRouter
from services.database import check_database_health

router = APIRouter(prefix="/api/v1/health", tags=["health"])


@router.get("")
async def health_check():
    """Check application and database health"""
    db_healthy = await check_database_health()
    return {
        "status": "healthy" if db_healthy else "degraded",
        "database": "healthy" if db_healthy else "unhealthy",
    }


@router.get("/db")
async def database_health_check():
    """Check database connection health"""
    is_healthy = await check_database_health()
    return {"status": "healthy" if is_healthy else "unhealthy", "service": "database"}
