"""GitHub webhook receiver and PR listing endpoints."""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.event_bus import payment_event_bus
from services.github_service import github_pr_store, verify_github_signature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/github", tags=["github"])


@router.post("/webhook", status_code=status.HTTP_204_NO_CONTENT)
async def github_webhook(request: Request):
    """Receive GitHub webhook events.

    Verifies the HMAC-SHA256 signature (when ``GITHUB_WEBHOOK_SECRET`` is set),
    processes ``pull_request`` events, persists them in the in-memory store, and
    publishes a ``pr_update`` event to the shared event bus so connected SSE
    clients and polling frontends pick up the change immediately.
    """
    raw_body = await request.body()

    # ── Signature verification ──────────────────────────────────────────────
    # Lazy-import settings here to avoid circular imports at module load time.
    from core.config import settings  # noqa: PLC0415

    webhook_secret: str = ""
    try:
        webhook_secret = settings.github_webhook_secret  # type: ignore[attr-defined]
    except AttributeError:
        pass  # Secret not configured — permissive mode

    sig_header = request.headers.get("x-hub-signature-256", "")
    if not verify_github_signature(webhook_secret, raw_body, sig_header):
        logger.warning(
            "GitHub webhook: signature verification failed (remote_addr=%s)",
            request.client.host if request.client else "unknown",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid webhook signature",
        )

    # ── Parse JSON ──────────────────────────────────────────────────────────
    try:
        payload = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")

    # ── Route by event type ─────────────────────────────────────────────────
    event_type = request.headers.get("x-github-event", "")

    if event_type == "ping":
        # GitHub sends a ping when a new webhook is created — acknowledge it.
        logger.info("GitHub webhook ping received (hook_id=%s)", payload.get("hook_id"))
        return

    if event_type != "pull_request":
        logger.debug("GitHub webhook: ignoring event type '%s'", event_type)
        return

    # ── Process pull_request event ──────────────────────────────────────────
    action = payload.get("action", "")
    pr_data = payload.get("pull_request", {})

    if not pr_data:
        logger.warning("GitHub webhook: pull_request payload missing 'pull_request' key")
        return

    stored = github_pr_store.ingest_event(action, pr_data)
    if not stored:
        return  # Invalid payload logged inside ingest_event

    # Publish a lightweight event so the frontend receives an immediate push
    payment_event_bus.publish(
        {
            "event_type": "pr_update",
            "action": action,
            "pr_number": stored.get("number"),
            "pr_title": stored.get("title"),
            "pr_state": stored.get("state"),
            "pr_url": stored.get("html_url"),
            "pr_draft": stored.get("draft"),
            "pr_merged": stored.get("merged"),
            "pr_user": (stored.get("user") or {}).get("login"),
        }
    )

    logger.info(
        "GitHub PR #%s processed successfully (action=%s, state=%s)",
        stored.get("number"),
        action,
        stored.get("state"),
    )


@router.get("/pull-requests")
async def list_pull_requests(
    current_user: UserResponse = Depends(get_current_user),
):
    """Return all stored pull requests, newest first.

    The store is populated by GitHub webhook events delivered to
    ``POST /api/v1/github/webhook``.  No GitHub API token is required.
    """
    prs = github_pr_store.get_all()
    return {
        "items": prs,
        "total": len(prs),
        "last_updated": github_pr_store.last_updated,
    }
