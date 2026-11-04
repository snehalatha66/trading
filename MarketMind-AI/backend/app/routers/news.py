from fastapi import APIRouter, Query

from ..supabase_client import supabase
from ._database import rows

router = APIRouter()


@router.get("/")
def list_news(
    q: str | None = None,
    source: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
):
    query = (
        supabase.table("news_articles")
        .select("*")
        .order("published_at", desc=True)
        .limit(limit)
    )
    if q:
        query = query.ilike("title", f"%{q}%")
    if source:
        query = query.eq("source", source)
    return rows(query)
