from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from postgrest.exceptions import APIError

from ..dependencies import get_current_user
from ._database import rows, storage_error

router = APIRouter()
TRADING_MIGRATION = "20261103_paper_trading_and_price_alerts.sql"


def _is_missing_schema(exc: APIError) -> bool:
    return str(getattr(exc, "code", "")) in {
        "PGRST202",
        "PGRST204",
        "PGRST205",
        "42703",
        "42P01",
    }


def _load_portfolios(database, owner_id: str) -> list[dict]:
    try:
        return rows(
            database.table("portfolios")
            .select("id")
            .eq("user_id", owner_id)
        )
    except APIError as exc:
        raise storage_error(
            exc, "transaction-history", TRADING_MIGRATION
        ) from exc


def _portfolio_records(
    database,
    portfolio_ids: list[str],
    transaction_type: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    limit: int,
) -> list[dict]:
    def query(timestamp_column: str, type_column: str):
        request = (
            database.table("portfolio_transactions")
            .select("*")
            .in_("portfolio_id", portfolio_ids)
            .order(timestamp_column, desc=True)
            .limit(limit)
        )
        if date_from:
            request = request.gte(timestamp_column, date_from.isoformat())
        if date_to:
            request = request.lte(timestamp_column, date_to.isoformat())
        if transaction_type:
            request = request.eq(type_column, transaction_type)
        return rows(request)

    try:
        return query("executed_at", "type")
    except APIError as exc:
        if not _is_missing_schema(exc):
            raise storage_error(
                exc, "transaction-history", TRADING_MIGRATION
            ) from exc
        try:
            return query("transaction_date", "transaction_type")
        except APIError as legacy_exc:
            raise storage_error(
                legacy_exc, "transaction-history", TRADING_MIGRATION
            ) from legacy_exc


def _legacy_paper_records(
    database,
    owner_id: str,
    transaction_type: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    limit: int,
) -> list[dict]:
    request = (
        database.table("paper_trading_transactions")
        .select("*")
        .eq("user_id", owner_id)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if date_from:
        request = request.gte("created_at", date_from.isoformat())
    if date_to:
        request = request.lte("created_at", date_to.isoformat())
    try:
        records = rows(request)
    except APIError as exc:
        raise storage_error(
            exc, "paper-trading transaction-history", TRADING_MIGRATION
        ) from exc
    if transaction_type:
        records = [
            record
            for record in records
            if str(record.get("type") or record.get("transaction_type") or "").casefold()
            == transaction_type
        ]
    return records


def _paper_records(
    database,
    owner_id: str,
    transaction_type: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    limit: int,
) -> list[dict]:
    try:
        accounts = rows(
            database.table("paper_trading_accounts")
            .select("id")
            .eq("owner_id", owner_id)
            .limit(1)
        )
    except APIError as exc:
        if not _is_missing_schema(exc):
            raise storage_error(
                exc, "paper-trading transaction-history", TRADING_MIGRATION
            ) from exc
        return _legacy_paper_records(
            database, owner_id, transaction_type, date_from, date_to, limit
        )

    account = accounts[0] if accounts else None
    if not account:
        return _legacy_paper_records(
            database, owner_id, transaction_type, date_from, date_to, limit
        )

    request = (
        database.table("paper_orders")
        .select("*")
        .eq("paper_account_id", account["id"])
        .eq("status", "filled")
        .order("executed_at", desc=True)
        .limit(limit)
    )
    if date_from:
        request = request.gte("executed_at", date_from.isoformat())
    if date_to:
        request = request.lte("executed_at", date_to.isoformat())
    if transaction_type in {"buy", "sell"}:
        request = request.eq("side", transaction_type)
    if transaction_type in {"dividend", "split"}:
        return []
    try:
        return rows(request)
    except APIError as exc:
        if not _is_missing_schema(exc):
            raise storage_error(
                exc, "paper-trading transaction-history", TRADING_MIGRATION
            ) from exc
        return _legacy_paper_records(
            database, owner_id, transaction_type, date_from, date_to, limit
        )


@router.get("")
@router.get("/")
def list_transactions(
    current_user: dict = Depends(get_current_user),
    scope: str = Query(default="all", pattern="^(all|portfolio|paper)$"),
    stock: str | None = Query(default=None, max_length=50),
    transaction_type: str | None = Query(
        default=None, alias="type", pattern="^(buy|sell|dividend|split)$"
    ),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=500, ge=1, le=1000),
):
    database = current_user["_db"]
    portfolio_records = []
    paper_records = []

    if scope in {"all", "portfolio"}:
        portfolios = _load_portfolios(database, current_user["id"])
        portfolio_ids = [portfolio["id"] for portfolio in portfolios]
        if portfolio_ids:
            portfolio_records = _portfolio_records(
                database,
                portfolio_ids,
                transaction_type,
                date_from,
                date_to,
                limit,
            )

    if scope in {"all", "paper"}:
        paper_records = _paper_records(
            database,
            current_user["id"],
            transaction_type,
            date_from,
            date_to,
            limit,
        )

    stock_ids = list(dict.fromkeys(
        str(record["stock_id"])
        for record in [*portfolio_records, *paper_records]
        if record.get("stock_id")
    ))
    stock_by_id = {}
    if stock_ids:
        try:
            stock_by_id = {
                str(security["id"]): security
                for security in rows(
                    database.table("stocks")
                    .select("*")
                    .in_("id", stock_ids)
                )
            }
        except APIError as exc:
            raise storage_error(
                exc, "transaction-history", TRADING_MIGRATION
            ) from exc

    def matches_filter(security):
        if not stock:
            return True
        return bool(security) and stock.casefold() in (
            f"{security.get('name') or ''} {security.get('symbol') or ''}"
        ).casefold()

    result = []
    for record in portfolio_records:
        security = stock_by_id.get(str(record.get("stock_id")))
        if not matches_filter(security):
            continue
        result.append({
            **record,
            "scope": "portfolio",
            "type": record.get("type") or record.get("transaction_type"),
            "executed_at": (
                record.get("executed_at")
                or record.get("transaction_date")
                or record.get("created_at")
            ),
            "name": security.get("name") if security else None,
            "symbol": security.get("symbol") if security else None,
            "total": float(record["quantity"]) * float(record["price"]),
        })

    for record in paper_records:
        security = stock_by_id.get(str(record.get("stock_id")))
        if not matches_filter(security):
            continue
        price = record.get("price")
        if price is None:
            price = record.get("execution_price") or record.get("order_price")
        result.append({
            **record,
            "scope": "paper",
            "type": (
                record.get("side")
                or record.get("type")
                or record.get("transaction_type")
                or record.get("order_type")
            ),
            "price": price,
            "executed_at": (
                record.get("executed_at")
                or record.get("transaction_date")
                or record.get("created_at")
            ),
            "name": security.get("name") if security else None,
            "symbol": security.get("symbol") if security else None,
            "total": float(record["quantity"]) * float(price or 0),
        })

    result.sort(key=lambda item: item.get("executed_at") or "", reverse=True)
    return result[:limit]
