"""Configuration utilities for the FastAPI backend."""

from pydantic import AliasChoices, AnyUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../frontend/.env", ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    SUPABASE_URL: AnyUrl | None = Field(
        default=None,
        validation_alias=AliasChoices("SUPABASE_URL", "VITE_SUPABASE_URL"),
    )
    SUPABASE_ANON_KEY: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"),
    )
    SUPABASE_SERVICE_ROLE_KEY: str | None = None

    EODHD_API_KEY: str | None = None
    EODHD_QUOTA_EXHAUSTED: bool = False
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-3.5-flash"
    GEMINI_API_VERSION: str = "v1beta"

    FRONTEND_URL: AnyUrl = "http://localhost:5173"

settings = Settings()
