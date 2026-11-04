from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from postgrest.exceptions import APIError

from ..supabase_client import supabase


def rows(query: Any) -> list[dict[str, Any]]:
    response = query.execute()
    return response.data or []


def storage_error(exc: APIError, feature: str, migration: str) -> HTTPException:
    code = str(getattr(exc, "code", "") or "")
    message = str(getattr(exc, "message", "") or exc)
    normalized = message.casefold()
    schema_missing = code in {"PGRST202", "PGRST204", "PGRST205", "42P01", "42703"} or any(
        phrase in normalized
        for phrase in ("schema cache", "could not find the table", "does not exist")
    )
    if schema_missing:
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"The Supabase {feature} schema is not available. Apply "
                f"supabase/migrations/{migration} and reload the PostgREST schema cache."
            ),
        )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Supabase {feature} request failed: {message}",
    )


def owned_record(
    table: str,
    record_id: UUID,
    owner_id: str,
    *,
    client: Any | None = None,
    owner_column: str = "owner_id",
    not_found_detail: str = "Record not found",
) -> dict[str, Any]:
    database = client or supabase
    records = rows(
        database.table(table)
        .select("*")
        .eq("id", str(record_id))
        .eq(owner_column, owner_id)
        .limit(1)
    )
    if not records:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found_detail)
    return records[0]


def stock_record(stock_id: UUID, *, client: Any | None = None) -> dict[str, Any]:
    database = client or supabase
    records = rows(
        database.table("stocks")
        .select("*")
        .eq("id", str(stock_id))
        .limit(1)
    )
    if not records:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock not found")
    return records[0]
