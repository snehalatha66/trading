from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from ..dependencies import get_current_user
from ._database import owned_record, rows

router = APIRouter()


class StrategyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    config: dict[str, Any] | None = None


class StrategyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    config: dict[str, Any] | None = None


class BacktestCreate(BaseModel):
    start_date: datetime
    end_date: datetime
    performance: dict[str, Any] | None = None


@router.get("/")
async def list_strategies(current_user: dict = Depends(get_current_user)):
    return rows(
        current_user["_db"].table("strategies")
        .select("*")
        .eq("owner_id", current_user["id"])
        .order("updated_at", desc=True)
    )


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_strategy(
    payload: StrategyCreate,
    current_user: dict = Depends(get_current_user),
):
    created = rows(
        current_user["_db"].table("strategies").insert(
            {"owner_id": current_user["id"], **payload.model_dump()}
        )
    )
    return created[0]


@router.get("/{strategy_id}")
async def get_strategy(
    strategy_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    return owned_record(
        "strategies",
        strategy_id,
        current_user["id"],
        client=current_user["_db"],
    )


@router.patch("/{strategy_id}")
async def update_strategy(
    strategy_id: UUID,
    payload: StrategyUpdate,
    current_user: dict = Depends(get_current_user),
):
    owned_record(
        "strategies",
        strategy_id,
        current_user["id"],
        client=current_user["_db"],
    )
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No strategy fields supplied")
    if "name" in updates and updates["name"] is None:
        raise HTTPException(status_code=400, detail="name cannot be null")
    updates["updated_at"] = datetime.now().astimezone().isoformat()
    saved = rows(
        current_user["_db"].table("strategies")
        .update(updates)
        .eq("id", str(strategy_id))
    )
    return saved[0]


@router.delete("/{strategy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_strategy(
    strategy_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    owned_record(
        "strategies",
        strategy_id,
        current_user["id"],
        client=current_user["_db"],
    )
    current_user["_db"].table("strategies").delete().eq(
        "id", str(strategy_id)
    ).execute()


@router.get("/{strategy_id}/backtests")
async def list_backtests(
    strategy_id: UUID,
    current_user: dict = Depends(get_current_user),
    limit: int = Query(default=100, ge=1, le=500),
):
    owned_record(
        "strategies",
        strategy_id,
        current_user["id"],
        client=current_user["_db"],
    )
    return rows(
        current_user["_db"].table("backtest_results")
        .select("*")
        .eq("strategy_id", str(strategy_id))
        .order("created_at", desc=True)
        .limit(limit)
    )


@router.post("/{strategy_id}/backtests", status_code=status.HTTP_201_CREATED)
async def create_backtest_result(
    strategy_id: UUID,
    payload: BacktestCreate,
    current_user: dict = Depends(get_current_user),
):
    owned_record(
        "strategies",
        strategy_id,
        current_user["id"],
        client=current_user["_db"],
    )
    if payload.end_date <= payload.start_date:
        raise HTTPException(status_code=400, detail="end_date must be after start_date")
    created = rows(
        current_user["_db"].table("backtest_results").insert(
            {"strategy_id": str(strategy_id), **payload.model_dump(mode="json")}
        )
    )
    return created[0]
