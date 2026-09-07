from pydantic import BaseModel, Field


class SearchHit(BaseModel):
    path: str
    title: str
    tags: list[str] = Field(default_factory=list)
    layer: str = "shared"
    owner: str | None = None


class SearchResponse(BaseModel):
    query: str
    tag: str = ""
    layer: str = "visible"
    hits: list[SearchHit]
    available_tags: list[str] = Field(default_factory=list)
