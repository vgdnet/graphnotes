from pydantic import BaseModel


class SearchHit(BaseModel):
    path: str
    title: str


class SearchResponse(BaseModel):
    query: str
    hits: list[SearchHit]
