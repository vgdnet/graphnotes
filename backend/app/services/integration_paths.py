from __future__ import annotations

import unicodedata

from app.core.config import settings


ALLOWED_KINDS = {
    "markdown": {".md"},
    "png": {".png"},
    "jpeg": {".jpg", ".jpeg"},
    "gif": {".gif"},
    "webp": {".webp"},
    "pdf": {".pdf"},
}

KIND_BY_SUFFIX = {
    suffix: kind for kind, suffixes in ALLOWED_KINDS.items() for suffix in suffixes
}


class IntegrationPathError(ValueError):
    def __init__(self, message: str, *, path: str | None = None) -> None:
        super().__init__(message)
        self.path = path


def normalize_integration_path(raw: str) -> str:
    """POSIX relative path for the plugin contract (TZ §7).

    Does not reuse `normalize_git_path`: that helper requires `.md` and
    rejects hidden segments. Attachments are first-class here.
    """
    if not isinstance(raw, str) or "\x00" in raw:
        raise IntegrationPathError("path is invalid")
    if "\\" in raw:
        raise IntegrationPathError("path is invalid")
    text = unicodedata.normalize("NFC", raw).strip()
    if not text or text.startswith("/"):
        raise IntegrationPathError("path is invalid")
    if len(text) > settings.ingest_max_path_length:
        raise IntegrationPathError("path is invalid")
    parts: list[str] = []
    for part in text.split("/"):
        if part in {"", ".", ".."}:
            raise IntegrationPathError("path is invalid")
        parts.append(part)
    if len(parts) > settings.ingest_max_path_depth:
        raise IntegrationPathError("path is too deep")
    path = "/".join(parts)
    suffix = _suffix(path)
    if suffix not in KIND_BY_SUFFIX:
        raise IntegrationPathError("unsupported type", path=path)
    return path


def kind_for_path(path: str) -> str:
    kind = KIND_BY_SUFFIX.get(_suffix(path))
    if kind is None:
        raise IntegrationPathError("unsupported type", path=path)
    return kind


def _suffix(path: str) -> str:
    name = path.rsplit("/", 1)[-1]
    dot = name.rfind(".")
    if dot <= 0:
        return ""
    return name[dot:].casefold()
