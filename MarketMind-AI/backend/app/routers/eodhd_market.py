import asyncio
import copy
import json
import logging
import math
import re
from datetime import date, datetime, timedelta, timezone
from time import monotonic
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..config import settings
from ..dependencies import get_current_user
from ..supabase_client import create_service_client
from ._database import rows

logger = logging.getLogger(__name__)
router = APIRouter()

EODHD_API = "https://eodhd.com/api"
NIFTY_50_SYMBOL = "NSEI.INDX"
NSE_MARKET_STATUS_URL = "https://www.nseindia.com/api/marketStatus"
NSE_HOLIDAY_CALENDAR_URL = "https://www.nseindia.com/api/holiday-master?type=trading"
NSE_TIME_ZONE = ZoneInfo("Asia/Kolkata")
NSE_REGULAR_TRADING_HOURS = "09:15–15:30 IST"
NSE_PRE_OPEN_HOURS = "09:00–09:08 IST"
_PROVIDER_CACHE_SECONDS = 120
_NSE_HOLIDAY_CACHE_SECONDS = 6 * 60 * 60
_PROVIDER_QUOTA_COOLDOWN_SECONDS = 3600
_provider_quota_until = (
    monotonic() + _PROVIDER_QUOTA_COOLDOWN_SECONDS
    if settings.EODHD_QUOTA_EXHAUSTED
    else 0.0
)
_provider_quota_detail = (
    "EODHD API quota or rate limit has been reached. Provider requests are "
    "paused for one hour to avoid repeated failures; verify the account quota "
    "or wait for the provider's reset."
)
_provider_cache: dict[
    tuple[str, tuple[tuple[str, str], ...]],
    tuple[float, object | None, int | None, str | None],
] = {}
_nse_holiday_cache: tuple[float, dict[date, str]] | None = None


def _is_quota_error(detail: str) -> bool:
    return bool(
        re.search(
            r"\b(?:quota|rate[\s-]*limit|daily[\s-]*limit|api[\s-]*limit|"
            r"request[\s-]*limit|limit\s+(?:exceeded|reached)|exhausted|"
            r"too many requests)\b",
            detail,
            re.IGNORECASE,
        )
    )


def _activate_quota_cooldown() -> None:
    global _provider_quota_until
    _provider_quota_until = monotonic() + _PROVIDER_QUOTA_COOLDOWN_SECONDS


async def _provider_get(path: str, params: dict[str, str] | None = None):
    if not settings.EODHD_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Market data is not configured. Set EODHD_API_KEY in backend/.env.",
        )

    request_params = {
        "api_token": settings.EODHD_API_KEY,
        "fmt": "json",
        **(params or {}),
    }
    cache_key = (
        path,
        tuple(sorted(
            (key, value)
            for key, value in request_params.items()
            if key != "api_token"
        )),
    )
    cached = _provider_cache.get(cache_key)
    if cached and cached[0] > monotonic():
        _, payload, error_status, error_detail = cached
        if error_status is not None:
            raise HTTPException(status_code=error_status, detail=error_detail)
        return copy.deepcopy(payload)
    if _provider_quota_until > monotonic():
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_provider_quota_detail,
        )

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(f"{EODHD_API}/{path}", params=request_params)
    except httpx.RequestError as exc:
        logger.warning("EODHD request to %s failed (%s).", path, type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"EODHD request to {path} failed due to a network error.",
        ) from exc

    if response.status_code == 404 and path == "news":
        _provider_cache[cache_key] = (
            monotonic() + _PROVIDER_CACHE_SECONDS,
            [],
            None,
            None,
        )
        return []
    if response.is_error:
        detail = response.text[:300].strip() or "Provider returned no error details."
        logger.warning("EODHD %s returned HTTP %s.", path, response.status_code)
        quota_error = response.status_code == 429 or _is_quota_error(detail)
        if quota_error:
            _activate_quota_cooldown()
        error_status = (
            status.HTTP_429_TOO_MANY_REQUESTS
            if quota_error
            else status.HTTP_502_BAD_GATEWAY
        )
        error_detail = (
            _provider_quota_detail
            if quota_error
            else f"EODHD {path} returned HTTP {response.status_code}: {detail}"
        )
        _provider_cache[cache_key] = (
            monotonic() + (
                _PROVIDER_QUOTA_COOLDOWN_SECONDS
                if quota_error
                else _PROVIDER_CACHE_SECONDS
            ),
            None,
            error_status,
            error_detail,
        )
        raise HTTPException(
            status_code=error_status,
            detail=error_detail,
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"EODHD {path} returned invalid JSON.",
        ) from exc

    if isinstance(payload, dict) and (
        payload.get("error") or payload.get("message") or payload.get("code")
    ):
        provider_error = str(
            payload.get("error") or payload.get("message") or payload.get("code")
        )[:300]
        logger.warning("EODHD %s returned an API error.", path)
        quota_error = (
            _is_quota_error(provider_error)
            or str(payload.get("code")) in {"429", "429.0"}
        )
        if quota_error:
            _activate_quota_cooldown()
        error_status = (
            status.HTTP_429_TOO_MANY_REQUESTS
            if quota_error
            else status.HTTP_502_BAD_GATEWAY
        )
        error_detail = (
            _provider_quota_detail
            if quota_error
            else f"EODHD {path} error: {provider_error}"
        )
        _provider_cache[cache_key] = (
            monotonic() + (
                _PROVIDER_QUOTA_COOLDOWN_SECONDS
                if quota_error
                else _PROVIDER_CACHE_SECONDS
            ),
            None,
            error_status,
            error_detail,
        )
        raise HTTPException(
            status_code=error_status,
            detail=error_detail,
        )
    _provider_cache[cache_key] = (
        monotonic() + _PROVIDER_CACHE_SECONDS,
        copy.deepcopy(payload),
        None,
        None,
    )
    return payload


def _index_record(data: dict, *, data_status: str) -> dict:
    timestamp = data.get("timestamp") or data.get("date")
    return {
        "symbol": NIFTY_50_SYMBOL,
        "name": "NIFTY 50",
        "value": data.get("close") or data.get("last_price") or data.get("price"),
        "change": data.get("change"),
        "change_percent": data.get("change_p") or data.get("change_percent"),
        "timestamp": _display_provider_timestamp(timestamp),
        "timestamp_precision": (
            "date"
            if isinstance(timestamp, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", timestamp)
            else "instant"
        ),
        "status": data_status,
    }


async def get_indices() -> list[dict]:
    try:
        quote_data = await _provider_get(f"real-time/{NIFTY_50_SYMBOL}")
        if not isinstance(quote_data, dict):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="EODHD returned an unexpected NIFTY 50 quote shape.",
            )
        return [_index_record(quote_data, data_status="provider_quote")]
    except HTTPException as realtime_error:
        if realtime_error.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            raise
        try:
            history = await get_index_history(NIFTY_50_SYMBOL)
        except HTTPException as history_error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    f"NIFTY 50 real-time data failed: {realtime_error.detail} "
                    f"End-of-day data also failed: {history_error.detail}"
                ),
            ) from history_error
        if not history:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    f"NIFTY 50 real-time data failed: {realtime_error.detail} "
                    "and EODHD returned no historical observations."
                ),
            ) from realtime_error

        latest = history[-1]
        previous = history[-2] if len(history) > 1 else None
        change = latest["value"] - previous["value"] if previous else None
        change_percent = (
            change / previous["value"] * 100
            if previous and previous["value"]
            else None
        )
        return [{
            "symbol": NIFTY_50_SYMBOL,
            "name": "NIFTY 50",
            "value": latest["value"],
            "change": change,
            "change_percent": change_percent,
            "timestamp": latest["time"],
            "status": "end-of-day",
            "realtime_error": str(realtime_error.detail),
        }]


async def get_index_history(symbol: str = NIFTY_50_SYMBOL) -> list[dict]:
    if symbol != NIFTY_50_SYMBOL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only the verified NIFTY 50 symbol {NIFTY_50_SYMBOL} is supported.",
        )
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=365)
    rows = await _provider_get(
        f"eod/{symbol}",
        {"from": start.isoformat(), "to": end.isoformat(), "period": "d"},
    )
    if not isinstance(rows, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"EODHD returned an unexpected history shape for {symbol}.",
        )
    return [
        {
            "time": row["date"],
            "value": row["close"],
            "open": row.get("open"),
            "high": row.get("high"),
            "low": row.get("low"),
            "volume": row.get("volume"),
        }
        for row in sorted(rows, key=lambda item: item.get("date", ""))
        if row.get("date") is not None and row.get("close") is not None
    ]


def _news_source(link: str) -> str | None:
    hostname = urlparse(link).hostname
    return hostname.removeprefix("www.") if hostname else None


_INDIAN_MARKET_TERMS = re.compile(
    r"\b(?:"
    r"india(?:n)? (?:stock|share|equity|financial|capital|market|exchange)s?|"
    r"indian markets?|dalal street|nifty(?:\s*(?:50|bank|next\s*50))?|"
    r"sensex|national stock exchange of india|bombay stock exchange|"
    r"NSE India|BSE India|SEBI|Reserve Bank of India|RBI|rupee|INR"
    r")\b",
    re.IGNORECASE,
)
_INDIAN_COMPANY_TERMS = re.compile(
    r"\b(?:"
    r"Reliance Industries|HDFC Bank|ICICI Bank|State Bank of India|SBI|"
    r"Infosys|Tata Consultancy Services|TCS|Bharti Airtel|Adani|"
    r"Axis Bank|Kotak Mahindra|Larsen & Toubro|Hindustan Unilever|"
    r"Indian Oil|ONGC|Bajaj Finance|Maruti Suzuki|Wipro"
    r")\b",
    re.IGNORECASE,
)
_FINANCIAL_NEWS_CONTEXT = re.compile(
    r"\b(?:stock|stocks|share|shares|equity|market|markets|trading|"
    r"earnings|results|revenue|profit|loss|listing|ipo|dividend|"
    r"quarter|financial|investment|investor|securities|exchange)\b",
    re.IGNORECASE,
)


def _is_indian_market_article(item: dict) -> bool:
    symbols = item.get("symbols")
    symbols = symbols if isinstance(symbols, list) else []
    tags = item.get("tags")
    tags = tags if isinstance(tags, list) else [tags] if isinstance(tags, str) else []
    if any(
        isinstance(symbol, str) and symbol.upper().endswith((".NSE", ".BSE"))
        for symbol in symbols
    ):
        return True
    evidence = " ".join(
        str(value)
        for value in [
            item.get("title"),
            item.get("content"),
            *tags,
        ]
        if value
    )
    return bool(
        _INDIAN_MARKET_TERMS.search(evidence)
        or (
            _INDIAN_COMPANY_TERMS.search(evidence)
            and _FINANCIAL_NEWS_CONTEXT.search(evidence)
        )
    )


def _valid_news_item(item: dict) -> bool:
    if not isinstance(item, dict):
        return False
    title = item.get("title")
    link = item.get("link")
    timestamp = item.get("date")
    if not isinstance(title, str) or not title.strip():
        return False
    if not isinstance(link, str):
        return False
    parsed_link = urlparse(link)
    if parsed_link.scheme != "https" or not parsed_link.hostname:
        return False
    if not isinstance(timestamp, str):
        return False
    try:
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError:
        return False
    return _is_indian_market_article(item)


_SCREENER_SORT_FIELDS = {
    "change": "refund_1d_p",
    "market_cap": "market_capitalization",
    "volume": "avgvol_1d",
    "price": "adjusted_close",
}


def _screener_entitlement_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            "EODHD Stock Screener access is unavailable for the configured "
            "subscription. EODHD documents the Screener API in its All-In-One "
            "and EOD+Intraday — All World Extended plans. NSE rankings also "
            "require NSE exchange coverage. No market ranking is shown until "
            "the provider authorizes this request; use another licensed "
            "India-market provider if those entitlements are unavailable."
        ),
    )


async def _fetch_nse_screener(
    *,
    sort_field: str,
    descending: bool,
    limit: int,
    offset: int = 0,
    name_prefix: str | None = None,
    sector: str | None = None,
) -> list[dict]:
    filters: list[list[object]] = [["exchange", "=", "NSE"]]
    if name_prefix:
        filters.append(["name", "match", f"{name_prefix}*"])
    if sector:
        filters.append(["sector", "match", f"*{sector}*"])
    try:
        payload = await _provider_get(
            "screener",
            {
                "filters": json.dumps(filters, separators=(",", ":")),
                "sort": f"{sort_field}.{ 'desc' if descending else 'asc' }",
                "limit": str(limit),
                "offset": str(offset),
            },
        )
    except HTTPException as exc:
        if "HTTP 403" in str(exc.detail) or "forbidden" in str(exc.detail).casefold():
            raise _screener_entitlement_error() from exc
        raise

    records = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(records, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="EODHD returned an unexpected Stock Screener response.",
        )
    results = []
    for item in records:
        if not isinstance(item, dict):
            continue
        code = item.get("code")
        price = item.get("adjusted_close")
        if not isinstance(code, str) or not code.strip() or price is None:
            continue
        results.append({
            "symbol": f"{code.strip()}.NSE",
            "name": item.get("name"),
            "exchange": item.get("exchange"),
            "sector": item.get("sector"),
            "industry": item.get("industry"),
            "price": price,
            "change": item.get("refund_1d"),
            "change_percent": item.get("refund_1d_p"),
            "market_cap": item.get("market_capitalization"),
            "volume": item.get("avgvol_1d"),
            "timestamp": item.get("last_day_data_date"),
            "status": "end-of-day",
            "source": "EODHD Stock Screener",
        })
    return results


async def get_market_movers(kind: str) -> list[dict]:
    if kind not in {"gainers", "losers", "active"}:
        raise HTTPException(status_code=400, detail="kind must be gainers, losers, or active.")
    sort_field = "avgvol_1d" if kind == "active" else "refund_1d_p"
    descending = kind != "losers"
    return await _fetch_nse_screener(
        sort_field=sort_field,
        descending=descending,
        limit=10,
    )


async def get_stock_screener(
    *,
    query: str | None,
    sector: str | None,
    sort: str,
    descending: bool,
    limit: int,
    offset: int,
) -> list[dict]:
    sort_field = _SCREENER_SORT_FIELDS.get(sort)
    if not sort_field:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported screener sort field: {sort}.",
        )
    name_prefix = query.strip() if query else None
    if name_prefix and not re.fullmatch(r"[A-Za-z0-9 .&'-]{1,60}", name_prefix):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search names may contain letters, numbers, spaces, periods, apostrophes, ampersands, and hyphens.",
        )
    sector_name = sector.strip() if sector else None
    if sector_name and not re.fullmatch(r"[A-Za-z0-9 &'-]{1,60}", sector_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a valid sector name.",
        )
    return await _fetch_nse_screener(
        sort_field=sort_field,
        descending=descending,
        limit=limit,
        offset=offset,
        name_prefix=name_prefix,
        sector=sector_name,
    )


async def get_sector_performance() -> list[dict]:
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            "NSE sector performance is unavailable. The EODHD Stock Screener "
            "returns individual securities, not verified sector-index returns "
            "or a complete sector constituent feed. This feature requires an "
            "authorized NSE sector-index/constituent data source; no sector "
            "performance values are estimated from partial listings."
        ),
    )


@router.get("/indices")
async def indices():
    return await get_indices()


@router.get("/indices/{symbol}/history")
async def index_history(symbol: str = NIFTY_50_SYMBOL):
    return await get_index_history(symbol)


@router.get("/quotes")
async def quotes(
    symbols: str = Query(min_length=1, description="Comma-separated EODHD symbols."),
):
    requested = list(dict.fromkeys(symbol.strip().upper() for symbol in symbols.split(",")))
    if len(requested) > 50 or any(
        not re.fullmatch(r"[A-Z0-9][A-Z0-9.-]{0,30}", symbol)
        for symbol in requested
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at most 50 valid provider stock symbols.",
        )
    return await asyncio.gather(*(get_stock_quote(symbol) for symbol in requested))


async def get_stock_quote(symbol: str) -> dict:
    normalized_symbol = symbol.strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9.-]{0,30}", normalized_symbol):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a valid provider stock symbol.",
        )
    data = await _provider_get(f"real-time/{normalized_symbol}")
    if not isinstance(data, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"EODHD returned an unexpected quote for {normalized_symbol}.",
        )
    price = next(
        (data.get(key) for key in ("price", "last_price", "close") if data.get(key) is not None),
        None,
    )
    parsed_price = _provider_number(price, f"{normalized_symbol} price", minimum=0)
    if parsed_price <= 0:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"EODHD returned a non-positive quote for {normalized_symbol}.",
        )
    return {
        "symbol": normalized_symbol,
        "price": parsed_price,
        "change": data.get("change"),
        "change_percent": data.get("change_p") or data.get("change_percent"),
        "timestamp": _display_provider_timestamp(data.get("timestamp") or data.get("date")),
        "status": "provider_quote",
    }


@router.get("/fundamentals/{symbol}")
async def fundamentals(symbol: str):
    normalized_symbol = symbol.strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9.-]{0,30}", normalized_symbol):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a valid provider stock symbol.",
        )
    data = await _provider_get(f"fundamentals/{normalized_symbol}")
    if not isinstance(data, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"EODHD returned an unexpected fundamentals response for {normalized_symbol}.",
        )
    return data


@router.get("/movers/{kind}")
async def market_movers(kind: str):
    return await get_market_movers(kind)


@router.get("/screener")
async def stock_screener(
    q: str | None = Query(default=None, max_length=60),
    sector: str | None = Query(default=None, max_length=60),
    sort: str = Query(default="market_cap", pattern="^(change|market_cap|volume|price)$"),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=5000),
):
    return await get_stock_screener(
        query=q,
        sector=sector,
        sort=sort,
        descending=order == "desc",
        limit=limit,
        offset=offset,
    )


@router.get("/sectors")
async def sectors():
    return await get_sector_performance()


@router.get("/news")
async def news(limit: int = Query(default=10, ge=1, le=50)):
    return await get_news(limit)


async def get_news(limit: int = 10) -> list[dict]:
    rows = await _provider_get("news", {"t": "india", "limit": str(max(limit, 50))})
    if not isinstance(rows, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="EODHD returned an unexpected news response.",
        )
    return [
        {
            "title": item.get("title"),
            "summary": item.get("content") or item.get("description"),
            "source": item.get("source") or _news_source(item["link"]),
            "timestamp": item.get("date"),
            "url": item.get("link"),
        }
        for item in rows
        if _valid_news_item(item)
    ][:limit]


async def _nse_holiday_calendar() -> dict[date, str]:
    global _nse_holiday_cache
    cached = _nse_holiday_cache
    if cached and cached[0] > monotonic():
        return cached[1]

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.nseindia.com/",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(NSE_HOLIDAY_CALENDAR_URL, headers=headers)
    except httpx.RequestError as exc:
        logger.warning("NSE holiday-calendar request failed (%s).", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="NSE trading holiday calendar could not be reached.",
        ) from exc
    if response.is_error:
        logger.warning("NSE holiday-calendar returned HTTP %s.", response.status_code)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"NSE trading holiday calendar could not be verified (HTTP {response.status_code}).",
        )
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="NSE returned an invalid trading holiday calendar.",
        ) from exc

    capital_market_holidays = payload.get("CM") if isinstance(payload, dict) else None
    if not isinstance(capital_market_holidays, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="NSE holiday calendar did not include the Capital Market schedule.",
        )
    holidays: dict[date, str] = {}
    for item in capital_market_holidays:
        if not isinstance(item, dict):
            continue
        try:
            holiday_date = datetime.strptime(
                item["tradingDate"], "%d-%b-%Y"
            ).date()
        except (KeyError, TypeError, ValueError):
            continue
        holidays[holiday_date] = str(item.get("description") or "NSE trading holiday")

    _nse_holiday_cache = (
        monotonic() + _NSE_HOLIDAY_CACHE_SECONDS,
        holidays,
    )
    return holidays


@router.get("/status")
async def market_status():
    checked_at = datetime.now(timezone.utc).isoformat()
    today_ist = datetime.now(NSE_TIME_ZONE).date()
    holiday_calendar_error = None
    try:
        holidays = await _nse_holiday_calendar()
        holiday_description = holidays.get(today_ist)
        holiday_calendar_status = "available"
    except HTTPException as exc:
        holiday_description = None
        holiday_calendar_status = "unavailable"
        holiday_calendar_error = str(exc.detail)

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.nseindia.com/",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(NSE_MARKET_STATUS_URL, headers=headers)
    except httpx.RequestError as exc:
        logger.warning("NSE market-status request failed (%s).", type(exc).__name__)
        if holiday_description:
            return _market_status_result(
                "Closed",
                checked_at,
                holiday_calendar_status=holiday_calendar_status,
                holiday_description=holiday_description,
                holiday_calendar_error=holiday_calendar_error,
            )
        return {
            "status": "unavailable",
            "detail": "NSE market status could not be verified.",
            "checked_at": checked_at,
            "holiday_calendar_status": holiday_calendar_status,
            "holiday_calendar_error": holiday_calendar_error,
        }

    if response.status_code == 404:
        if holiday_description:
            return _market_status_result(
                "Closed",
                checked_at,
                holiday_calendar_status=holiday_calendar_status,
                holiday_description=holiday_description,
                holiday_calendar_error=holiday_calendar_error,
            )
        return {
            "status": "unavailable",
            "detail": "NSE market status could not be verified (no status response).",
            "checked_at": checked_at,
            "holiday_calendar_status": holiday_calendar_status,
            "holiday_calendar_error": holiday_calendar_error,
        }
    if response.is_error:
        logger.warning("NSE market-status returned HTTP %s.", response.status_code)
        if holiday_description:
            return _market_status_result(
                "Closed",
                checked_at,
                holiday_calendar_status=holiday_calendar_status,
                holiday_description=holiday_description,
                holiday_calendar_error=holiday_calendar_error,
            )
        return {
            "status": "unavailable",
            "detail": f"NSE market status could not be verified (HTTP {response.status_code}).",
            "checked_at": checked_at,
            "holiday_calendar_status": holiday_calendar_status,
            "holiday_calendar_error": holiday_calendar_error,
        }
    try:
        payload = response.json()
    except ValueError:
        if holiday_description:
            return _market_status_result(
                "Closed",
                checked_at,
                holiday_calendar_status=holiday_calendar_status,
                holiday_description=holiday_description,
                holiday_calendar_error=holiday_calendar_error,
            )
        return {
            "status": "unavailable",
            "detail": "NSE returned an invalid market-status response.",
            "checked_at": checked_at,
            "holiday_calendar_status": holiday_calendar_status,
            "holiday_calendar_error": holiday_calendar_error,
        }

    states = payload.get("marketState") if isinstance(payload, dict) else None
    capital_market = next(
        (
            state
            for state in states or []
            if str(state.get("market", "")).casefold() == "capital market"
        ),
        None,
    )
    market_state = (
        str(capital_market.get("marketStatus", "")).strip()
        if capital_market
        else ""
    )
    normalized_market_state = re.sub(r"[\s_-]+", "", market_state.casefold())
    if normalized_market_state not in {"open", "closed", "preopen", "postclose"}:
        if holiday_description:
            return _market_status_result(
                "Closed",
                checked_at,
                holiday_calendar_status=holiday_calendar_status,
                holiday_description=holiday_description,
                holiday_calendar_error=holiday_calendar_error,
            )
        return {
            "status": "unavailable",
            "detail": "NSE did not provide a verifiable capital-market status.",
            "checked_at": checked_at,
            "holiday_calendar_status": holiday_calendar_status,
            "holiday_calendar_error": holiday_calendar_error,
        }
    normalized_status = {
        "open": "Open",
        "closed": "Closed",
        "preopen": "Pre-open",
        "postclose": "Closed",
    }[normalized_market_state]
    return _market_status_result(
        normalized_status,
        checked_at,
        exchange_status=market_state,
        trade_date=capital_market.get("tradeDate"),
        holiday_calendar_status=holiday_calendar_status,
        holiday_description=holiday_description,
        holiday_calendar_error=holiday_calendar_error,
    )


def _market_status_result(
    status_text: str,
    checked_at: str,
    *,
    exchange_status: str | None = None,
    trade_date: str | None = None,
    holiday_calendar_status: str = "unavailable",
    holiday_description: str | None = None,
    holiday_calendar_error: str | None = None,
) -> dict:
    return {
        "status": status_text,
        "source": "NSE Capital Market status",
        "exchange_status": exchange_status,
        "trade_date": trade_date,
        "is_trading_holiday": holiday_description is not None,
        "holiday": holiday_description,
        "holiday_calendar_source": (
            "NSE Capital Market trading holiday calendar"
            if holiday_calendar_status == "available"
            else None
        ),
        "holiday_calendar_status": holiday_calendar_status,
        "holiday_calendar_error": holiday_calendar_error,
        "pre_open_hours": NSE_PRE_OPEN_HOURS,
        "regular_trading_hours": NSE_REGULAR_TRADING_HOURS,
        "timezone": "Asia/Kolkata",
        "checked_at": checked_at,
    }


def _display_provider_timestamp(value: object) -> str | None:
    if isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return value
    if value is None:
        return None
    return _provider_timestamp(value)


def _provider_timestamp(value: object) -> str:
    try:
        if isinstance(value, bool) or value is None:
            raise ValueError("timestamp is missing")
        if isinstance(value, (int, float)):
            seconds = float(value)
            if not math.isfinite(seconds):
                raise ValueError("timestamp is not finite")
            parsed = datetime.fromtimestamp(seconds, tz=timezone.utc)
        else:
            text = str(value)
            if len(text) == 10:
                parsed = datetime.fromisoformat(text).replace(tzinfo=timezone.utc)
            else:
                parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except (OverflowError, OSError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="EODHD returned an invalid market-data timestamp.",
        ) from exc


def _provider_number(
    value: object,
    field: str,
    *,
    minimum: float | None = None,
) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"EODHD returned an invalid {field} value.",
        ) from exc
    if not math.isfinite(number) or (minimum is not None and number < minimum):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"EODHD returned an invalid {field} value.",
        )
    return number


def _validated_candles(candles: list[dict]) -> list[dict]:
    validated = []
    seen_dates = set()
    for candle in candles:
        try:
            day = datetime.strptime(str(candle.get("time")), "%Y-%m-%d").date()
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="EODHD returned a historical candle with an invalid date.",
            ) from exc
        if day in seen_dates:
            continue
        seen_dates.add(day)

        opening = _provider_number(candle.get("open"), "open", minimum=0)
        high = _provider_number(candle.get("high"), "high", minimum=0)
        low = _provider_number(candle.get("low"), "low", minimum=0)
        close = _provider_number(candle.get("value"), "close", minimum=0)
        if (
            opening <= 0
            or low <= 0
            or close <= 0
            or high < low
            or not low <= opening <= high
            or not low <= close <= high
        ):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="EODHD returned inconsistent NIFTY 50 OHLC values.",
            )
        volume = candle.get("volume")
        validated.append(
            {
                "open": opening,
                "high": high,
                "low": low,
                "close": close,
                "volume": (
                    _provider_number(volume, "volume", minimum=0)
                    if volume is not None
                    else None
                ),
                "period_start": datetime.combine(
                    day, datetime.min.time(), tzinfo=timezone.utc
                ).isoformat(),
                "period_end": datetime.combine(
                    day + timedelta(days=1),
                    datetime.min.time(),
                    tzinfo=timezone.utc,
                ).isoformat(),
            }
        )
    return validated


def _ensure_nifty_stock(client) -> str:
    saved = rows(
        client.table("stocks")
        .upsert(
            {"symbol": NIFTY_50_SYMBOL, "name": "NIFTY 50", "exchange": "INDX"},
            on_conflict="symbol",
        )
        .select("id")
    )
    if not saved:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase did not return the saved NIFTY 50 stock record.",
        )
    return saved[0]["id"]


def _save_snapshot(client, stock_id: str, snapshot: dict) -> bool:
    snapshot_at = _provider_timestamp(snapshot.get("timestamp"))
    price = _provider_number(
        snapshot.get("value"),
        "NIFTY 50 index value",
        minimum=0,
    )
    if price <= 0:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="EODHD returned an invalid NIFTY 50 index value.",
        )
    existing = rows(
        client.table("market_snapshots")
        .select("id")
        .eq("stock_id", stock_id)
        .eq("snapshot_at", snapshot_at)
        .limit(1)
    )
    if existing:
        return False
    volume = snapshot.get("volume")
    record = {
        "stock_id": stock_id,
        "price": price,
        "volume": (
            _provider_number(volume, "volume", minimum=0)
            if volume is not None
            else None
        ),
        "snapshot_at": snapshot_at,
    }
    return bool(rows(client.table("market_snapshots").insert(record).select("id")))


def _save_candles(client, stock_id: str, candles: list[dict]) -> int:
    if not candles:
        return 0
    first_date = candles[0]["period_start"]
    last_date = candles[-1]["period_start"]
    existing = rows(
        client.table("historical_candles")
        .select("period_start")
        .eq("stock_id", stock_id)
        .gte("period_start", first_date)
        .lte("period_start", last_date)
        .limit(1000)
    )
    existing_dates = {str(item["period_start"])[:10] for item in existing}
    missing = [
        {"stock_id": stock_id, **candle}
        for candle in candles
        if candle["period_start"][:10] not in existing_dates
    ]
    if not missing:
        return 0
    return len(
        rows(client.table("historical_candles").insert(missing).select("id"))
    )


def _save_news(client, articles: list[dict]) -> int:
    if not articles:
        return 0
    records = [
        {
            "title": article["title"],
            "url": article["url"],
            "source": article["source"],
            "published_at": _provider_timestamp(article["timestamp"]),
        }
        for article in articles
    ]
    return len(
        rows(
            client.table("news_articles")
            .upsert(records, on_conflict="url")
            .select("url")
        )
    )


@router.post("/sync")
async def sync_market_data(current_user: dict = Depends(get_current_user)):
    del current_user
    client = create_service_client()
    errors = []
    indices_data = []
    history_data = []
    news_data = []

    for label, fetch, target in (
        ("index_quote", get_indices, indices_data),
        ("index_history", get_index_history, history_data),
        ("market_news", lambda: get_news(50), news_data),
    ):
        try:
            target.extend(await fetch())
        except HTTPException as exc:
            errors.append({"source": label, "detail": exc.detail})

    validated_candles = _validated_candles(history_data) if history_data else []
    quote = indices_data[0] if indices_data else None
    snapshot = quote
    if snapshot is None and history_data:
        latest = history_data[-1]
        snapshot = {
            "timestamp": latest["time"],
            "value": latest["value"],
            "volume": latest.get("volume"),
        }

    market_result = {
        "symbol": NIFTY_50_SYMBOL,
        "snapshot_saved": False,
        "candles_saved": 0,
    }
    if snapshot is not None or validated_candles:
        stock_id = _ensure_nifty_stock(client)
        market_result["snapshot_saved"] = (
            _save_snapshot(client, stock_id, snapshot)
            if snapshot is not None
            else False
        )
        market_result["candles_saved"] = _save_candles(
            client,
            stock_id,
            validated_candles,
        )

    news_saved = _save_news(client, news_data)
    if not (
        market_result["snapshot_saved"]
        or market_result["candles_saved"]
        or news_saved
    ) and errors:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"message": "No EODHD data could be persisted.", "errors": errors},
        )

    return {
        "source": "EODHD",
        "market": {
            **market_result,
            "quote": quote,
            "history": history_data,
        },
        "news": {
            "received": len(news_data),
            "saved": news_saved,
            "articles": news_data,
        },
        "errors": errors,
    }
