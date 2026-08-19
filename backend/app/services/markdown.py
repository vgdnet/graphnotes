from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

import yaml
from yaml import YAMLError

_FRONTMATTER = re.compile(
    r"\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*\r?\n?(.*)\Z",
    re.DOTALL,
)
_HEADING = re.compile(r"^#\s+(.+)$", re.MULTILINE)
_WIKILINK = re.compile(r"\[\[([^\[\]]+)\]\]")
_MD_LINK = re.compile(r"(?<!!)\[([^\]]+)\]\(([^)]+)\)")
_MAX_FRONTMATTER = 8192


@dataclass(frozen=True)
class ParsedNote:
    title: str
    tags: tuple[str, ...]
    aliases: tuple[str, ...]
    links: tuple[str, ...]
    body: str
    content_hash: str
    warnings: tuple[str, ...] = field(default_factory=tuple)


def parse_markdown(path: str, text: str) -> ParsedNote:
    if "\x00" in text:
        raise ValueError("Markdown must be UTF-8 text")
    warnings: list[str] = []
    meta: dict[str, object] = {}
    body = text
    match = _FRONTMATTER.match(text)
    if match:
        raw_meta = match.group(1)
        if len(raw_meta) > _MAX_FRONTMATTER:
            warnings.append("frontmatter is too large and was ignored")
        else:
            loaded, warning = _safe_frontmatter(raw_meta)
            if warning:
                warnings.append(warning)
            elif loaded is not None:
                meta = loaded
                body = match.group(2)
    title = _first_string(meta.get("title")) or _heading_title(body) or _stem(path)
    tags = _string_list(meta.get("tags"))
    aliases = _string_list(meta.get("aliases") or meta.get("alias"))
    links = tuple(dict.fromkeys(_collect_links(body)))
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return ParsedNote(
        title=title[:200],
        tags=tags,
        aliases=aliases,
        links=links,
        body=body,
        content_hash=digest,
        warnings=tuple(warnings),
    )


def unresolved_links(links: tuple[str, ...], available_paths: set[str]) -> tuple[str, ...]:
    flat: set[str] = set()
    for path in available_paths:
        flat.update(_lookup_keys(path))
    missing: list[str] = []
    for link in links:
        if _link_key(link) not in flat:
            missing.append(link)
    return tuple(missing)


def _safe_frontmatter(raw: str) -> tuple[dict[str, object] | None, str | None]:
    try:
        loaded = yaml.safe_load(raw)
    except YAMLError:
        return None, "frontmatter is invalid and was ignored"
    if loaded is None:
        return {}, None
    if not isinstance(loaded, dict):
        return None, "frontmatter is invalid and was ignored"
    return {str(key): value for key, value in loaded.items()}, None


def _heading_title(body: str) -> str | None:
    match = _HEADING.search(body)
    if match is None:
        return None
    return match.group(1).strip()


def _stem(path: str) -> str:
    name = path.rsplit("/", 1)[-1]
    if name.lower().endswith(".md"):
        name = name[:-3]
    return name or "note"


def _first_string(value: object) -> str | None:
    if isinstance(value, str):
        text = value.strip()
        return text or None
    return None


def _string_list(value: object) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        parts = [item.strip() for item in value.split(",")]
        return tuple(item for item in parts if item)
    if isinstance(value, list):
        items: list[str] = []
        for item in value:
            if isinstance(item, str) and item.strip():
                items.append(item.strip())
        return tuple(items)
    return ()


def _collect_links(body: str) -> list[str]:
    links: list[str] = []
    for match in _WIKILINK.finditer(body):
        target = match.group(1).split("|", 1)[0].split("#", 1)[0].strip()
        if target:
            links.append(target)
    for match in _MD_LINK.finditer(body):
        target = match.group(2).split("#", 1)[0].strip()
        if not target or "://" in target or target.startswith("mailto:"):
            continue
        links.append(target)
    return links


def _link_key(target: str) -> str:
    text = target.replace("\\", "/").strip().lstrip("/")
    if text.lower().endswith(".md"):
        text = text[:-3]
    return text.casefold()


def _lookup_keys(path: str) -> set[str]:
    stem = _link_key(path)
    name = path.rsplit("/", 1)[-1]
    return {stem, _link_key(name)}
