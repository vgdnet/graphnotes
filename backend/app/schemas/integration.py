from datetime import datetime

from pydantic import BaseModel, Field


class IntegrationTokenCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    scopes: list[str] = Field(min_length=1)
    expires_at: datetime | None = None


class IntegrationTokenView(BaseModel):
    id: str
    name: str
    token_prefix: str
    scopes: list[str]
    expires_at: str
    last_used_at: str | None
    created_at: str
    revoked_at: str | None


class IntegrationTokenCreated(IntegrationTokenView):
    token: str


class TransferPlanRequest(BaseModel):
    client_id: str
    operations: list[dict]
