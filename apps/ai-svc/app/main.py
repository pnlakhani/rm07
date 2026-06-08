"""RM07 AI orchestrator entrypoint (FastAPI on Railway)."""

from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from app import __version__
from app.settings import get_settings

app = FastAPI(title="RM07 AI Orchestrator", version=__version__)


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    environment: str


@app.get("/healthz")
def healthz() -> HealthResponse:
    """Liveness probe."""
    settings = get_settings()
    return HealthResponse(
        status="ok",
        service="ai-svc",
        version=__version__,
        environment=settings.environment,
    )
