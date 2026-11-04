from uuid import UUID

from fastapi import APIRouter, Query

from ..supabase_client import supabase
from ._database import rows, stock_record

router = APIRouter()


def _rsi(closes: list[float], period: int) -> float | None:
    if len(closes) <= period:
        return None
    changes = [current - previous for previous, current in zip(closes, closes[1:])]
    gains = [max(change, 0.0) for change in changes[-period:]]
    losses = [max(-change, 0.0) for change in changes[-period:]]
    average_gain = sum(gains) / period
    average_loss = sum(losses) / period
    if average_loss == 0:
        return 100.0 if average_gain else 50.0
    relative_strength = average_gain / average_loss
    return 100 - 100 / (1 + relative_strength)


@router.get("/stocks/{stock_id}")
async def get_stock_indicators(
    stock_id: UUID,
    limit: int = Query(default=200, ge=50, le=1000),
):
    stock_record(stock_id)
    candles = rows(
        supabase.table("historical_candles")
        .select("close,period_end")
        .eq("stock_id", str(stock_id))
        .order("period_start", desc=True)
        .limit(limit)
    )
    candles.reverse()
    if not candles:
        return {
            "stock_id": str(stock_id),
            "as_of": None,
            "sample_count": 0,
            "sma_20": None,
            "sma_50": None,
            "rsi_14": None,
        }

    closes = [float(candle["close"]) for candle in candles]
    return {
        "stock_id": str(stock_id),
        "as_of": candles[-1]["period_end"],
        "sample_count": len(closes),
        "sma_20": sum(closes[-20:]) / 20 if len(closes) >= 20 else None,
        "sma_50": sum(closes[-50:]) / 50 if len(closes) >= 50 else None,
        "rsi_14": _rsi(closes, 14),
    }
