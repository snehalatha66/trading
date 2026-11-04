import asyncio
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from ..supabase_client import supabase
from ._database import rows, stock_record

router = APIRouter()


@router.get("")
@router.get("/")
async def list_stocks(
    q: str | None = None,
    exchange: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
):
    query = supabase.table("stocks").select("*").order("symbol").limit(limit)
    if q:
        query = query.or_(f"symbol.ilike.%{q}%,name.ilike.%{q}%")
    if exchange:
        query = query.eq("exchange", exchange)
    return await asyncio.to_thread(rows, query)


@router.get("/symbol/{symbol}")
async def get_stock_by_symbol(symbol: str):
    matches = await asyncio.to_thread(
        rows,
        supabase.table("stocks")
        .select("*")
        .ilike("symbol", symbol)
        .limit(1),
    )
    if not matches:
        raise HTTPException(status_code=404, detail="Stock not found")
    return matches[0]


@router.get("/{stock_id}/snapshots")
async def get_market_snapshots(
    stock_id: UUID,
    limit: int = Query(default=100, ge=1, le=500),
):
    def get_snapshots():
        stock_record(stock_id)
        return rows(
            supabase.table("market_snapshots")
            .select("*")
            .eq("stock_id", str(stock_id))
            .order("snapshot_at", desc=True)
            .limit(limit)
        )

    return await asyncio.to_thread(get_snapshots)


@router.get("/{stock_id}/history")
async def get_historical_candles(
    stock_id: UUID,
    limit: int = Query(default=200, ge=1, le=1000),
):
    def get_history():
        stock_record(stock_id)
        return rows(
            supabase.table("historical_candles")
            .select("*")
            .eq("stock_id", str(stock_id))
            .order("period_start", desc=True)
            .limit(limit)
        )

    return await asyncio.to_thread(get_history)


@router.get("/{stock_id}")
async def get_stock(stock_id: UUID):
    return await asyncio.to_thread(stock_record, stock_id)
