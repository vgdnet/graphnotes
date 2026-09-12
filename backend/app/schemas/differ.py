from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.proposal import ProposalAuthor


class DifferItem(BaseModel):
    path: str
    title: str
    kind: str
    updated_at: datetime | None = None


class DifferResponse(BaseModel):
    differences: list[DifferItem] = Field(default_factory=list)


class DifferSide(BaseModel):
    layer: str
    path: str
    body: str
    author: ProposalAuthor | None = None
    updated_at: datetime | None = None


class DifferFileResponse(BaseModel):
    path: str
    title: str
    kind: str
    incoming: DifferSide
    current: DifferSide
