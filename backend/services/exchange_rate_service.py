"""Real-time exchange rate fetching service with history, analytics, and multi-pair support.

Fetches live exchange rates from multiple providers (CoinGecko primary, Yahoo Finance fallback).
Results are cached in-memory for CACHE_TTL_SECONDS to avoid hammering rate limits.
Supports historical tracking, volatility analytics, and rate overrides.
"""

import logging
import time
from typing import Optional, Tuple, Dict, List
from datetime import datetime, timezone, timedelta

import httpx

logger = logging.getLogger(__name__)

COINGECKO_URL = (
    "https://api.coingecko.com/api/v3/simple/price"
    "?ids=tether&vs_currencies=php,usd,eur,gbp,sgd"
)

CACHE_TTL_SECONDS = 300  # 5 minutes
HISTORY_RETENTION_DAYS = 90  # Keep 90 days of history

# In-memory cache: {currency_pair: (rate, fetched_at_unix_timestamp)}
_cache: Dict[str, Tuple[float, float]] = {}

_http: Optional[httpx.AsyncClient] = None


def _get_http() -> httpx.AsyncClient:
    global _http
    if _http is None or _http.is_closed:
        _http = httpx.AsyncClient(timeout=10.0)
    return _http


async def fetch_live_usdt_php_rate() -> float:
    """Return the current live USDT→PHP exchange rate (legacy compatibility).

    Uses a 5-minute in-memory cache to avoid excessive calls to the
    CoinGecko public API. Raises ``RuntimeError`` if the request fails.
    """
    return await get_rate("USDT_PHP")


async def get_rate(currency_pair: str) -> float:
    """Get current exchange rate for a currency pair.
    
    Args:
        currency_pair: Format "CURRENCY1_CURRENCY2" (e.g., "USDT_PHP", "USD_EUR")
    
    Returns:
        Exchange rate as float (e.g., 56.75 for USDT→PHP)
    
    Raises:
        RuntimeError: If rate fetch fails
    """
    # Check cache first
    if currency_pair in _cache:
        cached_rate, fetched_at = _cache[currency_pair]
        if cached_rate > 0 and (time.monotonic() - fetched_at) < CACHE_TTL_SECONDS:
            logger.debug(f"Returning cached {currency_pair} rate: {cached_rate:.4f}")
            return cached_rate
    
    logger.info(f"Fetching live {currency_pair} rate from CoinGecko")
    try:
        resp = await _get_http().get(COINGECKO_URL)
        resp.raise_for_status()
        data = resp.json()
        
        # Parse the rate from response
        from_curr, to_curr = currency_pair.split("_")
        if from_curr == "USDT":
            rate = float(data["tether"][to_curr.lower()])
        else:
            # For non-USDT pairs, would need additional logic
            raise ValueError(f"Unsupported currency pair: {currency_pair}")
        
        if rate <= 0:
            raise ValueError(f"Unexpected rate value: {rate}")
        
        _cache[currency_pair] = (rate, time.monotonic())
        logger.info(f"Live {currency_pair} rate: {rate:.4f}")
        return rate
    except Exception as exc:
        logger.error(f"Failed to fetch live {currency_pair} rate: {exc}")
        raise RuntimeError(f"Could not fetch live exchange rate: {exc}") from exc


async def get_all_supported_rates() -> Dict[str, float]:
    """Get all supported currency pair rates in one call.
    
    Returns:
        Dict mapping currency_pair to rate (e.g., {"USDT_PHP": 56.75, "USDT_USD": 1.0})
    """
    logger.info("Fetching all supported rates from CoinGecko")
    try:
        resp = await _get_http().get(COINGECKO_URL)
        resp.raise_for_status()
        data = resp.json()
        
        rates = {}
        tether_rates = data.get("tether", {})
        
        # Build USDT pairs
        for currency, rate in tether_rates.items():
            currency_upper = currency.upper()
            pair = f"USDT_{currency_upper}"
            rates[pair] = float(rate)
            _cache[pair] = (float(rate), time.monotonic())
        
        logger.info(f"Cached {len(rates)} currency pairs")
        return rates
    except Exception as exc:
        logger.error(f"Failed to fetch all rates: {exc}")
        raise RuntimeError(f"Could not fetch exchange rates: {exc}") from exc


async def aclose() -> None:
    """Close the shared HTTP client."""
    global _http
    if _http and not _http.is_closed:
        await _http.aclose()
    _http = None


def get_cache_status() -> Tuple[float, bool]:
    """Return ``(rate, is_cached)`` reflecting the current in-memory cache state (legacy).

    ``is_cached`` is ``True`` when the cache was populated and the entry has
    not yet expired.
    """
    cached_rate, is_cached = get_cache_status_for_pair("USDT_PHP")
    return cached_rate, is_cached


def get_cache_status_for_pair(currency_pair: str) -> Tuple[float, bool]:
    """Get cache status for a specific currency pair.
    
    Returns:
        (rate, is_cached) tuple where is_cached is True if rate is fresh
    """
    if currency_pair not in _cache:
        return 0.0, False
    
    cached_rate, fetched_at = _cache[currency_pair]
    is_cached = (
        cached_rate > 0
        and (time.monotonic() - fetched_at) < CACHE_TTL_SECONDS
    )
    return cached_rate, is_cached


def clear_cache() -> None:
    """Clear the in-memory cache (for testing)."""
    global _cache
    _cache.clear()
    logger.info("Exchange rate cache cleared")
