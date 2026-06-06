"""Validated runtime settings. Values injected from Doppler (no secrets in code)."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strict settings; unknown env vars are ignored, required keys validated at startup."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    ai_svc_port: int = Field(default=8090, ge=1, le=65535)
    environment: str = Field(default="development")

    # Provider keys are optional at boot (health must come up without them) but required
    # before any model call. The selector validates presence at call time.
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    gemini_api_key: str | None = None


def get_settings() -> Settings:
    return Settings()
