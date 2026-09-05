from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class FeedActor(BaseModel):
    id: UUID
    username: str
    display_name: str


class FeedEvent(BaseModel):
    id: UUID
    kind: str
    path: str
    other_path: str | None
    proposal_id: UUID | None
    created_at: datetime
    actor: FeedActor | None


class NoteFeedResponse(BaseModel):
    path: str
    events: list[FeedEvent]
