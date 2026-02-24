import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from core.auth import create_access_token
from core.config import settings
from core.database import db_manager
from models.auth import OIDCState, User
from schemas.auth import UserPermissions
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_user(self, platform_sub: str, email: str, name: Optional[str] = None) -> User:
        """Get existing user or create new one."""
        start_time = time.time()
        logger.debug(f"[DB_OP] Starting get_or_create_user - platform_sub: {platform_sub}")
        # Try to find existing user
        result = await self.db.execute(select(User).where(User.id == platform_sub))
        user = result.scalar_one_or_none()
        logger.debug(f"[DB_OP] User lookup completed in {time.time() - start_time:.4f}s - found: {user is not None}")

        if user:
            # Update user info if needed
            user.email = email
            user.name = name
            user.last_login = datetime.now(timezone.utc)
        else:
            # Create new user
            user = User(id=platform_sub, email=email, name=name, last_login=datetime.now(timezone.utc))
            self.db.add(user)

        start_time_commit = time.time()
        logger.debug("[DB_OP] Starting user commit/refresh")
        await self.db.commit()
        await self.db.refresh(user)
        logger.debug(f"[DB_OP] User commit/refresh completed in {time.time() - start_time_commit:.4f}s")
        return user

    async def issue_app_token(
        self,
        user: User,
        permissions: Optional[UserPermissions] = None,
    ) -> Tuple[str, datetime, Dict[str, Any]]:
        """Generate application JWT token for the authenticated user."""
        try:
            expires_minutes = int(getattr(settings, "jwt_expire_minutes", 60))
        except (TypeError, ValueError):
            logger.warning("Invalid JWT_EXPIRE_MINUTES value; fallback to 60 minutes")
            expires_minutes = 60
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)

        claims: Dict[str, Any] = {
            "sub": user.id,
            "email": user.email,
            "role": user.role,
        }

        if user.name:
            claims["name"] = user.name
        if user.last_login:
            claims["last_login"] = user.last_login.isoformat()
        if permissions:
            claims["permissions"] = permissions.model_dump()
        token = create_access_token(claims, expires_minutes=expires_minutes)

        return token, expires_at, claims

    async def store_oidc_state(self, state: str, nonce: str, code_verifier: str):
        """Store OIDC state in database."""
        # Clean up expired states first
        await self.db.execute(delete(OIDCState).where(OIDCState.expires_at < datetime.now(timezone.utc)))

        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)  # 10 minute expiry

        oidc_state = OIDCState(state=state, nonce=nonce, code_verifier=code_verifier, expires_at=expires_at)

        self.db.add(oidc_state)
        await self.db.commit()

    async def get_and_delete_oidc_state(self, state: str) -> Optional[dict]:
        """Get and delete OIDC state from database."""
        # Clean up expired states first
        await self.db.execute(delete(OIDCState).where(OIDCState.expires_at < datetime.now(timezone.utc)))

        # Find and validate state
        result = await self.db.execute(select(OIDCState).where(OIDCState.state == state))
        oidc_state = result.scalar_one_or_none()

        if not oidc_state:
            return None

        # Extract data before deleting
        state_data = {"nonce": oidc_state.nonce, "code_verifier": oidc_state.code_verifier}

        # Delete the used state (one-time use)
        await self.db.delete(oidc_state)
        await self.db.commit()

        return state_data


async def initialize_admin_user():
    """Initialize admin user if not exists"""
    if "MGX_IGNORE_INIT_ADMIN" in os.environ:
        logger.info("Ignore initialize admin")
        return

    from services.database import initialize_database

    # Ensure database is initialized first
    await initialize_database()

    admin_user_id = getattr(settings, "admin_user_id", "")
    admin_user_email = getattr(settings, "admin_user_email", "")

    if not admin_user_id or not admin_user_email:
        logger.warning("Admin user ID or email not configured, skipping admin initialization")
        return

    async with db_manager.async_session_maker() as db:
        # Check if admin user already exists
        result = await db.execute(select(User).where(User.id == admin_user_id))
        user = result.scalar_one_or_none()

        if user:
            # Update existing user to admin if not already
            if user.role != "admin":
                user.role = "admin"
                user.email = admin_user_email  # Update email too
                await db.commit()
                logger.debug(f"Updated user {admin_user_id} to admin role")
            else:
                logger.debug(f"Admin user {admin_user_id} already exists")
        else:
            # Create new admin user
            admin_user = User(id=admin_user_id, email=admin_user_email, role="admin")
            db.add(admin_user)
            await db.commit()
            logger.debug(f"Created admin user: {admin_user_id} with email: {admin_user_email}")


# Demo user definitions (fixed IDs, used for dev/demo login)
DEMO_SUPER_ADMIN_ID = "demo_super_admin"
DEMO_ADMIN_ID = "demo_admin"

DEMO_USERS = [
    {
        "id": DEMO_SUPER_ADMIN_ID,
        "email": "superadmin@paybot.local",
        "name": "Super Admin",
        "is_super_admin": True,
        "can_manage_payments": True,
        "can_manage_disbursements": True,
        "can_view_reports": True,
        "can_manage_wallet": True,
        "can_manage_transactions": True,
        "can_manage_bot": True,
    },
    {
        "id": DEMO_ADMIN_ID,
        "email": "admin@paybot.local",
        "name": "Admin User",
        "is_super_admin": False,
        "can_manage_payments": True,
        "can_manage_disbursements": True,
        "can_view_reports": True,
        "can_manage_wallet": True,
        "can_manage_transactions": True,
        "can_manage_bot": False,
    },
]


async def initialize_demo_users():
    """Seed demo super admin and admin user records for dev/demo purposes."""
    from services.database import initialize_database
    await initialize_database()

    async with db_manager.async_session_maker() as db:
        for demo in DEMO_USERS:
            uid = demo["id"]
            try:
                # Upsert User record
                result = await db.execute(select(User).where(User.id == uid))
                user = result.scalar_one_or_none()
                if not user:
                    db.add(User(id=uid, email=demo["email"], name=demo["name"], role="admin"))
                    await db.flush()

                # Upsert AdminUser record
                from models.admin_users import AdminUser
                res = await db.execute(
                    select(AdminUser).where(AdminUser.telegram_id == uid)
                )
                admin = res.scalar_one_or_none()
                if not admin:
                    db.add(AdminUser(
                        telegram_id=uid,
                        telegram_username=uid,
                        name=demo["name"],
                        is_active=True,
                        is_super_admin=demo["is_super_admin"],
                        can_manage_payments=demo["can_manage_payments"],
                        can_manage_disbursements=demo["can_manage_disbursements"],
                        can_view_reports=demo["can_view_reports"],
                        can_manage_wallet=demo["can_manage_wallet"],
                        can_manage_transactions=demo["can_manage_transactions"],
                        can_manage_bot=demo["can_manage_bot"],
                        added_by="seed",
                    ))
                await db.commit()
                logger.info(f"Demo user seeded: {uid}")
            except Exception as e:
                logger.warning(f"Failed to seed demo user {uid}: {e}")
                await db.rollback()
