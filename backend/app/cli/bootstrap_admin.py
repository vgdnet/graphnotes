import argparse
import asyncio

from app.db.session import async_session_factory, engine
from app.services.admin import AdminBootstrapError, bootstrap_admin


async def run(username: str) -> int:
    try:
        async with async_session_factory() as database:
            user = await bootstrap_admin(database, username)
        print(f"admin ready: {user.username} ({user.id})")
        return 0
    except (AdminBootstrapError, ValueError) as exc:
        print(f"admin bootstrap refused: {exc}")
        return 1
    finally:
        await engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Promote an existing active user when no active admin exists."
    )
    parser.add_argument("username")
    arguments = parser.parse_args()
    return asyncio.run(run(arguments.username))


if __name__ == "__main__":
    raise SystemExit(main())
