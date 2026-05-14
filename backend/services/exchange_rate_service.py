"""Real-time exchange rate fetching service.

Fetches the live USDT → PHP exchange rate from the CoinGecko public API.
Results are cached in-memory for CACHE_TTL_SECONDS to avoid hammering the
free-tier rate limits.
"""

import logging
import time
from typing import Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

COINGECKO_URL = (
    "https://api.coingecko.com/api/v3/simple/price"
    "?ids=tether&vs_currencies=php"
)

CACHE_TTL_SECONDS = 300  # 5 minutes

# In-memory cache: (rate, fetched_at_unix_timestamp)
_cache: Tuple[float, float] = (0.0, 0.0)

_http: Optional[httpx.AsyncClient] = None


def _get_http() -> httpx.AsyncClient:
    global _http
    if _http is None or _http.is_closed:
        _http = httpx.AsyncClient(timeout=10.0)
    return _http


async def fetch_live_usdt_php_rate() -> float:
    """Return the current live USDT→PHP exchange rate.

    Uses a 5-minute in-memory cache to avoid excessive calls to the
    CoinGecko public API.  Raises ``RuntimeError`` if the request fails.
    """
    global _cache

    cached_rate, fetched_at = _cache
    if cached_rate > 0 and fetched_at > 0 and (time.monotonic() - fetched_at) < CACHE_TTL_SECONDS:
        logger.debug("Returning cached USDT→PHP rate: %.4f", cached_rate)
        return cached_rate

    logger.info("Fetching live USDT→PHP rate from CoinGecko")
    try:
        resp = await _get_http().get(COINGECKO_URL)
        resp.raise_for_status()
        data = resp.json()
        rate = float(data["tether"]["php"])
        if rate <= 0:
            raise ValueError(f"Unexpected rate value: {rate}")
        _cache = (rate, time.monotonic())
        logger.info("Live USDT→PHP rate: %.4f PHP", rate)
        return rate
    except Exception as exc:
        logger.error("Failed to fetch live USDT→PHP rate: %s", exc)
        raise RuntimeError(f"Could not fetch live exchange rate: {exc}") from exc


async def aclose() -> None:
    """Close the shared HTTP client."""
    global _http
    if _http and not _http.is_closed:
        await _http.aclose()
    _http = None


def get_cache_status() -> Tuple[float, bool]:
    """Return ``(rate, is_cached)`` reflecting the current in-memory cache state.

    ``is_cached`` is ``True`` when the cache was populated and the entry has
    not yet expired.
    """
    cached_rate, fetched_at = _cache
    is_cached = (
        cached_rate > 0
        and fetched_at > 0
        and (time.monotonic() - fetched_at) < CACHE_TTL_SECONDS
    )
    return cached_rate, is_cached
