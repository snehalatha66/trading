"""Authentication routes.
Provides:
- POST /register – creates a Supabase auth user and a profile record.
- POST /login – generates a JWT (Supabase returns access_token).
- POST /logout – revokes the token.
- POST /reset-password – sends a password reset email via Supabase.
All routes return JSON payloads suitable for the existing frontend.
"""

from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr, Field
from ..supabase_client import create_user_client, supabase
from ..dependencies import get_current_user, get_token_from_header

router = APIRouter()

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str | None = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

@router.post("/register", response_model=TokenResponse)
async def register(payload: RegisterRequest):
    # Create user in Supabase Auth
    try:
        res = supabase.auth.sign_up({"email": payload.email, "password": payload.password})
    except Exception as exc:  # pragma: no cover – covered by integration tests
        raise HTTPException(status_code=400, detail=str(exc))
    if res.user is None:
        raise HTTPException(status_code=400, detail="Registration failed")

    if not res.session:
        raise HTTPException(status_code=400, detail="No session returned – check Supabase email confirmation settings")

    profile_data = {
        "auth_uid": res.user.id,
        "email": payload.email,
        "full_name": payload.full_name,
    }
    user_client = create_user_client(res.session.access_token)
    user_client.table("profiles").upsert(
        profile_data,
        on_conflict="auth_uid",
    ).execute()

    return TokenResponse(access_token=res.session.access_token)

@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    try:
        res = supabase.auth.sign_in_with_password({"email": payload.email, "password": payload.password})
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not res.session:
        raise HTTPException(status_code=401, detail="Login failed")
    return TokenResponse(access_token=res.session.access_token)

@router.post("/logout")
async def logout(
    current_user: dict = Depends(get_current_user),
    token: str = Depends(get_token_from_header),
):
    try:
        supabase.auth.admin.sign_out(token)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail="Could not revoke the session") from exc
    return {"detail": "Logged out"}

@router.post("/reset-password")
async def reset_password(email: EmailStr):
    try:
        supabase.auth.reset_password_for_email(str(email))
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail=str(exc))
    return {"detail": "Password reset email sent if user exists"}
