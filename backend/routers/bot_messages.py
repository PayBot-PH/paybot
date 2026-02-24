"""
Super Admin: Bot Messages Router
Allows super admins to view all bot conversations and reply to users.
"""
import logging
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.bot_logs import Bot_logs
from schemas.auth import UserResponse
from services.telegram_service import TelegramService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/bot-messages", tags=["bot-messages"])


# ---------- Schemas ----------
class BotMessageResponse(BaseModel):
    id: int
    user_id: str
    log_type: str
    message: str
    telegram_chat_id: Optional[str] = None
    telegram_username: Optional[str] = None
    command: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class BotMessageListResponse(BaseModel):
    items: List[BotMessageResponse]
    total: int


class ReplyRequest(BaseModel):
    chat_id: str
    message: str


class ConversationUser(BaseModel):
    chat_id: str
    username: Optional[str] = None
    message_count: int
    last_message: Optional[str] = None
    last_seen: Optional[datetime] = None


class ConversationListResponse(BaseModel):
    items: List[ConversationUser]
    total: int


# ---------- Endpoints ----------
@router.get("", response_model=BotMessageListResponse)
async def list_bot_messages(
    chat_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all messages sent to the bot (super admin only)."""
    stmt = select(Bot_logs).order_by(desc(Bot_logs.created_at)).limit(limit).offset(offset)
    if chat_id:
        stmt = stmt.where(Bot_logs.telegram_chat_id == chat_id)
    result = await db.execute(stmt)
    items = result.scalars().all()

    count_stmt = select(func.count(Bot_logs.id))
    if chat_id:
        count_stmt = count_stmt.where(Bot_logs.telegram_chat_id == chat_id)
    total = (await db.execute(count_stmt)).scalar_one()

    return BotMessageListResponse(items=list(items), total=total)


@router.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a list of unique users who have messaged the bot."""
    # Get distinct chat_ids with latest message and count
    subq = (
        select(
            Bot_logs.telegram_chat_id,
            Bot_logs.telegram_username,
            func.count(Bot_logs.id).label("message_count"),
            func.max(Bot_logs.created_at).label("last_seen"),
        )
        .where(Bot_logs.telegram_chat_id.isnot(None))
        .group_by(Bot_logs.telegram_chat_id, Bot_logs.telegram_username)
        .order_by(desc(func.max(Bot_logs.created_at)))
    )
    result = await db.execute(subq)
    rows = result.fetchall()

    conversations = []
    for row in rows:
        # Get the most recent message for this chat
        last_msg_result = await db.execute(
            select(Bot_logs.message)
            .where(Bot_logs.telegram_chat_id == row.telegram_chat_id)
            .order_by(desc(Bot_logs.created_at))
            .limit(1)
        )
        last_message = last_msg_result.scalar_one_or_none()
        conversations.append(ConversationUser(
            chat_id=row.telegram_chat_id,
            username=row.telegram_username,
            message_count=row.message_count,
            last_message=last_message,
            last_seen=row.last_seen,
        ))

    return ConversationListResponse(items=conversations, total=len(conversations))


@router.post("/reply")
async def reply_to_user(
    body: ReplyRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a message to a Telegram user from the admin dashboard."""
    if not body.chat_id or not body.message.strip():
        raise HTTPException(status_code=400, detail="chat_id and message are required")

    tg = TelegramService()
    result = await tg.send_message(body.chat_id, f"📢 <b>Admin Message:</b>\n\n{body.message}")
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to send message"))

    # Log the admin reply
    try:
        log = Bot_logs(
            user_id="admin",
            log_type="admin_reply",
            message=f"[ADMIN→{body.chat_id}] {body.message}",
            telegram_chat_id=body.chat_id,
            telegram_username="admin",
            created_at=datetime.now(),
        )
        db.add(log)
        await db.commit()
    except Exception as e:
        logger.warning(f"Failed to log admin reply: {e}")

    return {"success": True, "message_id": result.get("message_id")}
