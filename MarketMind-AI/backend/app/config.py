"""Configuration utilities for the FastAPI backend.
Loads environment variables from a ``.env`` file (if present) using
``python-dotenv`` and provides typed settings via Pydantic's ``BaseSettings``.
"""

from pathlib import Path
from pydantic import BaseSettings, Field, AnyUrl

class Settings(BaseSettings):
    # Supabase configuration (service role key is secret, never exposed to front‑end)
    SUPABASE_URL: AnyUrl = Field(..., env="SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY: str = Field(..., env="SUPABASE_SERVICE_ROLE_KEY")

    # Upstox API credentials
    UPSTOX_API_KEY: str = Field(..., env="UPSTOX_API_KEY")
    UPSTOX_ACCESS_TOKEN: str = Field(..., env="UPSTOX_ACCESS_TOKEN")

    # Frontend URL for CORS (adjust if different)
    FRONTEND_URL: AnyUrl = Field(default="http://localhost:5173", env="FRONTEND_URL")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

# Instantiate a single settings object to be imported elsewhere
settings = Settings()
