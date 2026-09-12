from app.services.wikidiff2 import sanitize_wikidiff_html, table_diff


def test_sanitize_wikidiff_html_keeps_engine_markup() -> None:
    raw = (
        '<tr><td class="diff-deletedline diff-side-deleted">'
        '<div>hello <del class="diffchange diffchange-inline">world</del></div></td>'
        '<td class="diff-addedline diff-side-added">'
        '<div>hello <ins class="diffchange diffchange-inline">there</ins></div></td></tr>'
    )
    html = sanitize_wikidiff_html(raw)
    assert "diff-deletedline" in html
    assert "diffchange-inline" in html
    assert "world" in html
    assert "there" in html


def test_sanitize_wikidiff_html_drops_scripts() -> None:
    html = sanitize_wikidiff_html(
        '<tr><td class="diff-context"><div>ok<script>alert(1)</script></div></td>'
        '<td class="diff-context" onclick="alert(1)">x</td></tr>'
    )
    assert "script" not in html
    assert "onclick" not in html
    assert "alert" not in html
    assert "ok" in html


def test_wikidiff2_engine_table_and_word_level() -> None:
    changed = table_diff("hello world\nkeep\n", "hello there\nkeep\n")
    assert changed.engine == "wikidiff2"
    assert changed.version
    assert "diffchange" in changed.html
    assert "world" in changed.html
    assert "there" in changed.html
    assert any(row["op"] == "replace" for row in changed.rows)
    added = table_diff("", "# Mine\n")
    assert "diff-addedline" in added.html
    assert "# Mine" in added.html
    assert added.rows == [{"op": "insert", "left": "", "right": "# Mine"}]
