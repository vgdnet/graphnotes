import argparse
import asyncio
import logging

from app.db.session import async_session_factory, engine
from app.services.github import GitHubAppClient
from app.services.sync import pull_connected_gits


async def run() -> int:
    logging.basicConfig(level=logging.INFO)
    try:
        async with async_session_factory() as database:
            await pull_connected_gits(database, GitHubAppClient())
        return 0
    finally:
        await engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Pull HEAD of the shared rhizome and every connected personal git."
    )
    parser.parse_args()
    return asyncio.run(run())


if __name__ == "__main__":
    raise SystemExit(main())
