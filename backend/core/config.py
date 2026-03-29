import logging
import os
import secrets
from pathlib import Path
from typing import Any

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    # Application
    app_name: str = "PayBot"
    debug: bool = False
    version: str = "1.0.0"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Database
    database_url: str = "sqlite+aiosqlite:///./paybot.db"
    # Public TCP proxy URL for Railway PostgreSQL (e.g. used for local dev when
    # DATABASE_URL points to the private .railway.internal hostname).
    # Example: postgresql://postgres:PASSWORD@gondola.proxy.rlwy.net:45681/railway
    database_public_url: str = ""

    @model_validator(mode="after")
    def prefer_public_db_url(self) -> "Settings":
        """Use DATABASE_PUBLIC_URL when DATABASE_URL points to Railway's internal hostname,
        which is unreachable from outside the private network or misconfigured.
        Also normalises the legacy postgres:// scheme to postgresql:// so that
        SQLAlchemy 2.0 can parse it without errors."""
        # Only switch to the public URL when running OUTSIDE Railway (local dev).
        # Inside Railway containers, the .railway.internal hostname is reachable directly.
        is_on_railway = bool(self.railway_environment or self.railway_project_id)
        if "railway.internal" in self.database_url and not is_on_railway:
            public = self.database_public_url.strip()
            if public:
                logger.debug("Switching DATABASE_URL to DATABASE_PUBLIC_URL (internal hostname detected)")
                self.database_url = public
        # Strip stray whitespace / newlines that can appear in Railway env vars.
        self.database_url = self.database_url.strip()
        # SQLAlchemy 2.0 removed the bare 'postgres' dialect name; Railway still
        # emits URLs with the legacy postgres:// scheme.
        if self.database_url.startswith("postgres://"):
            self.database_url = "postgresql://" + self.database_url[len("postgres://"):]
        # If the URL still has no scheme separator it is not a valid connection string
        # (e.g. a Railway variable that didn't resolve).  Fall back to DATABASE_PUBLIC_URL.
        if "://" not in self.database_url:
            public = self.database_public_url.strip()
            if public:
                if public.startswith("postgres://"):
                    public = "postgresql://" + public[len("postgres://"):]
                logger.warning(
                    "DATABASE_URL appears invalid (no '://'). Falling back to DATABASE_PUBLIC_URL."
                )
                self.database_url = public
        return self

    # Deployment platform detection (auto-set by each platform)
    railway_environment: str = ""   # set by Railway (e.g. "production")
    railway_project_id: str = ""    # set by Railway
    railway_public_domain: str = "" # set by Railway for the public HTTPS URL
    render: str = ""                # set by Render (e.g. "true")
    environment: str = "production" # general application environment flag

    # AWS Lambda Configuration
    is_lambda: bool = False
    lambda_function_name: str = "fastapi-backend"
    aws_region: str = "us-east-1"

    # API Keys
    telegram_bot_token: str = ""
    telegram_bot_username: str = ""
    xendit_secret_key: str = ""

    # PayMongo API
    paymongo_secret_key: str = ""
    paymongo_public_key: str = ""
    paymongo_webhook_secret: str = ""
    paymongo_mode: str = "test"  # "test" or "live"

    # PhotonPay API (Alipay / WeChat Pay collection)
    # Credentials from PhotonPay merchant portal (Settings > Developer)
    photonpay_app_id: str = ""
    photonpay_app_secret: str = ""
    # Merchant RSA private key (PKCS#8 PEM) for signing outgoing API requests
    photonpay_rsa_private_key: str = ""
    # PhotonPay platform RSA public key for verifying incoming webhook signatures
    photonpay_rsa_public_key: str = ""
    # Site ID from PhotonPay merchant portal (Collection > Site Management)
    photonpay_site_id: str = ""
    # payMethod strings – adjust based on account type (e.g. "Alipay", "WeChat")
    photonpay_alipay_method: str = "Alipay"
    photonpay_wechat_method: str = "WeChat"
    photonpay_mode: str = "production"  # "production" or "sandbox"
    photonpay_base_url: str = ""        # override API base URL (leave empty to derive from photonpay_mode)
    photonpay_cashier_url: str = ""     # override cashier base URL (leave empty to derive from photonpay_mode)
    # Optional explicit proxy URL for PhotonPay HTTP requests (e.g. socks5://user:pass@host:port).
    # Use this when the deployment environment routes outbound traffic through a transparent proxy
    # that presents an invalid source IP to PhotonPay (e.g. Railway private networking → 0.0.0.0:0).
    photonpay_proxy_url: str = ""

    # General outbound proxy host and port.  Used as a fallback for any service that needs a
    # proxy when no service-specific proxy URL is configured (e.g. when PHOTONPAY_PROXY_URL is
    # empty, the PhotonPay service will construct "http://<proxy_host>:<proxy_port>" instead).
    # Leave proxy_host empty to disable.  proxy_port defaults to 8080 when proxy_host is set
    # and proxy_port is 0.
    proxy_host: str = ""
    proxy_port: int = 0

    # TransFi Checkout API
    transfi_api_key: str = ""
    transfi_mode: str = "production"   # "sandbox" or "production"
    transfi_webhook_secret: str = ""
    transfi_base_url: str = ""         # override base URL (leave empty for default)

    # Cloudflare Turnstile (server-side CAPTCHA verification)
    # Secret key from https://dash.cloudflare.com → Turnstile → your site → Secret Key
    # When set, every Telegram widget login must include a valid Turnstile token.
    cloudflare_turnstile_secret_key: str = ""

    # USDT TRC20 wallet address for receiving top-up payments
    usdt_trc20_address: str = "TGGtSorAyDSUxVXxk5jmK4jM2xFUv9Bbfx"

    # Simple admin authentication
    admin_user_id: str = "admin"
    admin_user_email: str = "admin@paybot.local"
    admin_user_password: str = ""
    telegram_admin_ids: str = ""
    # Bot owner: the single Telegram user ID that is the super admin of the bot.
    # Only this user can approve/reject KYB registrations and manage bot admins.
    telegram_bot_owner_id: str = ""

    # JWT configuration
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60

    @model_validator(mode="after")
    def strip_token_fields(self) -> "Settings":
        """Strip accidental leading/trailing whitespace from token/key fields.

        Copy-pasting credentials from dashboards (Railway, BotFather, etc.) often
        introduces invisible newlines or spaces that silently break HMAC verification.
        """
        for field in (
            "telegram_bot_token",
            "telegram_bot_username",
            "xendit_secret_key",
            "paymongo_secret_key",
            "paymongo_public_key",
            "jwt_secret_key",
        ):
            val = getattr(self, field, None)
            if val:
                object.__setattr__(self, field, val.strip())
        return self

    @model_validator(mode="after")
    def generate_jwt_secret_if_missing(self) -> "Settings":
        """Auto-generate a random JWT secret when JWT_SECRET_KEY is not configured.

        The generated key is ephemeral — it changes on every restart, which means
        all active sessions will be invalidated when the server restarts.  Set
        JWT_SECRET_KEY explicitly in your environment variables (or .env file) for
        persistent authentication across restarts.
        """
        if not self.jwt_secret_key:
            self.jwt_secret_key = secrets.token_hex(32)
            logger.warning(
                "JWT_SECRET_KEY is not configured. A temporary random secret has been "
                "generated for this session. Tokens will be invalidated on restart. "
                "Set JWT_SECRET_KEY in your environment variables for persistent authentication."
            )
        return self

    @property
    def backend_url(self) -> str:
        """Generate backend URL from host and port."""
        if self.is_lambda:
            # In Lambda environment, return the API Gateway URL
            return os.environ.get(
                "PYTHON_BACKEND_URL", f"https://{self.lambda_function_name}.execute-api.{self.aws_region}.amazonaws.com"
            )
        else:
            # 1. Explicit override (highest priority)
            explicit_url = os.environ.get("PYTHON_BACKEND_URL", "")
            if explicit_url:
                return explicit_url
            # 2. Railway auto-provided public domain (set automatically by Railway)
            if self.railway_public_domain:
                return f"https://{self.railway_public_domain}"
            # 3. Render auto-provided public URL (set automatically by Render)
            render_external_url = os.environ.get("RENDER_EXTERNAL_URL", "")
            if render_external_url:
                return render_external_url
            render_hostname = os.environ.get("RENDER_EXTERNAL_HOSTNAME", "")
            if render_hostname:
                return f"https://{render_hostname}"
            # 4. Fallback to local address
            display_host = "127.0.0.1" if self.host == "0.0.0.0" else self.host
            return f"http://{display_host}:{self.port}"

    model_config = SettingsConfigDict(
        case_sensitive=False,
        extra="ignore",
        env_file=str(_ENV_FILE) if _ENV_FILE.exists() else ".env",
        env_file_encoding="utf-8",
    )

    def __getattr__(self, name: str) -> Any:
        """
        Dynamically read attributes from environment variables.
        For example: settings.opapi_key reads from OPAPI_KEY environment variable.

        Args:
            name: Attribute name (e.g., 'opapi_key')

        Returns:
            Value from environment variable

        Raises:
            AttributeError: If attribute doesn't exist and not found in environment variables
        """
        # Convert attribute name to environment variable name (snake_case -> UPPER_CASE)
        env_var_name = name.upper()

        # Check if environment variable exists
        if env_var_name in os.environ:
            value = os.environ[env_var_name]
            # Cache the value in instance dict to avoid repeated lookups
            self.__dict__[name] = value
            logger.debug(f"Read dynamic attribute {name} from environment variable {env_var_name}")
            return value

        # If not found, raise AttributeError to maintain normal Python behavior
        raise AttributeError(f"'{self.__class__.__name__}' object has no attribute '{name}'")


# Global settings instance
settings = Settings()
