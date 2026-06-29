from fastapi import APIRouter
from services.database import check_database_health
from core.config import settings

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


@router.get("/deployment")
async def deployment_status():
    """Return a comprehensive deployment status for all configured subsystems.

    Checks the database connection and reports which payment gateways / bot
    integrations have their credentials configured.  No external HTTP calls
    are made so the response is always fast.
    """
    db_healthy = await check_database_health()

    # Determine deployment platform from well-known env vars (declared in settings)
    if settings.railway_environment or settings.railway_project_id:
        platform = "Railway"
    elif settings.render:
        platform = "Render"
    else:
        platform = "local"

    services = {
        "database": {
            "configured": True,
            "healthy": db_healthy,
            "status": "healthy" if db_healthy else "unhealthy",
        },
        "telegram": {
            "configured": bool(settings.telegram_bot_token),
            "username": settings.telegram_bot_username or None,
        },
        "xendit": {
            "configured": bool(settings.xendit_secret_key),
        },
        "paymongo": {
            "configured": bool(settings.paymongo_secret_key),
            "mode": settings.paymongo_mode,
        },
        "photonpay": {
            "configured": bool(
                settings.photonpay_app_id
                and settings.photonpay_app_secret
                and settings.photonpay_site_id
            ),
            "mode": settings.photonpay_mode,
        },
        "transfi": {
            "configured": bool(settings.transfi_api_key),
            "mode": settings.transfi_mode,
        },
    }

    all_critical_healthy = db_healthy
    overall = "healthy" if all_critical_healthy else "degraded"

    return {
        "status": overall,
        "environment": settings.environment,
        "platform": platform,
        "app_name": settings.app_name,
        "version": settings.version,
        "services": services,
    }
