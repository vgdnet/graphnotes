"""Raise Starlette's 1 MiB multipart part cap to the ingest ZIP limit."""

from __future__ import annotations

from starlette.requests import Request

from app.core.config import settings

_installed = False


def install_ingest_upload_limit() -> None:
    global _installed
    if _installed:
        return
    original = Request._get_form

    async def _get_form(
        self,
        *,
        max_files: int | float = 1000,
        max_fields: int | float = 1000,
        max_part_size: int = 1024 * 1024,
    ):
        return await original(
            self,
            max_files=max_files,
            max_fields=max_fields,
            max_part_size=max(max_part_size, settings.ingest_max_zip_bytes),
        )

    Request._get_form = _get_form  # type: ignore[method-assign]
    _installed = True


install_ingest_upload_limit()
