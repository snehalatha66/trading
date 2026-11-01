"""Dependency utilities for FastAPI.
- ``get_current_user`` validates a Supabase JWT from the ``Authorization`` header.
- Returns a dict with user information (``id`` and ``email``) that can be injected
  into route handlers.
"""

from fastapi import Depends, HTTPException, status, Request
from supabase import Client
from .supabase_client import supabase
from typing import Dict

def get_token_from_header(request: Request) -> str:
    auth: str | None = request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing or malformed",
        )
    return auth.split(" ", 1)[1]

async def get_current_user(token: str = Depends(get_token_from_header)) -> Dict:
    """Validate the JWT with Supabase and return the user payload.

    Supabase's Python client wraps the GoTrue API; ``auth.api.get_user`` returns
    the user record when the token is valid. If the token is invalid or expired
    an HTTPException with 401 is raised.
    """
    try:
        user = supabase.auth.api.get_user(token)
    except Exception as exc:  # pragma: no cover – covered by tests via mock
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    # ``user`` is a dict with ``id`` and ``email`` amongst other fields
    return {"id": user.id, "email": user.email}
