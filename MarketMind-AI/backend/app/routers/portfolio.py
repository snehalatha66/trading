from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from ..dependencies import get_current_user
from ._database import owned_record, rows, stock_record

router = APIRouter()


class PortfolioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class PortfolioUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class HoldingInput(BaseModel):
    stock_id: UUID
    quantity: float = Field(ge=0)
    avg_price: float = Field(ge=0)


class TransactionInput(BaseModel):
    stock_id: UUID
    type: Literal["buy", "sell", "dividend", "split"]
    quantity: float = Field(gt=0)
    price: float = Field(ge=0)
    executed_at: datetime


@router.get("/")
def list_portfolios(current_user: dict = Depends(get_current_user)):
    return rows(
        current_user["_db"].table("portfolios")
        .select("*")
        .eq("user_id", current_user["id"])
        .order("created_at", desc=True)
    )


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_portfolio(
    payload: PortfolioCreate,
    current_user: dict = Depends(get_current_user),
):
    created = rows(
        current_user["_db"].table("portfolios")
        .insert({"user_id": current_user["id"], "name": payload.name})
    )
    return created[0]


@router.get("/{portfolio_id}")
def get_portfolio(
    portfolio_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    portfolio = owned_record(
        "portfolios",
        portfolio_id,
        current_user["id"],
        client=current_user["_db"],
        owner_column="user_id",
    )
    holdings = rows(
        current_user["_db"].table("portfolio_holdings")
        .select("*")
        .eq("portfolio_id", str(portfolio_id))
        .order("created_at")
    )
    stock_ids = list(dict.fromkeys(holding["stock_id"] for holding in holdings))
    stocks = rows(
        current_user["_db"].table("stocks")
        .select("*")
        .in_("id", stock_ids)
    ) if stock_ids else []
    stock_by_id = {stock["id"]: stock for stock in stocks}
    holdings_with_stock = [
        {
            **holding,
            "stock": stock_by_id.get(holding["stock_id"]),
        }
        for holding in holdings
    ]
    return {**portfolio, "holdings": holdings_with_stock}


@router.patch("/{portfolio_id}")
def update_portfolio(
    portfolio_id: UUID,
    payload: PortfolioUpdate,
    current_user: dict = Depends(get_current_user),
):
    owned_record(
        "portfolios",
        portfolio_id,
        current_user["id"],
        client=current_user["_db"],
        owner_column="user_id",
    )
    updated = rows(
        current_user["_db"].table("portfolios")
        .update({"name": payload.name})
        .eq("id", str(portfolio_id))
        .eq("user_id", current_user["id"])
    )
    return updated[0]


@router.delete("/{portfolio_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_portfolio(
    portfolio_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    owned_record(
        "portfolios",
        portfolio_id,
        current_user["id"],
        client=current_user["_db"],
        owner_column="user_id",
    )
    current_user["_db"].table("portfolios").delete().eq(
        "id", str(portfolio_id)
    ).eq(
        "user_id", current_user["id"]
    ).execute()


@router.put("/{portfolio_id}/holdings")
def upsert_holding(
    portfolio_id: UUID,
    payload: HoldingInput,
    current_user: dict = Depends(get_current_user),
):
    owned_record(
        "portfolios",
        portfolio_id,
        current_user["id"],
        client=current_user["_db"],
        owner_column="user_id",
    )
    stock_record(payload.stock_id, client=current_user["_db"])
    saved = rows(
        current_user["_db"].table("portfolio_holdings").upsert(
            {
                "portfolio_id": str(portfolio_id),
                "stock_id": str(payload.stock_id),
                "quantity": payload.quantity,
                "avg_price": payload.avg_price,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="portfolio_id,stock_id",
        )
    )
    return saved[0]


@router.get("/{portfolio_id}/transactions")
def list_transactions(
    portfolio_id: UUID,
    current_user: dict = Depends(get_current_user),
    limit: int = Query(default=100, ge=1, le=500),
):
    owned_record(
        "portfolios",
        portfolio_id,
        current_user["id"],
        client=current_user["_db"],
        owner_column="user_id",
    )
    return rows(
        current_user["_db"].table("portfolio_transactions")
        .select("*")
        .eq("portfolio_id", str(portfolio_id))
        .order("executed_at", desc=True)
        .limit(limit)
    )


@router.post("/{portfolio_id}/transactions", status_code=status.HTTP_201_CREATED)
def create_transaction(
    portfolio_id: UUID,
    payload: TransactionInput,
    current_user: dict = Depends(get_current_user),
):
    owned_record(
        "portfolios",
        portfolio_id,
        current_user["id"],
        client=current_user["_db"],
        owner_column="user_id",
    )
    stock_record(payload.stock_id, client=current_user["_db"])
    created = rows(
        current_user["_db"].table("portfolio_transactions").insert(
            {
                "portfolio_id": str(portfolio_id),
                **payload.model_dump(mode="json"),
            }
        )
    )
    return created[0]
