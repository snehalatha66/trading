import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query, status

from ..config import settings
from .eodhd_market import (
    NIFTY_50_SYMBOL,
    _provider_get,
    _provider_timestamp,
    get_index_history,
    get_indices,
    get_news,
)

logger = logging.getLogger(__name__)
router = APIRouter()

_FUNDAMENTAL_FIELDS = (
    "MarketCapitalization",
    "PERatio",
    "EarningsShare",
    "ReturnOnEquityTTM",
    "DebtEquityRatio",
    "RevenueTTM",
    "NetIncomeTTM",
)


async def _load_source(fetch) -> dict[str, Any]:
    try:
        data = await fetch()
    except HTTPException as exc:
        return {"status": "unavailable", "detail": str(exc.detail), "data": None}
    return {"status": "available", "data": data}


def _nifty_context(quote_result: dict, history_result: dict) -> dict[str, Any]:
    if quote_result["status"] != "available":
        return quote_result

    quote_items = quote_result["data"]
    quote = quote_items[0] if quote_items else None
    history = history_result.get("data") if history_result["status"] == "available" else None
    previous = history[-2] if isinstance(history, list) and len(history) > 1 else None
    latest = history[-1] if isinstance(history, list) and history else None
    change_percent = None
    if latest and previous and previous.get("value"):
        change_percent = (
            (latest["value"] - previous["value"]) / previous["value"] * 100
        )

    return {
        "status": "available" if quote or latest else "unavailable",
        "quote": quote,
        "latest_history": latest,
        "previous_history": previous,
        "change_percent_from_latest_daily_closes": change_percent,
        "history_error": (
            history_result.get("detail")
            if history_result["status"] != "available"
            else None
        ),
    }


async def _stock_fundamentals(symbol: str) -> dict[str, Any]:
    data = await _provider_get(f"fundamentals/{symbol}")
    if not isinstance(data, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"EODHD returned unexpected fundamentals for {symbol}.",
        )

    highlights = data.get("Highlights")
    highlights = highlights if isinstance(highlights, dict) else {}
    general = data.get("General")
    general = general if isinstance(general, dict) else {}
    financials = data.get("Financials")
    income = financials.get("Income_Statement") if isinstance(financials, dict) else {}
    yearly = income.get("yearly") if isinstance(income, dict) else {}
    latest_year = next(iter(yearly.values()), {}) if isinstance(yearly, dict) else {}

    return {
        "symbol": symbol,
        "company": general.get("Name"),
        "exchange": general.get("Exchange"),
        "sector": general.get("Sector"),
        "industry": general.get("Industry"),
        "currency": general.get("CurrencyCode"),
        "metrics": {
            field: highlights.get(field)
            for field in _FUNDAMENTAL_FIELDS
            if highlights.get(field) is not None
        },
        "latest_reported_year": latest_year if isinstance(latest_year, dict) else {},
    }


@router.get("/insights")
async def generate_market_insights(
    symbol: str | None = Query(default=None, min_length=1, max_length=31),
) -> dict[str, Any]:
    if not settings.GEMINI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI insights are not configured. Set GEMINI_API_KEY in backend/.env.",
        )

    normalized_symbol = None
    if symbol:
        normalized_symbol = symbol.strip().upper()
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9.-]{0,30}", normalized_symbol):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Enter a valid stock symbol.",
            )

    quote_result, history_result, news_result = await asyncio.gather(
        _load_source(get_indices),
        _load_source(get_index_history),
        _load_source(lambda: get_news(10)),
    )
    nifty = _nifty_context(quote_result, history_result)
    if nifty["status"] != "available" and not news_result.get("data"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI insights are unavailable because no NIFTY 50 quote, history, or market news was returned.",
        )

    sensex = {
        "status": "unavailable",
        "detail": (
            "The configured market-data integration has no verified SENSEX "
            "quote or history source; no SENSEX data was used."
        ),
    }
    stock_data = None
    stock_error = None
    if normalized_symbol:
        try:
            stock_data = await _stock_fundamentals(normalized_symbol)
        except HTTPException as exc:
            stock_error = str(exc.detail)

    source_data = {
        "nifty_50": nifty,
        "sensex": sensex,
        "market_news": news_result,
        "stock_fundamentals": (
            {"status": "available", "data": stock_data}
            if stock_data
            else (
                {"status": "unavailable", "detail": stock_error}
                if normalized_symbol
                else {"status": "not_requested"}
            )
        ),
    }
    timestamps = []
    quote = nifty.get("quote")
    if quote and quote.get("timestamp"):
        timestamps.append(_provider_timestamp(quote["timestamp"]))
    latest_history = nifty.get("latest_history")
    if latest_history and latest_history.get("time"):
        timestamps.append(_provider_timestamp(latest_history["time"]))
    for article in news_result.get("data") or []:
        if article.get("timestamp"):
            timestamps.append(_provider_timestamp(article["timestamp"]))
    market_data_as_of = max(timestamps) if timestamps else None

    prompt = (
        "Create a concise, evidence-based Indian market analysis using only the "
        "supplied provider data. Include sections for Overall Market Analysis, "
        "NIFTY 50, SENSEX, Trend Summary, Market Trend Explanation, and Important "
        "Indicators and Signals. In Trend Summary, label a trend bullish, bearish, "
        "or neutral only when the supplied evidence supports that label; otherwise "
        "label it unavailable or inconclusive. Explain which supplied values or "
        "news support each conclusion. Do not invent prices, causes, indicators, "
        "news, or forecasts. Explicitly say SENSEX data is unavailable when its "
        "source status is unavailable. Treat headlines as context, not proof of "
        "price movement. This is informational, not investment advice.\n"
        "If stock fundamentals were requested, add a Stock-Specific Analysis "
        "section and limit conclusions to the supplied company metrics. If those "
        "metrics are unavailable, say so plainly.\n\n"
        f"Provider data (source status is authoritative):\n{source_data}"
    )
    url = (
        "https://generativelanguage.googleapis.com/"
        f"{settings.GEMINI_API_VERSION}/models/{settings.GEMINI_MODEL}:generateContent"
    )
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                params={"key": settings.GEMINI_API_KEY},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.2},
                },
            )
    except httpx.RequestError as exc:
        logger.warning("Gemini request failed (%s).", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini could not be reached. Check backend connectivity and retry.",
        ) from exc

    if response.is_error:
        logger.warning(
            "Gemini model %s returned HTTP %s.",
            settings.GEMINI_MODEL,
            response.status_code,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                f"Gemini model {settings.GEMINI_MODEL} returned HTTP "
                f"{response.status_code}; verify the model is enabled for this API key."
            ),
        )

    try:
        payload = response.json()
    except ValueError as exc:
        logger.warning("Gemini returned invalid JSON.")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini returned invalid JSON.",
        ) from exc
    try:
        insight = payload["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.warning("Gemini response did not contain generated text.")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini returned an unexpected response without generated text.",
        ) from exc

    return {
        "insight": insight,
        "market_data_as_of": market_data_as_of,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "symbol": normalized_symbol,
        "data_sources": source_data,
        "index_symbol": NIFTY_50_SYMBOL,
    }
