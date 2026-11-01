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
from ..supabase_client import supabase
from ..dependencies import get_current_user

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

    # Insert profile (auth_uid = user.id)
    profile_data = {
        "auth_uid": res.user.id,
        "email": payload.email,
        "full_name": payload.full_name,
    }
    supabase.table("profiles").insert(profile_data).execute()

    # The sign_up call also returns a session with access_token if email verification is disabled
    if not res.session:
        raise HTTPException(status_code=400, detail="No session returned – check Supabase email confirmation settings")
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
async def logout(current_user: dict = Depends(get_current_user)):
    # Supabase does not provide a direct revoke endpoint for service‑role; we simply delete the session.
    supabase.auth.api.sign_out(current_user["id"])
    return {"detail": "Logged out"}

@router.post("/reset-password")
async def reset_password(email: EmailStr):
    try:
        supabase.auth.api.reset_password_for_email(email)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail=str(exc))
    return {"detail": "Password reset email sent if user exists"}
