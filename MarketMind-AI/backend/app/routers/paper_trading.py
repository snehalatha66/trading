from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from ..dependencies import get_current_user
from ..supabase_client import create_service_client
from ._database import owned_record, rows, stock_record, storage_error
from .eodhd_market import get_stock_quote

router = APIRouter()


class PaperOrderCreate(BaseModel):
    portfolio_id: UUID
    stock_id: UUID
    side: Literal["buy", "sell"]
    quantity: float = Field(gt=0)
    price: float = Field(gt=0)


class PaperOrderUpdate(BaseModel):
    status: Literal["canceled"]


class PaperTradeCreate(BaseModel):
    stock_id: UUID
    side: Literal["buy", "sell"]
    quantity: float = Field(gt=0)


def _rpc_data(response):
    data = response.data
    if isinstance(data, list):
        return data[0] if data else None
    return data


def _provider_symbol(stock: dict) -> str:
    symbol = str(stock["symbol"]).strip().upper()
    exchange = str(stock.get("exchange") or "").strip().upper()
    return f"{symbol}.{exchange}" if "." not in symbol and exchange else symbol


def _paper_rows(query):
    try:
        return rows(query)
    except APIError as exc:
        raise storage_error(
            exc,
            "paper-trading",
            "20261103_paper_trading_and_price_alerts.sql",
        ) from exc


def _paper_account(database):
    try:
        account = _rpc_data(
            database.rpc("get_or_create_paper_trading_account", {}).execute()
        )
    except APIError as exc:
        raise storage_error(
            exc,
            "paper-trading",
            "20261103_paper_trading_and_price_alerts.sql",
        ) from exc
    if not account:
        raise HTTPException(
            status_code=502,
            detail="Supabase did not return the paper-trading account.",
        )
    return account


def _paper_holdings(database, account):
    holdings = _paper_rows(
        database.table("paper_trading_holdings")
        .select("*")
        .eq("account_id", account["id"])
        .order("updated_at", desc=True)
    )
    enriched_holdings = []
    for holding in holdings:
        stock = stock_record(UUID(holding["stock_id"]), client=database)
        snapshots = _paper_rows(
            database.table("market_snapshots")
            .select("*")
            .eq("stock_id", holding["stock_id"])
            .order("snapshot_at", desc=True)
            .limit(1)
        )
        enriched_holdings.append({
            **holding,
            "stock": stock,
            "snapshot": snapshots[0] if snapshots else None,
        })
    return enriched_holdings


@router.get("/account")
def get_paper_account(current_user: dict = Depends(get_current_user)):
    database = current_user["_db"]
    account = _paper_account(database)
    return {"account": account, "holdings": _paper_holdings(database, account)}


@router.get("/holdings")
def list_paper_holdings(current_user: dict = Depends(get_current_user)):
    database = current_user["_db"]
    account = _paper_account(database)
    return _paper_holdings(database, account)


@router.get("/transactions")
def list_paper_transactions(
    current_user: dict = Depends(get_current_user),
    limit: int = Query(default=100, ge=1, le=500),
):
    database = current_user["_db"]
    account = _paper_account(database)
    orders = _paper_rows(
        database.table("paper_orders")
        .select("*")
        .eq("paper_account_id", account["id"])
        .order("executed_at", desc=True)
        .limit(limit)
    )
    if not orders:
        return []

    order_ids = [str(order["id"]) for order in orders]
    transactions = _paper_rows(
        database.table("paper_trading_transactions")
        .select("*")
        .in_("order_id", order_ids)
    )
    transactions_by_order = {item["order_id"]: item for item in transactions}
    result = []
    for order in orders:
        stock = stock_record(UUID(order["stock_id"]), client=database)
        transaction = transactions_by_order.get(str(order["id"]), {})
        result.append({
            **order,
            "symbol": stock.get("symbol"),
            "name": stock.get("name"),
            "type": order.get("side"),
            "total": float(order["quantity"]) * float(order["price"]),
            "realized_pnl": transaction.get("realized_pnl"),
            "executed_at": order.get("executed_at"),
        })
    return result


@router.post("/trades", status_code=status.HTTP_201_CREATED)
async def execute_paper_trade(
    payload: PaperTradeCreate,
    current_user: dict = Depends(get_current_user),
):
    database = current_user["_db"]
    stock = stock_record(payload.stock_id, client=database)
    quote = await get_stock_quote(_provider_symbol(stock))
    account = _paper_account(database)
    service_database = create_service_client()
    result = _rpc_data(
        service_database.rpc(
            "execute_paper_trade",
            {
                "p_owner_id": current_user["id"],
                "p_stock_id": str(payload.stock_id),
                "p_side": payload.side,
                "p_quantity": payload.quantity,
                "p_price": quote["price"],
            },
        ).execute()
    )
    if not result:
        raise HTTPException(
            status_code=502,
            detail="Supabase did not return the completed paper trade.",
        )
    return {**result, "stock": stock, "quote": quote}


@router.get("/orders")
def list_orders(
    current_user: dict = Depends(get_current_user),
    portfolio_id: UUID | None = None,
    order_status: Literal["pending", "filled", "canceled"] | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
):
    portfolios = rows(
        current_user["_db"].table("portfolios")
        .select("id")
        .eq("user_id", current_user["id"])
    )
    owned_ids = [portfolio["id"] for portfolio in portfolios]
    if portfolio_id is not None:
        if str(portfolio_id) not in owned_ids:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        owned_ids = [str(portfolio_id)]
    result = []
    if owned_ids:
        query = (
            current_user["_db"].table("paper_orders")
            .select("*")
            .in_("portfolio_id", owned_ids)
            .order("placed_at", desc=True)
            .limit(limit)
        )
        if order_status:
            query = query.eq("status", order_status)
        result.extend(rows(query))

    account = _rpc_data(
        current_user["_db"].rpc("get_or_create_paper_trading_account", {}).execute()
    )
    if account:
        query = (
            current_user["_db"].table("paper_orders")
            .select("*")
            .eq("paper_account_id", account["id"])
            .order("placed_at", desc=True)
            .limit(limit)
        )
        if order_status:
            query = query.eq("status", order_status)
        result.extend(rows(query))
    result.sort(key=lambda item: item.get("placed_at") or "", reverse=True)
    return result[:limit]


@router.post("/orders", status_code=status.HTTP_201_CREATED)
def create_order(
    payload: PaperOrderCreate,
    current_user: dict = Depends(get_current_user),
):
    owned_record(
        "portfolios",
        payload.portfolio_id,
        current_user["id"],
        client=current_user["_db"],
        owner_column="user_id",
    )
    stock_record(payload.stock_id, client=current_user["_db"])
    created = rows(
        current_user["_db"].table("paper_orders").insert(
            {
                **payload.model_dump(mode="json"),
                "status": "pending",
            }
        )
    )
    return created[0]


@router.patch("/orders/{order_id}")
def cancel_order(
    order_id: UUID,
    payload: PaperOrderUpdate,
    current_user: dict = Depends(get_current_user),
):
    order_rows = rows(
        current_user["_db"].table("paper_orders")
        .select("*")
        .eq("id", str(order_id))
        .limit(1)
    )
    if not order_rows:
        raise HTTPException(status_code=404, detail="Paper order not found")
    order = order_rows[0]
    if order["status"] != "pending":
        raise HTTPException(status_code=409, detail="Only pending orders can be canceled")
    if not order.get("portfolio_id"):
        raise HTTPException(status_code=409, detail="This paper-account order cannot be canceled")
    owned_record(
        "portfolios",
        UUID(order["portfolio_id"]),
        current_user["id"],
        client=current_user["_db"],
        owner_column="user_id",
    )
    updated = rows(
        current_user["_db"].table("paper_orders")
        .update({"status": payload.status})
        .eq("id", str(order_id))
        .eq("status", "pending")
    )
    if not updated:
        raise HTTPException(status_code=409, detail="Paper order is no longer pending")
    return updated[0]


@router.get("/orders/{order_id}/transactions")
def list_order_transactions(
    order_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    orders = rows(
        current_user["_db"].table("paper_orders")
        .select("*")
        .eq("id", str(order_id))
        .limit(1)
    )
    if not orders:
        raise HTTPException(status_code=404, detail="Paper order not found")
    order = orders[0]
    if order.get("portfolio_id"):
        owned_record(
            "portfolios",
            UUID(order["portfolio_id"]),
            current_user["id"],
            client=current_user["_db"],
            owner_column="user_id",
        )
    else:
        account = rows(
            current_user["_db"].table("paper_trading_accounts")
            .select("id")
            .eq("id", order.get("paper_account_id"))
            .eq("owner_id", current_user["id"])
            .limit(1)
        )
        if not account:
            raise HTTPException(status_code=404, detail="Paper order not found")
    return rows(
        current_user["_db"].table("paper_trading_transactions")
        .select("*")
        .eq("order_id", str(order_id))
        .order("executed_at", desc=True)
    )
