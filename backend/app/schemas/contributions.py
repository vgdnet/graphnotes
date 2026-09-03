from typing import Literal
from uuid import UUID

from pydantic import BaseModel


ContributionState = Literal["personal", "proposed", "accepted"]
ReviewAction = Literal["approved", "rejected", "returned", "rolled_back"]


class ContributionNode(BaseModel):
    path: str
    title: str
    tags: list[str]
    state: ContributionState


class ContributionEdge(BaseModel):
    source: str
    target: str
    type: str
    state: ContributionState
    unresolved: bool = False


class ContributionProposal(BaseModel):
    id: str
    status: str
    summary: str
    paths: list[str]


class ContributionStats(BaseModel):
    notes: int
    added: int
    accepted: int
    links: int
    links_accepted: int


class ReviewLink(BaseModel):
    source: str
    target: str


class ReviewDecision(BaseModel):
    proposal_id: str
    action: ReviewAction
    status: str
    summary: str
    paths: list[str]
    links: list[ReviewLink]


class ReviewStats(BaseModel):
    accepted: int
    rejected: int
    returned: int
    rolled_back: int
    decisions: list[ReviewDecision]


class ContributionsResponse(BaseModel):
    notes: list[ContributionNode]
    edges: list[ContributionEdge]
    proposals: list[ContributionProposal]
    stats: ContributionStats
    review: ReviewStats | None = None


class ContributionUserRef(BaseModel):
    id: UUID
    username: str
    display_name: str
    role: str


class UserContributionsRow(BaseModel):
    user: ContributionUserRef
    stats: ContributionStats
    review: ReviewStats | None = None
    notes: list[ContributionNode]
    links: list[ContributionEdge]


class AdminContributionsResponse(BaseModel):
    users: list[UserContributionsRow]
