from typing import Literal

from pydantic import BaseModel


ContributionState = Literal["personal", "proposed", "accepted"]


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


class ContributionsResponse(BaseModel):
    notes: list[ContributionNode]
    edges: list[ContributionEdge]
    proposals: list[ContributionProposal]

