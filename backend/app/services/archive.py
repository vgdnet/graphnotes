from __future__ import annotations

import io
import stat
import zipfile
import zlib

from app.core.config import settings
from app.services.git_paths import PathError, normalize_git_path


class ArchiveError(ValueError):
    pass


def read_markdown_bytes(data: bytes, filename: str) -> list[tuple[str, str]]:
    if len(data) > settings.ingest_max_file_bytes:
        raise ArchiveError("file is too large")
    if _looks_like_zip(data):
        raise ArchiveError("upload a .md file or a ZIP archive, not both at once")
    text = _decode_utf8(data)
    return [(normalize_git_path(filename.replace("\\", "/").rsplit("/", 1)[-1]), text)]


def read_zip_markdown(data: bytes) -> list[tuple[str, str]]:
    if len(data) > settings.ingest_max_zip_bytes:
        raise ArchiveError("archive is too large")
    if not _looks_like_zip(data):
        raise ArchiveError("file is not a ZIP archive")
    try:
        archive = _open_zip(data)
    except zipfile.BadZipFile as exc:
        raise ArchiveError("archive is unreadable") from exc

    files: list[tuple[str, str]] = []
    seen: set[str] = set()
    unpacked = 0
    names = archive.infolist()
    if len(names) > settings.ingest_max_files:
        raise ArchiveError("archive has too many files")

    for info in names:
        if info.is_dir():
            continue
        if info.flag_bits & 0x1:
            raise ArchiveError("encrypted archive entries are not accepted")
        if info.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
            raise ArchiveError("archive compression is not accepted")
        mode = (info.external_attr >> 16) & 0xFFFF
        if mode and (stat.S_ISLNK(mode) or stat.S_ISCHR(mode) or stat.S_ISBLK(mode)):
            raise ArchiveError("symbolic links and special files are not accepted")
        if info.file_size > settings.ingest_max_file_bytes:
            raise ArchiveError("an archived file is too large")
        if info.compress_size and info.file_size > max(64_000, info.compress_size * 100):
            raise ArchiveError("archive looks like a compression bomb")
        try:
            path = normalize_git_path(_zip_member_name(info))
        except PathError:
            continue
        if path in seen:
            raise ArchiveError("archive contains duplicate Markdown paths")
        try:
            with archive.open(info) as handle:
                payload = _read_limited(handle, settings.ingest_max_file_bytes)
        except (zipfile.BadZipFile, RuntimeError, OSError, zlib.error) as exc:
            raise ArchiveError("archive is unreadable") from exc
        unpacked += len(payload)
        if unpacked > settings.ingest_max_unpacked_bytes:
            raise ArchiveError("unpacked archive is too large")
        files.append((path, _decode_utf8(payload)))
        seen.add(path)

    if not files:
        raise ArchiveError("archive contains no Markdown files")
    return files


def _open_zip(data: bytes) -> zipfile.ZipFile:
    last_error: Exception | None = None
    for encoding in ("utf-8", "cp866"):
        try:
            return zipfile.ZipFile(io.BytesIO(data), metadata_encoding=encoding)
        except zipfile.BadZipFile:
            raise
        except UnicodeError as exc:
            last_error = exc
            continue
    raise ArchiveError("archive filenames are not readable") from last_error


def _zip_member_name(info: zipfile.ZipInfo) -> str:
    name = info.filename
    if info.flag_bits & 0x800:
        return name
    try:
        raw = name.encode("cp437")
    except UnicodeEncodeError:
        return name
    if not any(byte >= 0x80 for byte in raw):
        return name
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("cp866")


def _looks_like_zip(data: bytes) -> bool:
    return data.startswith(b"PK")


def _decode_utf8(data: bytes) -> str:
    if b"\x00" in data:
        raise ArchiveError("file is not UTF-8 Markdown")
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ArchiveError("file is not UTF-8 Markdown") from exc


def _read_limited(handle, limit: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = handle.read(65_536)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise ArchiveError("an archived file is too large")
        chunks.append(chunk)
    return b"".join(chunks)
