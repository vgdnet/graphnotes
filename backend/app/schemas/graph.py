from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    path: str
    title: str
    tags: list[str] = []
    isolated: bool = False
    unresolved: bool = False


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str
    unresolved: bool = False


class GraphResponse(BaseModel):
    layer: str
    index_status: str
    truncated: bool = False
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class RebuildRequest(BaseModel):
    target: str = Field(pattern="^(shared|personal)$")
