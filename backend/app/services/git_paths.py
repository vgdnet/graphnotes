from __future__ import annotations

import unicodedata

from app.core.config import settings


class PathError(ValueError):
    pass


def normalize_git_path(raw: str) -> str:
    if not isinstance(raw, str) or "\x00" in raw:
        raise PathError("path is invalid")
    text = unicodedata.normalize("NFC", raw.replace("\\", "/")).strip()
    if not text or text.startswith("/") or text.startswith("~"):
        raise PathError("path is invalid")
    if len(text) > settings.ingest_max_path_length:
        raise PathError("path is invalid")
    parts: list[str] = []
    for part in text.split("/"):
        if part in {"", ".", ".."} or part.startswith(".") or ":" in part:
            raise PathError("path is invalid")
        parts.append(part)
    if len(parts) > settings.ingest_max_path_depth:
        raise PathError("path is too deep")
    path = "/".join(parts)
    if not path.lower().endswith(".md"):
        raise PathError("only Markdown files are accepted")
    return path
