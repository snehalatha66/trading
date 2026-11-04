"""Dependency utilities for FastAPI.
- ``get_current_user`` validates a Supabase JWT from the ``Authorization`` header.
- Returns a dict with user information (``id`` and ``email``) that can be injected
  into route handlers.
"""

import asyncio
from typing import Any

from fastapi import Depends, HTTPException, status, Request

from .config import settings
from .supabase_client import create_user_client, supabase

def get_token_from_header(request: Request) -> str:
    auth: str | None = request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing or malformed",
        )
    return auth.split(" ", 1)[1]

async def get_current_user(token: str = Depends(get_token_from_header)) -> dict[str, Any]:
    """Validate the JWT with Supabase and return the user payload.

    Supabase validates the supplied bearer token and returns its user record.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY "
                "in backend/.env, or keep the existing VITE_SUPABASE_URL and "
                "VITE_SUPABASE_ANON_KEY in frontend/.env."
            ),
        )
    try:
        user = await asyncio.to_thread(supabase.auth.get_user, token)
    except Exception as exc:  # pragma: no cover – covered by tests via mock
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc
    auth_user = getattr(user, "user", None)
    if not auth_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return {
        "id": auth_user.id,
        "email": auth_user.email,
        "_db": create_user_client(token),
    }
