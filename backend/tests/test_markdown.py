import io
import stat
import zipfile

import pytest

from app.services.archive import ArchiveError, read_zip_markdown
from app.services.git_paths import PathError, normalize_git_path
from app.services.markdown import parse_markdown, unresolved_links


def test_paths_reject_traversal_and_absolute() -> None:
    with pytest.raises(PathError):
        normalize_git_path("../secret.md")
    with pytest.raises(PathError):
        normalize_git_path("/tmp/note.md")
    with pytest.raises(PathError):
        normalize_git_path(".hidden.md")
    assert normalize_git_path("dir/Note.md") == "dir/Note.md"


def test_parse_frontmatter_links_and_unresolved() -> None:
    parsed = parse_markdown(
        "note.md",
        "---\ntitle: Hello\ntags: [a, b]\naliases: [Hi]\n---\nSee [[Other]] and [x](peer.md).\n",
    )
    assert parsed.title == "Hello"
    assert parsed.tags == ("a", "b")
    assert parsed.aliases == ("Hi",)
    assert parsed.links == ("Other", "peer.md")
    assert unresolved_links(parsed.links, {"note.md", "peer.md"}) == ("Other",)


def test_zip_skips_unsafe_entries(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "ingest_max_zip_bytes", 1_000_000)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("ok.md", "# Ok\n")
        archive.writestr("../no.md", "# No\n")
        info = zipfile.ZipInfo("link.md")
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(info, "target")
    with pytest.raises(ArchiveError):
        read_zip_markdown(buffer.getvalue())


def _clear_zip_utf8_flags(data: bytes) -> bytes:
    raw = bytearray(data)
    cursor = 0
    while cursor < len(raw):
        local = raw.find(b"PK\x03\x04", cursor)
        central = raw.find(b"PK\x01\x02", cursor)
        if local == -1 and central == -1:
            break
        if central == -1 or (local != -1 and local < central):
            flag_at = local + 6
            cursor = local + 4
        else:
            flag_at = central + 8
            cursor = central + 4
        flag = int.from_bytes(raw[flag_at : flag_at + 2], "little") & ~0x800
        raw[flag_at : flag_at + 2] = flag.to_bytes(2, "little")
    return bytes(raw)


def test_zip_reads_cyrillic_names_without_utf8_flag() -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("заметки/привет.md", "# Привет\n")
    files = read_zip_markdown(_clear_zip_utf8_flags(buffer.getvalue()))
    assert files == [("заметки/привет.md", "# Привет\n")]
