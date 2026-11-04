from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, EmailStr

from ..dependencies import get_current_user
from ._database import rows, storage_error

router = APIRouter()
PROFILE_MIGRATION = "20261104094900_profiles_access.sql"


def _profile_rows(query) -> list[dict]:
    try:
        return rows(query)
    except APIError as exc:
        raise storage_error(exc, "profile", PROFILE_MIGRATION) from exc


class ProfileUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None


class ProfileCreate(BaseModel):
    email: EmailStr
    full_name: str | None = None


class ProfileResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    auth_uid: str
    email: str
    full_name: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


@router.get("/me", response_model=ProfileResponse)
def get_profile(current_user: dict = Depends(get_current_user)):
    profiles = _profile_rows(
        current_user["_db"].table("profiles")
        .select("*")
        .eq("auth_uid", current_user["id"])
        .limit(1)
    )
    if not profiles:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profiles[0]


@router.put("/me", response_model=ProfileResponse)
def upsert_profile(
    payload: ProfileCreate,
    current_user: dict = Depends(get_current_user),
):
    profile = {
        "auth_uid": current_user["id"],
        "email": str(payload.email),
        "full_name": payload.full_name,
    }
    result = _profile_rows(
        current_user["_db"].table("profiles")
        .upsert(profile, on_conflict="auth_uid")
    )
    if not result:
        raise HTTPException(status_code=500, detail="Profile could not be saved")
    return result[0]


@router.patch("/me", response_model=ProfileResponse)
def update_profile(
    payload: ProfileUpdate,
    current_user: dict = Depends(get_current_user),
):
    updates = payload.model_dump(exclude_unset=True)
    if "email" in updates and updates["email"] is not None:
        updates["email"] = str(updates["email"])
    elif updates.get("email") is None:
        raise HTTPException(status_code=400, detail="email cannot be null")
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No profile fields supplied")
    result = _profile_rows(
        current_user["_db"].table("profiles")
        .update(updates)
        .eq("auth_uid", current_user["id"])
    )
    if not result:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result[0]
