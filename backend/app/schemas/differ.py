from pydantic import BaseModel, Field


class DifferItem(BaseModel):
    path: str
    title: str
    kind: str


class DifferResponse(BaseModel):
    differences: list[DifferItem] = Field(default_factory=list)
