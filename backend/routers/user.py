from datetime import datetime
from typing import List, Optional

from core.database import get_db
from dependencies.auth import get_current_user
from fastapi import APIRouter, Depends, HTTPException, status
from models.auth import User
from pydantic import BaseModel, ConfigDict
from schemas.auth import UserResponse
from services.user import UserService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/users", tags=["users"])


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None


@router.get("/profile", response_model=UserResponse)
async def get_profile(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    profile = await UserService.get_user_profile(db, current_user.id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")
    return profile


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    profile_data: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update current user profile"""
    profile = await UserService.update_user_profile(db, current_user.id, profile_data.name)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")
    return profile


# ── User Management (super admin only) ───────────────────────────────────────


class UserOut(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    role: str
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class UserRoleUpdate(BaseModel):
    role: str  # "user" | "admin"


def _require_super_admin(current_user: UserResponse):
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required.",
        )


@router.get("", response_model=List[UserOut])
async def list_users(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all registered users. Super admin only."""
    _require_super_admin(current_user)
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()


@router.patch("/{user_id}/role", response_model=UserOut)
async def update_user_role(
    user_id: str,
    data: UserRoleUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a user's role. Super admin only."""
    _require_super_admin(current_user)

    if data.role not in ("user", "admin", "co_admin", "agent", "super_admin"):
        raise HTTPException(status_code=400, detail="Role must be 'user', 'admin', 'co_admin', 'agent', or 'super_admin'.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user.role = data.role
    await db.commit()
    await db.refresh(user)
    return user
