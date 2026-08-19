from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    path: str
    title: str
    tags: list[str] = []
    isolated: bool = False
    unresolved: bool = False
    origin: str = "shared"


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str
    unresolved: bool = False
    origin: str = "shared"


class GraphResponse(BaseModel):
    layer: str
    index_status: str
    truncated: bool = False
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class RebuildRequest(BaseModel):
    target: str = Field(pattern="^(shared|personal)$")


class GraphDiffSummary(BaseModel):
    nodes_added: int = 0
    nodes_removed: int = 0
    nodes_modified: int = 0
    nodes_renamed: int = 0
    nodes_content_only: int = 0
    edges_added: int = 0
    edges_removed: int = 0
    edges_type_changed: int = 0
    unresolved_resolved: int = 0
    resolved_unresolved: int = 0
    tags_added: int = 0
    tags_removed: int = 0


class GraphDiffNode(BaseModel):
    path: str
    title: str
    tags: list[str] = []
    change: str
    marker: str
    unresolved: bool = False
    isolated: bool = False
    from_path: str | None = None


class GraphDiffEdge(BaseModel):
    source: str
    target: str
    type: str
    change: str
    unresolved: bool = False


class GraphDiffChange(BaseModel):
    kind: str
    path: str
    detail: str


class GraphDiffResponse(BaseModel):
    proposal_id: str
    status: str
    complete: bool
    truncated: bool
    stale: bool
    conflicted: bool
    empty: bool
    no_structural_change: bool
    summary: GraphDiffSummary
    nodes: list[GraphDiffNode]
    edges: list[GraphDiffEdge]
    changes: list[GraphDiffChange]
