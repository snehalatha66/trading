import asyncio
import logging
import math
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from ..config import settings
from ..dependencies import get_current_user
from ..supabase_client import create_service_client
from ._database import rows, stock_record, storage_error
from .eodhd_market import get_stock_quote

logger = logging.getLogger(__name__)
router = APIRouter()
ALERTS_MIGRATION = "20261103_paper_trading_and_price_alerts.sql"


class AlertCreate(BaseModel):
    stock_id: UUID
    condition: str
    target_price: float = Field(gt=0)


class AlertUpdate(BaseModel):
    condition: str | None = None
    target_price: float | None = Field(default=None, gt=0)
    status: str | None = None


def _validate_condition(condition: str) -> str:
    if condition not in {"above", "below"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Condition must be 'above' or 'below'.",
        )
    return condition


def _crossed(condition: str, current_price: float, target_price: float) -> bool:
    return current_price >= target_price if condition == "above" else current_price <= target_price


def _alert_quote_symbol(stock: dict) -> str:
    symbol = str(stock["symbol"]).strip().upper()
    exchange = str(stock.get("exchange") or "").strip().upper()
    if "." not in symbol and exchange:
        return f"{symbol}.{exchange}"
    return symbol


async def _quote_for_stock(stock: dict) -> dict:
    return await get_stock_quote(_alert_quote_symbol(stock))


def _alert_with_stock(alert: dict, client) -> dict:
    stock = stock_record(UUID(alert["stock_id"]), client=client)
    return {**alert, "stock": stock}


def _alert_rows(query):
    try:
        return rows(query)
    except APIError as exc:
        raise storage_error(exc, "price-alert", ALERTS_MIGRATION) from exc


def _ensure_alert_schema(database, owner_id: str) -> None:
    _alert_rows(
        database.table("price_alerts")
        .select("id")
        .eq("owner_id", owner_id)
        .limit(1)
    )


@router.get("/")
def list_alerts(current_user: dict = Depends(get_current_user)):
    records = _alert_rows(
        current_user["_db"].table("price_alerts")
        .select("*")
        .eq("owner_id", current_user["id"])
        .order("created_at", desc=True)
    )
    stocks = {}
    stock_ids = list(dict.fromkeys(alert["stock_id"] for alert in records))
    if stock_ids:
        stocks = {
            str(stock["id"]): stock
            for stock in rows(
                current_user["_db"].table("stocks")
                .select("*")
                .in_("id", stock_ids)
            )
        }
    return [{**alert, "stock": stocks.get(str(alert["stock_id"]))} for alert in records]


@router.get("/status")
def alert_status(current_user: dict = Depends(get_current_user)):
    records = _alert_rows(
        current_user["_db"].table("price_alerts")
        .select("*")
        .eq("owner_id", current_user["id"])
        .order("created_at", desc=True)
    )
    triggered_records = [alert for alert in records if alert.get("status") == "triggered"]
    stock_ids = list(dict.fromkeys(alert["stock_id"] for alert in triggered_records))
    stocks = {}
    if stock_ids:
        stocks = {
            str(stock["id"]): stock
            for stock in rows(
                current_user["_db"].table("stocks")
                .select("*")
                .in_("id", stock_ids)
            )
        }
    triggered = [
        {**alert, "stock": stocks.get(str(alert["stock_id"]))}
        for alert in triggered_records
    ]
    return {
        "counts": {
            "active": sum(alert.get("status") == "active" for alert in records),
            "paused": sum(alert.get("status") == "paused" for alert in records),
            "triggered": len(triggered),
            "total": len(records),
        },
        "triggered": triggered,
        "monitoring_configured": bool(
            settings.EODHD_API_KEY
            and settings.SUPABASE_URL
            and settings.SUPABASE_SERVICE_ROLE_KEY
        ),
        "notifications_configured": False,
    }


@router.get("/triggered")
def list_triggered_alerts(current_user: dict = Depends(get_current_user)):
    records = _alert_rows(
        current_user["_db"].table("price_alerts")
        .select("*")
        .eq("owner_id", current_user["id"])
        .eq("status", "triggered")
        .order("triggered_at", desc=True)
    )
    stock_ids = list(dict.fromkeys(alert["stock_id"] for alert in records))
    stocks = {}
    if stock_ids:
        stocks = {
            str(stock["id"]): stock
            for stock in rows(
                current_user["_db"].table("stocks")
                .select("*")
                .in_("id", stock_ids)
            )
        }
    return [{**alert, "stock": stocks.get(str(alert["stock_id"]))} for alert in records]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_alert(
    payload: AlertCreate,
    current_user: dict = Depends(get_current_user),
):
    condition = _validate_condition(payload.condition)
    _ensure_alert_schema(current_user["_db"], current_user["id"])
    stock = stock_record(payload.stock_id, client=current_user["_db"])
    quote = await _quote_for_stock(stock)
    current_price = quote["price"]
    if _crossed(condition, current_price, payload.target_price):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The target has already been reached; choose a target beyond the current provider quote.",
        )

    created = _alert_rows(
        current_user["_db"].table("price_alerts")
        .insert(
            {
                "owner_id": current_user["id"],
                "stock_id": str(payload.stock_id),
                "condition": condition,
                "target_price": payload.target_price,
                "current_price": current_price,
                "status": "active",
                "last_checked_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .select("*")
    )
    if not created:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase did not return the saved price alert.",
        )
    return {**created[0], "stock": stock}


@router.patch("/{alert_id}")
async def update_alert(
    alert_id: UUID,
    payload: AlertUpdate,
    current_user: dict = Depends(get_current_user),
):
    database = current_user["_db"]
    alerts = _alert_rows(
        database.table("price_alerts")
        .select("*")
        .eq("id", str(alert_id))
        .eq("owner_id", current_user["id"])
        .limit(1)
    )
    if not alerts:
        raise HTTPException(status_code=404, detail="Price alert not found.")
    alert = alerts[0]
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return _alert_with_stock(alert, database)
    if "condition" in changes:
        changes["condition"] = _validate_condition(changes["condition"])
    if "status" in changes and changes["status"] not in {"active", "paused"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Alert status can only be changed to active or paused.",
        )

    if "condition" in changes or "target_price" in changes:
        stock = stock_record(UUID(alert["stock_id"]), client=database)
        quote = await _quote_for_stock(stock)
        condition = changes.get("condition", alert["condition"])
        target_price = changes.get("target_price", alert["target_price"])
        if _crossed(condition, quote["price"], target_price):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The target has already been reached; choose a target beyond the current provider quote.",
            )
        changes.update({
            "current_price": quote["price"],
            "last_checked_at": datetime.now(timezone.utc).isoformat(),
            "triggered_at": None,
        })
        if "status" not in changes:
            changes["status"] = "active"
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()

    updated = _alert_rows(
        database.table("price_alerts")
        .update(changes)
        .eq("id", str(alert_id))
        .eq("owner_id", current_user["id"])
        .select("*")
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Price alert not found.")
    return _alert_with_stock(updated[0], database)


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    deleted = _alert_rows(
        current_user["_db"].table("price_alerts")
        .delete()
        .eq("id", str(alert_id))
        .eq("owner_id", current_user["id"])
        .select("id")
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Price alert not found.")


async def monitor_price_alerts_once(client=None) -> int:
    database = client or create_service_client()
    alerts = await asyncio.to_thread(
        rows,
        database.table("price_alerts").select("*").eq("status", "active"),
    )
    triggered_count = 0
    for alert in alerts:
        try:
            stock = await asyncio.to_thread(
                stock_record,
                UUID(alert["stock_id"]),
                client=database,
            )
            quote = await _quote_for_stock(stock)
            now = datetime.now(timezone.utc).isoformat()
            target = float(alert["target_price"])
            current = float(quote["price"])
            if not math.isfinite(target) or not math.isfinite(current) or current <= 0:
                logger.warning("Skipping price alert %s due to invalid quote values.", alert["id"])
                continue
            triggered = _crossed(alert["condition"], current, target)
            update = {
                "current_price": current,
                "last_checked_at": now,
                "updated_at": now,
            }
            if triggered:
                update.update({"status": "triggered", "triggered_at": now})
            saved = await asyncio.to_thread(
                rows,
                database.table("price_alerts")
                .update(update)
                .eq("id", alert["id"])
                .eq("status", "active")
                .select("id"),
            )
            if triggered and saved:
                triggered_count += 1
        except HTTPException as exc:
            logger.warning(
                "Could not check price alert %s: %s",
                alert.get("id"),
                exc.detail,
            )
        except (KeyError, TypeError, ValueError) as exc:
            logger.error("Invalid stored price alert %s: %s", alert.get("id"), exc)
    return triggered_count


async def price_alert_monitor(stop_event: asyncio.Event, interval_seconds: int = 60) -> None:
    while not stop_event.is_set():
        try:
            count = await monitor_price_alerts_once()
            if count:
                logger.info("%s price alert(s) triggered.", count)
        except APIError as exc:
            logger.warning(
                "Price alert monitoring unavailable: %s",
                storage_error(exc, "price-alert", ALERTS_MIGRATION).detail,
            )
        except HTTPException as exc:
            logger.warning("Price alert monitoring unavailable: %s", exc.detail)
        except Exception:
            logger.exception("Price alert monitoring failed.")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except asyncio.TimeoutError:
            continue
