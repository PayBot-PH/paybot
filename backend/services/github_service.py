"""GitHub PR in-memory store and webhook signature verification."""
import hashlib
import hmac
import logging
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def verify_github_signature(secret: str, payload: bytes, signature_header: str) -> bool:
    """Verify HMAC-SHA256 GitHub webhook signature.

    Returns True when the signature is valid, or when no secret is configured
    (permissive mode — useful during development).
    """
    if not secret:
        # No secret configured: skip verification (development / unconfigured deployments).
        return True
    if not signature_header or not signature_header.startswith("sha256="):
        logger.warning("GitHub webhook: missing or malformed X-Hub-Signature-256 header")
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()
    received = signature_header[len("sha256="):]
    return hmac.compare_digest(expected, received)


class GitHubPRStore:
    """In-memory store for GitHub pull-request state.

    Keeps the latest snapshot of each PR indexed by PR number.  Older entries
    are evicted when the store exceeds *max_prs*.
    """

    MAX_PRS = 500

    def __init__(self) -> None:
        self._prs: Dict[int, Dict[str, Any]] = {}
        self._last_updated: float = 0.0

    # ------------------------------------------------------------------
    # Mutation
    # ------------------------------------------------------------------

    def ingest_event(self, action: str, pr: Dict[str, Any]) -> Dict[str, Any]:
        """Process a GitHub ``pull_request`` webhook payload and persist the PR.

        Returns the stored PR dict (may be empty if the payload is invalid).
        """
        pr_number = pr.get("number")
        if pr_number is None:
            logger.warning("GitHub webhook: pull_request payload missing 'number'")
            return {}

        stored: Dict[str, Any] = {
            "number": pr_number,
            "title": pr.get("title", ""),
            "state": pr.get("state", "open"),
            "html_url": pr.get("html_url", ""),
            "draft": pr.get("draft", False),
            "merged": pr.get("merged", False),
            "action": action,
            "user": {
                "login": (pr.get("user") or {}).get("login", ""),
                "avatar_url": (pr.get("user") or {}).get("avatar_url", ""),
            },
            "labels": [lbl.get("name", "") for lbl in (pr.get("labels") or [])],
            "head_ref": (pr.get("head") or {}).get("ref", ""),
            "base_ref": (pr.get("base") or {}).get("ref", ""),
            "created_at": pr.get("created_at", ""),
            "updated_at": pr.get("updated_at", ""),
            "merged_at": pr.get("merged_at"),
            "closed_at": pr.get("closed_at"),
            "body": (pr.get("body") or "")[:500],
            "ingested_at": time.time(),
        }

        self._prs[pr_number] = stored

        # Evict oldest entry when over the limit
        if len(self._prs) > self.MAX_PRS:
            oldest_key = min(self._prs, key=lambda k: self._prs[k]["ingested_at"])
            del self._prs[oldest_key]

        self._last_updated = time.time()
        logger.info(
            "GitHub PR #%s ingested (action=%s, state=%s)",
            pr_number,
            action,
            stored["state"],
        )
        return stored

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_all(self) -> List[Dict[str, Any]]:
        """Return all stored PRs sorted by number descending."""
        return sorted(self._prs.values(), key=lambda p: p["number"], reverse=True)

    def get_by_number(self, number: int) -> Optional[Dict[str, Any]]:
        """Return a single PR by number, or None if not found."""
        return self._prs.get(number)

    @property
    def last_updated(self) -> float:
        """Unix timestamp of the last ingest operation."""
        return self._last_updated


# Module-level singleton shared by the router and tests
github_pr_store = GitHubPRStore()
