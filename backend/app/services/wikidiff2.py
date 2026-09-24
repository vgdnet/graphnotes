from __future__ import annotations

from dataclasses import dataclass
from html import escape
from html.parser import HTMLParser
import json
import subprocess
from pathlib import Path

from app.core.config import settings

_SIBLING_HELPER = Path(__file__).with_name("graphnotes-wikidiff2")


class Wikidiff2Error(Exception):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


@dataclass(frozen=True)
class WikiDiffResult:
    html: str
    engine: str
    version: str
    rows: list[dict[str, str]]


class _Sanitizer(HTMLParser):
    _allowed_tags = frozenset({"tr", "td", "div", "del", "ins"})

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._stack: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag not in self._allowed_tags:
            self._skip += 1
            return
        if self._skip:
            return
        kept: list[str] = []
        for key, value in attrs:
            if value is None or not _allowed_attr(key, value):
                continue
            kept.append(f'{key}="{escape(value, quote=True)}"')
        self.parts.append(f"<{tag}" + ((" " + " ".join(kept)) if kept else "") + ">")
        self._stack.append(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag not in self._allowed_tags:
            if self._skip:
                self._skip -= 1
            return
        if self._skip or tag not in self._stack:
            return
        while self._stack:
            current = self._stack.pop()
            self.parts.append(f"</{current}>")
            if current == tag:
                break

    def handle_data(self, data: str) -> None:
        if self._skip or not self._stack:
            return
        self.parts.append(escape(data))

    def handle_comment(self, data: str) -> None:
        label = data.strip()
        if self._skip or not self._stack:
            return
        if label.startswith("LINE ") and label[5:].strip().isdigit():
            self.parts.append(f"<!--{label}-->")


def _allowed_attr(key: str, value: str) -> bool:
    if key == "class":
        return all(_diff_class(part) for part in value.split())
    if key == "colspan":
        return value.isdigit() and 1 <= int(value) <= 4
    if key == "data-marker":
        return value in {"+", "−", "-"}
    return False


def _diff_class(name: str) -> bool:
    return bool(name) and name.startswith("diff") and all(
        char.isalnum() or char in "-_" for char in name
    )


def sanitize_wikidiff_html(raw: str) -> str:
    parser = _Sanitizer()
    parser.feed(raw)
    parser.close()
    return "".join(parser.parts)


class _RowParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[dict[str, str]] = []
        self._td_classes: list[str] = []
        self._td_text: list[str] = []
        self._current_classes = ""
        self._current_text: list[str] = []
        self._in_td = False
        self._skip_row = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        classes = " ".join(value or "" for key, value in attrs if key == "class")
        if tag == "tr":
            self._td_classes = []
            self._td_text = []
            self._skip_row = "diff-lineno" in classes
        elif tag == "td":
            self._in_td = True
            self._current_classes = classes
            self._current_text = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "td" and self._in_td:
            self._td_classes.append(self._current_classes)
            self._td_text.append("".join(self._current_text))
            self._in_td = False
        elif tag == "tr" and not self._skip_row:
            row = _row_from_cells(self._td_classes, self._td_text)
            if row is not None:
                self.rows.append(row)

    def handle_data(self, data: str) -> None:
        if self._in_td:
            self._current_text.append(data)


def _row_from_cells(classes: list[str], texts: list[str]) -> dict[str, str] | None:
    left = ""
    right = ""
    left_kind = ""
    right_kind = ""
    for class_name, text in zip(classes, texts, strict=False):
        if "diff-deletedline" in class_name or (
            "diff-context" in class_name and "diff-side-deleted" in class_name
        ):
            left = text
            left_kind = "context" if "diff-context" in class_name else "changed"
        elif "diff-addedline" in class_name or (
            "diff-context" in class_name and "diff-side-added" in class_name
        ):
            right = text
            right_kind = "context" if "diff-context" in class_name else "changed"
    if not left and not right:
        return None
    if left_kind == "context" and right_kind == "context":
        op = "equal"
    elif not left:
        op = "insert"
    elif not right:
        op = "delete"
    else:
        op = "replace"
    return {"op": op, "left": left, "right": right}


def rows_from_table(html: str) -> list[dict[str, str]]:
    parser = _RowParser()
    parser.feed(html)
    parser.close()
    return parser.rows


def helper_path() -> Path:
    configured = Path(settings.wikidiff2_helper)
    if configured.is_file():
        return configured
    if _SIBLING_HELPER.is_file():
        return _SIBLING_HELPER
    return configured


def available() -> bool:
    path = helper_path()
    if not path.is_file():
        return False
    try:
        completed = subprocess.run(
            [str(path), "--version"],
            check=False,
            timeout=5,
            capture_output=True,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return completed.returncode == 0


def table_diff(before: str, after: str) -> WikiDiffResult:
    path = helper_path()
    if not path.is_file():
        raise Wikidiff2Error("wikidiff2 helper is missing")
    payload = json.dumps(
        {"before": before.replace("\r\n", "\n").replace("\r", "\n"), "after": after.replace("\r\n", "\n").replace("\r", "\n")},
        ensure_ascii=False,
    ).encode("utf-8")
    try:
        completed = subprocess.run(
            [str(path)],
            input=payload,
            capture_output=True,
            check=False,
            timeout=settings.wikidiff2_timeout_seconds,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Wikidiff2Error("wikidiff2 is unavailable") from exc
    if completed.returncode != 0:
        raise Wikidiff2Error("wikidiff2 is unavailable")
    try:
        loaded = json.loads(completed.stdout.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise Wikidiff2Error("wikidiff2 returned invalid output") from exc
    html = sanitize_wikidiff_html(str(loaded.get("table_html") or ""))
    return WikiDiffResult(
        html=html,
        engine=str(loaded.get("engine") or "wikidiff2"),
        version=str(loaded.get("version") or ""),
        rows=rows_from_table(html),
    )
