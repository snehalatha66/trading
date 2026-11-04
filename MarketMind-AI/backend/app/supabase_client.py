"""Supabase client utilities."""

from typing import Any

from fastapi import HTTPException, status
from supabase import create_client, Client
from .config import settings


class UnconfiguredSupabase:
    """Keep public API routes available while reporting missing DB config clearly."""

    @staticmethod
    def _raise() -> None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY "
                "in backend/.env, or keep the existing VITE_SUPABASE_URL and "
                "VITE_SUPABASE_ANON_KEY in frontend/.env."
            ),
        )

    def table(self, _table_name: str) -> Any:
        del _table_name
        self._raise()

    @property
    def auth(self) -> Any:
        self._raise()


def create_user_client(access_token: str) -> Client:
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY "
                "in backend/.env, or keep the existing VITE_SUPABASE_URL and "
                "VITE_SUPABASE_ANON_KEY in frontend/.env."
            ),
        )
    client = create_client(str(settings.SUPABASE_URL), settings.SUPABASE_ANON_KEY)
    client.postgrest.auth(access_token)
    return client


def create_service_client() -> Client:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Market-data persistence is not configured. Set "
                "SUPABASE_SERVICE_ROLE_KEY in backend/.env; the frontend anon "
                "key is read-only for market-data tables."
            ),
        )
    return create_client(
        str(settings.SUPABASE_URL),
        settings.SUPABASE_SERVICE_ROLE_KEY,
    )


_api_key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY
if settings.SUPABASE_URL and _api_key:
    supabase: Client | UnconfiguredSupabase = create_client(
        str(settings.SUPABASE_URL),
        _api_key,
    )
else:
    supabase = UnconfiguredSupabase()
