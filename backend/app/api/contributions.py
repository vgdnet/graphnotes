from fastapi import APIRouter

from app.api.dependencies import CurrentUser, DatabaseSession
from app.schemas.contributions import ContributionsResponse
from app.services.contributions import get_contributions_me
from app.services.github import GitHubAppClient

router = APIRouter(tags=["contributions"])


def _client() -> GitHubAppClient:
    return GitHubAppClient()


@router.get("/contributions/me", response_model=ContributionsResponse)
async def contributions_me(
    user: CurrentUser,
    database: DatabaseSession,
) -> ContributionsResponse:
    body = await get_contributions_me(database, user=user, client=_client())
    return ContributionsResponse.model_validate(body)

