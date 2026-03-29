import asyncio
import importlib
import logging
import os
import pkgutil
import sys
import traceback
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from core.config import settings
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.routing import APIRouter
from fastapi.staticfiles import StaticFiles

# MODULE_IMPORTS_START
from services.database import initialize_database, close_database
from services.auth import initialize_admin_user
# MODULE_IMPORTS_END

# Telegram bot commands registered on startup
BOT_COMMANDS = [
    {"command": "start", "description": "Welcome message & quick menu"},
    {"command": "register", "description": "Register to use this bot (KYB)"},
    {"command": "login", "description": "Log in with your PIN"},
    {"command": "setpin", "description": "Set or change your PIN"},
    {"command": "logout", "description": "End your current session"},
    {"command": "help", "description": "List all available commands"},
    {"command": "pay", "description": "Interactive payment menu"},
    {"command": "invoice", "description": "Create a payment invoice"},
    {"command": "qr", "description": "Generate QR code payment"},
    {"command": "alipay", "description": "Alipay QR payment (via PhotonPay)"},
    {"command": "wechat", "description": "WeChat Pay QR (via PhotonPay)"},
    {"command": "link", "description": "Create shareable payment link"},
    {"command": "va", "description": "Create virtual account"},
    {"command": "ewallet", "description": "Charge e-wallet"},
    {"command": "scanqr", "description": "Scan a QRPH code and pay"},
    {"command": "disburse", "description": "Send money to bank account"},
    {"command": "refund", "description": "Process a refund"},
    {"command": "status", "description": "Check payment status"},
    {"command": "list", "description": "View recent transactions"},
    {"command": "cancel", "description": "Cancel a pending payment"},
    {"command": "balance", "description": "Check wallet balance"},
    {"command": "usdbalance", "description": "Check USD wallet balance"},
    {"command": "send", "description": "Transfer to another user"},
    {"command": "withdraw", "description": "Withdraw from wallet"},
    {"command": "report", "description": "View revenue summary"},
    {"command": "fees", "description": "Calculate payment fees"},
    {"command": "subscribe", "description": "Create subscription"},
    {"command": "remind", "description": "Send payment reminder"},
    {"command": "deposit", "description": "Submit bank/e-wallet deposit"},
    {"command": "topup", "description": "Top up wallet via USDT TRC20"},
    {"command": "sendusdt", "description": "Send USDT to a TRC20 address"},
    {"command": "sendusd", "description": "Send USD to another user by @username"},
]

logger = logging.getLogger(__name__)


def setup_logging():
    """Configure the logging system."""
    if os.environ.get("IS_LAMBDA") == "true":
        return

    is_production = os.getenv("ENVIRONMENT", "production").lower() not in ("dev", "development", "local")
    log_level = logging.INFO if is_production else logging.DEBUG

    # Configure log format
    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]

    # Only write log files in non-production environments (Railway has ephemeral fs)
    if not is_production:
        log_dir = "logs"
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = f"{log_dir}/app_{timestamp}.log"
        handlers.append(logging.FileHandler(log_file, encoding="utf-8"))

    # Configure the root logger
    logging.basicConfig(
        level=log_level,
        format=log_format,
        handlers=handlers,
    )

    # Set log levels for specific modules
    logging.getLogger("uvicorn").setLevel(log_level)
    logging.getLogger("fastapi").setLevel(log_level)
    # Avoid leaking request URLs (can contain bot tokens) from verbose HTTP client logs.
    logging.getLogger("httpx").setLevel(logging.WARNING)

    # Log configuration details
    logger = logging.getLogger(__name__)
    logger.info("=== Logging system initialized ===")
    logger.info(f"Log level: {'INFO' if is_production else 'DEBUG'} (environment: {'production' if is_production else 'development'})")


async def _setup_telegram(backend_url: str) -> None:
    """Register the Telegram webhook and bot commands in the background.

    Running this outside the critical startup path means the health-check
    endpoint responds immediately after database initialisation, avoiding
    a Railway 502 when the Telegram API is slow or temporarily unreachable.
    """
    try:
        from services.telegram_service import TelegramService
        tg = TelegramService()
        webhook_url = f"{backend_url.rstrip('/')}/api/v1/telegram/webhook"
        webhook_result = await tg.set_webhook(webhook_url)
        if webhook_result.get("success"):
            logger.info(f"Telegram webhook registered: {webhook_url}")
        else:
            logger.warning(f"Telegram webhook registration failed: {webhook_result.get('error')}")
        cmd_result = await tg.set_my_commands(BOT_COMMANDS)
        if cmd_result.get("success"):
            logger.info("Telegram bot commands registered successfully")
        else:
            logger.warning(f"Telegram bot commands registration failed: {cmd_result.get('error')}")
    except Exception as e:
        logger.warning(f"Telegram startup setup failed (non-fatal): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger = logging.getLogger(__name__)
    logger.info("=== Application startup initiated ===")

    environment = os.getenv("ENVIRONMENT", "dev").lower()
    missing_required_secrets = [
        key
        for key, value in {
            "TELEGRAM_BOT_TOKEN": settings.telegram_bot_token,
        }.items()
        if not value
    ]

    if missing_required_secrets:
        message = f"Missing required environment variables: {', '.join(missing_required_secrets)}"
        if environment == "dev":
            logger.warning(message)
        else:
            logger.error(message)

    # Warn when JWT_SECRET_KEY was not explicitly provided (a random ephemeral key
    # was auto-generated by the settings validator, so auth will work but tokens
    # will not survive a server restart).
    if not os.environ.get("JWT_SECRET_KEY"):
        logger.warning(
            "JWT_SECRET_KEY is not set in environment variables. "
            "A temporary secret was generated for this session — all sessions will be "
            "invalidated on restart. Set JWT_SECRET_KEY for production use."
        )

    # Xendit is optional in some deployments (e.g., PayMongo-only).
    if not settings.xendit_secret_key:
        logger.warning("XENDIT_SECRET_KEY is not set. Xendit-based payment features will be unavailable.")

    # MODULE_STARTUP_START
    db_ready = False
    try:
        await initialize_database()
        await initialize_admin_user()
        db_ready = True
    except Exception as e:
        logger.error(f"Database startup failed (app will run in degraded mode): {e}")

    if db_ready:
        try:
            from routers.app_settings import ensure_maintenance_off
            from core.database import db_manager
            async with db_manager.async_session_maker() as _db:
                await ensure_maintenance_off(_db)
        except Exception as e:
            logger.warning(f"Maintenance mode check at startup skipped: {e}")

        try:
            from services.mock_data import initialize_mock_data
            await initialize_mock_data()
        except Exception as e:
            logger.warning(f"Mock data initialization skipped: {e}")
    else:
        logger.warning("Skipping mock data initialization because database is not ready.")
    # MODULE_STARTUP_END

    # Auto-register Telegram webhook and bot commands if backend URL is configured.
    # Run this as a background task so it does not delay the health-check response;
    # the webhook URL only needs to be registered once and is retained by Telegram
    # across restarts, so a brief delay on first boot is harmless.
    _telegram_task: asyncio.Task | None = None
    backend_url = settings.backend_url
    _local_prefixes = ("http://127.0.0.1", "https://127.0.0.1", "http://localhost", "https://localhost", "http://0.0.0.0", "https://0.0.0.0")
    if settings.telegram_bot_token and backend_url and not any(backend_url.startswith(p) for p in _local_prefixes):
        _telegram_task = asyncio.create_task(_setup_telegram(backend_url))

    logger.info("=== Application startup completed successfully ===")
    yield
    # MODULE_SHUTDOWN_START
    # Cancel the Telegram setup task if it is still running during shutdown.
    if _telegram_task is not None and not _telegram_task.done():
        _telegram_task.cancel()
        try:
            await _telegram_task
        except (asyncio.CancelledError, Exception):
            pass
    await close_database()
    # MODULE_SHUTDOWN_END


app = FastAPI(
    title="PayBot API",
    description="PayBot Philippines — Telegram Bot & Payment Gateway admin dashboard and bot backend",
    version="1.0.0",
    lifespan=lifespan,
)


# MODULE_MIDDLEWARE_START
# Read allowed origins from environment variable, fallback to allow all for development
allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "")
if allowed_origins_env:
    # Parse comma-separated origins
    allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )
else:
    # Development mode: allow all origins
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )
# MODULE_MIDDLEWARE_END


# Auto-discover and include all routers from the local `routers` package
def include_routers_from_package(app: FastAPI, package_name: str = "routers") -> None:
    """Discover and include all APIRouter objects from a package.

    This scans the given package (and subpackages) for module-level variables that
    are instances of FastAPI's APIRouter. It supports "router", "admin_router" names.
    """

    logger = logging.getLogger(__name__)

    try:
        pkg = importlib.import_module(package_name)
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.debug("Routers package '%s' not loaded: %s", package_name, exc)
        return

    discovered: int = 0
    for _finder, module_name, is_pkg in pkgutil.walk_packages(pkg.__path__, pkg.__name__ + "."):
        # Only import leaf modules; subpackages will be walked automatically
        if is_pkg:
            continue
        try:
            module = importlib.import_module(module_name)
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.warning("Failed to import module '%s': %s", module_name, exc)
            continue

        # Check for router variable names: router and admin_router
        for attr_name in ("router", "admin_router"):
            if not hasattr(module, attr_name):
                continue

            attr = getattr(module, attr_name)

            if isinstance(attr, APIRouter):
                app.include_router(attr)
                discovered += 1
                logger.info("Included router: %s.%s", module_name, attr_name)
            elif isinstance(attr, (list, tuple)):
                for idx, item in enumerate(attr):
                    if isinstance(item, APIRouter):
                        app.include_router(item)
                        discovered += 1
                        logger.info("Included router from list: %s.%s[%d]", module_name, attr_name, idx)

    if discovered == 0:
        logger.debug("No routers discovered in package '%s'", package_name)


# Setup logging before router discovery
setup_logging()
include_routers_from_package(app, "routers")


# Add exception handler for all exceptions except HTTPException
@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle all exceptions except HTTPException

    - Dev environment: Return full stack trace and exception details
    - Prod environment: Return only "Internal server error"
    """
    # Re-raise HTTPException to let FastAPI handle it normally
    if isinstance(exc, HTTPException):
        raise exc

    logger = logging.getLogger(__name__)
    error_message = str(exc)
    error_type = type(exc).__name__

    # Log full error details regardless of environment
    logger.error(f"Exception: {error_type}: {error_message}\n{traceback.format_exc()}")

    # Determine if we're in dev environment
    is_dev = os.getenv("ENVIRONMENT", "prod").lower() == "dev"

    if is_dev:
        # Dev environment: return full stack trace and exception details
        error_detail = f"{error_type}: {error_message}\n{traceback.format_exc()}"
        return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": error_detail})
    else:
        # Prod environment: return only generic error message
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": "Internal Server Error"}
        )


@app.get("/health")
def health_check():
    return {"status": "healthy"}


# ── Frontend SPA serving ─────────────────────────────────────────────────────
# Serve the built React admin UI from backend/static/ (populated by the
# multi-stage Docker build).  This must be registered AFTER all API routers so
# that /api/... routes take priority.

_STATIC_DIR = Path(__file__).parent / "static"

# Ensure the images directory exists and mount it unconditionally so the
# static QR image URL ({base_url}/images/usdt_trc20_qr.png) is always reachable.
_IMAGES_DIR = _STATIC_DIR / "images"
_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/images", StaticFiles(directory=str(_IMAGES_DIR)), name="images")

# Ensure the uploads directory exists and mount it for serving user-uploaded receipts.
_UPLOADS_DIR = _STATIC_DIR / "uploads"
_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_UPLOADS_DIR)), name="uploads")

if _STATIC_DIR.exists():
    # Mount the Vite-generated assets bundle directory for efficient serving
    _assets_dir = _STATIC_DIR / "assets"
    if _assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")

    # Headers applied to every index.html response.
    # no-cache + must-revalidate ensures browsers revalidate on every visit so
    # that newly deployed versions are picked up immediately without a hard reload.
    _NO_CACHE_HEADERS = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    }

    @app.get("/", include_in_schema=False)
    async def serve_root():
        """Serve the admin dashboard SPA."""
        return FileResponse(str(_STATIC_DIR / "index.html"), headers=_NO_CACHE_HEADERS)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Catch-all: serve static files or fall back to index.html for React Router."""
        file_path = (_STATIC_DIR / full_path).resolve()
        # Guard against path traversal attacks
        if not str(file_path).startswith(str(_STATIC_DIR.resolve())):
            return FileResponse(str(_STATIC_DIR / "index.html"), headers=_NO_CACHE_HEADERS)
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(_STATIC_DIR / "index.html"), headers=_NO_CACHE_HEADERS)
else:
    @app.get("/")
    def root():
        return {"message": "PayBot API is running. Deploy with frontend for the admin UI."}


def run_in_debug_mode(app: FastAPI):
    """Run the FastAPI app in debug mode with proper asyncio handling.

    This function handles the special case of running in a debugger (PyCharm, VS Code, etc.)
    where asyncio is patched, causing conflicts with uvicorn's asyncio_run.

    It loads environment variables from ../.env and uses asyncio.run() directly
    to avoid uvicorn's asyncio_run conflicts.

    Args:
        app: The FastAPI application instance
    """
    import asyncio
    from pathlib import Path

    import uvicorn
    from dotenv import load_dotenv

    # Load environment variables from ../.env in debug mode
    # If `LOCAL_DEBUG=true` is set, then MetaGPT's `ProjectBuilder.build()` will generate the `.env` file
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path, override=True)
        logger = logging.getLogger(__name__)
        logger.info(f"Loaded environment variables from {env_path}")

    # In debug mode, use asyncio.run() directly to avoid uvicorn's asyncio_run conflicts
    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=int(settings.port),
        log_level="info",
    )
    server = uvicorn.Server(config)
    asyncio.run(server.serve())


if __name__ == "__main__":
    import sys

    import uvicorn

    # Detect if running in debugger (PyCharm, VS Code, etc.)
    # Debuggers patch asyncio which conflicts with uvicorn's asyncio_run
    is_debugging = "pydevd" in sys.modules or (hasattr(sys, "gettrace") and sys.gettrace() is not None)

    if is_debugging:
        run_in_debug_mode(app)
    else:
        # Enable reload in normal mode
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=int(settings.port),
            reload_excludes=["**/*.py"],
        )
