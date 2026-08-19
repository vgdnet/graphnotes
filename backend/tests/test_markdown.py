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
