from pydantic import BaseModel, Field


class SearchHit(BaseModel):
    path: str
    title: str
    tags: list[str] = Field(default_factory=list)


class SearchResponse(BaseModel):
    query: str
    tag: str = ""
    hits: list[SearchHit]
    available_tags: list[str] = Field(default_factory=list)
