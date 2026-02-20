import logging
import os
from pathlib import Path
from typing import Any

from pydantic_settings import BaseSettings

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    # Application
    app_name: str = "FastAPI Modular Template"
    debug: bool = False
    version: str = "1.0.0"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Database
    database_url: str = "sqlite+aiosqlite:///./paybot.db"

    # AWS Lambda Configuration
    is_lambda: bool = False
    lambda_function_name: str = "fastapi-backend"
    aws_region: str = "us-east-1"

    # API Keys
    telegram_bot_token: str = ""
    xendit_secret_key: str = ""

    # Simple admin authentication
    admin_user_id: str = "admin"
    admin_user_email: str = "admin@paybot.local"
    admin_user_password: str = ""
    telegram_admin_ids: str = ""

    @property
    def backend_url(self) -> str:
        """Generate backend URL from host and port."""
        if self.is_lambda:
            # In Lambda environment, return the API Gateway URL
            return os.environ.get(
                "PYTHON_BACKEND_URL", f"https://{self.lambda_function_name}.execute-api.{self.aws_region}.amazonaws.com"
            )
        else:
            # Use localhost for external callbacks instead of 0.0.0.0
            display_host = "127.0.0.1" if self.host == "0.0.0.0" else self.host
            return os.environ.get("PYTHON_BACKEND_URL", f"http://{display_host}:{self.port}")

    class Config:
        case_sensitive = False
        extra = "ignore"
        env_file = str(_ENV_FILE) if _ENV_FILE.exists() else ".env"
        env_file_encoding = "utf-8"

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
