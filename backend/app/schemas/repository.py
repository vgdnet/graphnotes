from datetime import datetime

from pydantic import BaseModel, Field


class RepositoryStatus(BaseModel):
    connected: bool
    owner: str | None = None
    name: str | None = None
    status: str
    has_content: bool = False
    updated_at: datetime | None = None


class RepositoryStatusResponse(BaseModel):
    shared: RepositoryStatus
    personal: RepositoryStatus | None = None


class PersonalConnectRequest(BaseModel):
    repository: str = Field(min_length=3, max_length=200)
