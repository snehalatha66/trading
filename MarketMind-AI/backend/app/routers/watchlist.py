import asyncio
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field, field_validator

from ..dependencies import get_current_user
from ._database import rows, storage_error

router = APIRouter()
WATCHLIST_MIGRATION = "20261103170000_watchlist_schema_alignment.sql"


class WatchlistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Watchlist name cannot be empty.")
        return normalized


class WatchlistUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Watchlist name cannot be empty.")
        return normalized


class WatchlistStockCreate(BaseModel):
    stock_id: UUID


def _watchlist_error(exc: APIError) -> HTTPException:
    if str(getattr(exc, "code", "")) == "23505":
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This stock is already in the watchlist.",
        )
    return storage_error(exc, "watchlist", WATCHLIST_MIGRATION)


def _is_missing_owner_id(exc: APIError) -> bool:
    return (
        str(getattr(exc, "code", "")) in {"42703", "PGRST204"}
        and "owner_id" in str(getattr(exc, "message", "")).casefold()
    )


async def _run_database(operation):
    try:
        return await asyncio.to_thread(operation)
    except APIError as exc:
        raise _watchlist_error(exc) from exc


def _owned_watchlist(database, watchlist_id: UUID, owner_id: str) -> dict:
    try:
        records = rows(
            database.table("watchlists")
            .select("*")
            .eq("id", str(watchlist_id))
            .eq("owner_id", owner_id)
            .limit(1)
        )
    except APIError as exc:
        if not _is_missing_owner_id(exc):
            raise
        records = rows(
            database.table("watchlists")
            .select("*")
            .eq("id", str(watchlist_id))
            .eq("user_id", owner_id)
            .limit(1)
        )
    if not records:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return records[0]


def _watchlists_with_stocks(database, owner_id: str) -> list[dict]:
    try:
        watchlists = rows(
            database.table("watchlists")
            .select("*")
            .eq("owner_id", owner_id)
            .order("created_at", desc=True)
        )
    except APIError as exc:
        if not _is_missing_owner_id(exc):
            raise
        watchlists = rows(
            database.table("watchlists")
            .select("*")
            .eq("user_id", owner_id)
            .order("created_at", desc=True)
        )
    if not watchlists:
        return []

    watchlist_ids = [str(item["id"]) for item in watchlists]
    links = rows(
        database.table("watchlist_stocks")
        .select("watchlist_id,stock_id")
        .in_("watchlist_id", watchlist_ids)
    )
    stock_ids = list(dict.fromkeys(str(link["stock_id"]) for link in links))
    stocks = []
    snapshots = []
    if stock_ids:
        stocks = rows(
            database.table("stocks")
            .select("*")
            .in_("id", stock_ids)
        )
        try:
            snapshots = rows(
                database.rpc(
                    "get_latest_market_snapshots",
                    {"p_stock_ids": stock_ids},
                )
            )
        except APIError as exc:
            if str(getattr(exc, "code", "")) != "PGRST202":
                raise

            def latest_snapshot(stock_id):
                matches = rows(
                    database.table("market_snapshots")
                    .select("*")
                    .eq("stock_id", stock_id)
                    .order("snapshot_at", desc=True)
                    .limit(1)
                )
                return matches[0] if matches else None

            with ThreadPoolExecutor(max_workers=min(len(stock_ids), 8)) as executor:
                snapshots = [
                    snapshot
                    for snapshot in executor.map(latest_snapshot, stock_ids)
                    if snapshot is not None
                ]

    stocks_by_id = {str(stock["id"]): stock for stock in stocks}
    latest_snapshot_by_stock = {}
    for snapshot in snapshots:
        latest_snapshot_by_stock.setdefault(str(snapshot["stock_id"]), snapshot)
    stocks_by_watchlist = {watchlist_id: [] for watchlist_id in watchlist_ids}
    for link in links:
        stock_id = str(link["stock_id"])
        stock = stocks_by_id.get(stock_id)
        if stock is not None:
            stocks_by_watchlist[str(link["watchlist_id"])].append({
                **stock,
                "snapshot": latest_snapshot_by_stock.get(stock_id),
            })

    return [
        {
            **watchlist,
            "stocks": stocks_by_watchlist[str(watchlist["id"])],
        }
        for watchlist in watchlists
    ]


@router.get("/")
async def list_watchlists(current_user: dict = Depends(get_current_user)):
    return await _run_database(
        lambda: _watchlists_with_stocks(current_user["_db"], current_user["id"])
    )


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_watchlist(
    payload: WatchlistCreate,
    current_user: dict = Depends(get_current_user),
):
    def create():
        database = current_user["_db"]
        try:
            created = rows(
                database.table("watchlists").insert({
                    "owner_id": current_user["id"],
                    "name": payload.name,
                })
            )
        except APIError as exc:
            if not _is_missing_owner_id(exc):
                raise
            created = rows(
                database.table("watchlists").insert({
                    "user_id": current_user["id"],
                    "name": payload.name,
                })
            )
        if not created:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Supabase did not return the created watchlist.",
            )
        return {**created[0], "stocks": []}

    return await _run_database(create)


@router.get("/{watchlist_id}")
async def get_watchlist(
    watchlist_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    def get():
        watchlists = _watchlists_with_stocks(current_user["_db"], current_user["id"])
        for watchlist in watchlists:
            if watchlist["id"] == str(watchlist_id):
                return watchlist
        raise HTTPException(status_code=404, detail="Watchlist not found")

    return await _run_database(get)


@router.patch("/{watchlist_id}")
async def update_watchlist(
    watchlist_id: UUID,
    payload: WatchlistUpdate,
    current_user: dict = Depends(get_current_user),
):
    def update():
        database = current_user["_db"]
        existing = _owned_watchlist(database, watchlist_id, current_user["id"])
        owner_column = "owner_id" if "owner_id" in existing else "user_id"
        updated = rows(
            database.table("watchlists")
            .update({"name": payload.name.strip()})
            .eq("id", str(watchlist_id))
            .eq(owner_column, current_user["id"])
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Watchlist not found")
        return updated[0]

    return await _run_database(update)


@router.delete("/{watchlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_watchlist(
    watchlist_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    def delete():
        database = current_user["_db"]
        existing = _owned_watchlist(database, watchlist_id, current_user["id"])
        owner_column = "owner_id" if "owner_id" in existing else "user_id"
        database.table("watchlists").delete().eq(
            "id", str(watchlist_id)
        ).eq(owner_column, current_user["id"]).execute()

    await _run_database(delete)


@router.post("/{watchlist_id}/stocks", status_code=status.HTTP_201_CREATED)
async def add_watchlist_stock(
    watchlist_id: UUID,
    payload: WatchlistStockCreate,
    current_user: dict = Depends(get_current_user),
):
    def add():
        database = current_user["_db"]
        _owned_watchlist(database, watchlist_id, current_user["id"])
        stock_rows = rows(
            database.table("stocks")
            .select("id")
            .eq("id", str(payload.stock_id))
            .limit(1)
        )
        if not stock_rows:
            raise HTTPException(status_code=404, detail="Stock not found")
        created = rows(
            database.table("watchlist_stocks").insert(
                {"watchlist_id": str(watchlist_id), "stock_id": str(payload.stock_id)}
            )
        )
        if not created:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Supabase did not return the saved watchlist stock.",
            )
        return created[0]

    return await _run_database(add)


@router.delete(
    "/{watchlist_id}/stocks/{stock_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_watchlist_stock(
    watchlist_id: UUID,
    stock_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    def remove():
        database = current_user["_db"]
        _owned_watchlist(database, watchlist_id, current_user["id"])
        links = rows(
            database.table("watchlist_stocks")
            .delete()
            .eq("watchlist_id", str(watchlist_id))
            .eq("stock_id", str(stock_id))
        )
        if not links:
            raise HTTPException(status_code=404, detail="Stock is not in this watchlist")

    await _run_database(remove)
