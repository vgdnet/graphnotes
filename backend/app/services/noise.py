from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import math
import re
import unicodedata
import zlib

# Soft heuristics are unreliable on stubs (headings, one-line cards).
_MIN_SOFT_CHARS = 80
# Full-file entropy at this level is compressed / random, not prose.
_HARD_ENTROPY = 7.5
_SOFT_LOCK_SCORE = 4

_FENCE_RE = re.compile(r"(?:```|~~~).*?(?:```|~~~)", re.DOTALL)
_FRONTMATTER_RE = re.compile(r"\A---[ \t]*\n.*?\n---[ \t]*\n?", re.DOTALL)


@dataclass(frozen=True)
class NoiseVerdict:
    is_noise: bool
    reasons: tuple[str, ...]
    text: str = ""


class WhiteNoiseContentError(Exception):
    """Claimed Markdown that is garbage / binary, not a note."""

    def __init__(self, hits: list[tuple[str, tuple[str, ...]]]) -> None:
        self.hits = hits
        self.paths = [path for path, _ in hits]
        self.reasons = tuple(sorted({reason for _, reasons in hits for reason in reasons}))
        super().__init__("content is not Markdown notes")


def inspect_markdown_bytes(data: bytes) -> NoiseVerdict:
    if b"\x00" in data:
        return NoiseVerdict(True, ("null_bytes",))
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return NoiseVerdict(True, ("invalid_utf8",))
    return inspect_markdown_text(text)


def inspect_markdown_text(text: str) -> NoiseVerdict:
    if "\x00" in text:
        return NoiseVerdict(True, ("null_bytes",), text)
    controls = _control_count(text)
    length = len(text)
    if controls >= 16 or (length >= 8 and controls / length >= 0.08):
        return NoiseVerdict(True, ("control_soup",), text)

    raw = text.encode("utf-8")
    entropy = _shannon_entropy(raw)
    if entropy >= _HARD_ENTROPY and length >= _MIN_SOFT_CHARS:
        return NoiseVerdict(True, ("high_entropy",), text)

    prose = _prose_surface(text)
    if len(prose) < _MIN_SOFT_CHARS:
        return NoiseVerdict(False, (), text)

    score, reasons = _soft_score(prose)
    if score >= _SOFT_LOCK_SCORE:
        return NoiseVerdict(True, tuple(reasons), text)
    return NoiseVerdict(False, (), text)


def scan_markdown_files(files: list[tuple[str, bytes]]) -> list[tuple[str, str]]:
    """Decode Markdown payloads or raise when any file is white noise."""
    decoded: list[tuple[str, str]] = []
    hits: list[tuple[str, tuple[str, ...]]] = []
    for path, payload in files:
        verdict = inspect_markdown_bytes(payload)
        if verdict.is_noise:
            hits.append((path, verdict.reasons))
            continue
        decoded.append((path, verdict.text))
    if hits:
        raise WhiteNoiseContentError(hits)
    return decoded


def _prose_surface(text: str) -> str:
    stripped = _FRONTMATTER_RE.sub("", text, count=1)
    stripped = _FENCE_RE.sub("\n", stripped)
    return stripped


def _control_count(text: str) -> int:
    return sum(
        1
        for char in text
        if char not in "\t\n\r" and unicodedata.category(char) == "Cc"
    )


def _shannon_entropy(data: bytes) -> float:
    if not data:
        return 0.0
    counts = Counter(data)
    total = len(data)
    return -sum((count / total) * math.log2(count / total) for count in counts.values())


def _soft_score(text: str) -> tuple[int, list[str]]:
    raw = text.encode("utf-8")
    entropy = _shannon_entropy(raw)
    letters = 0
    cjk = 0
    whitespace = 0
    run = 0
    letter_runs = 0
    for char in text:
        if char.isspace():
            whitespace += 1
            if run >= 2:
                letter_runs += 1
            run = 0
            continue
        category = unicodedata.category(char)
        if category.startswith("L"):
            letters += 1
            if category == "Lo":
                cjk += 1
                if run >= 2:
                    letter_runs += 1
                run = 0
            else:
                run += 1
        else:
            if run >= 2:
                letter_runs += 1
            run = 0
    if run >= 2:
        letter_runs += 1

    length = max(len(text), 1)
    letter_ratio = letters / length
    word_units = letter_runs + cjk
    word_density = word_units / length
    ws_ratio = whitespace / length

    score = 0
    reasons: list[str] = []
    if entropy >= 6.9:
        score += 2
        reasons.append("high_entropy")
    elif entropy >= 6.3:
        score += 1
        reasons.append("elevated_entropy")

    if letter_ratio < 0.10:
        score += 3
        reasons.append("few_letters")
    elif letter_ratio < 0.22:
        score += 2
        reasons.append("few_letters")
    elif letter_ratio < 0.35:
        score += 1
        reasons.append("few_letters")

    if cjk == 0 and letter_ratio < 0.50 and word_density < 0.02:
        score += 2
        reasons.append("no_words")
    elif cjk == 0 and letter_ratio < 0.50 and word_density < 0.05:
        score += 1
        reasons.append("no_words")

    if cjk == 0 and letter_ratio < 0.50 and ws_ratio < 0.015:
        score += 2
        reasons.append("no_whitespace")
    elif cjk == 0 and letter_ratio < 0.40 and ws_ratio < 0.04:
        score += 1
        reasons.append("no_whitespace")

    if len(raw) >= 200:
        unique_ratio = len(set(raw)) / min(len(raw), 256)
        if unique_ratio >= 0.85 and entropy >= 6.5:
            score += 2
            reasons.append("byte_spread")

    if (
        len(raw) >= _MIN_SOFT_CHARS
        and _incompressible(raw)
        and entropy >= 6.3
    ):
        score += 3
        reasons.append("incompressible")

    return score, reasons


def _incompressible(data: bytes) -> bool:
    packed = zlib.compress(data, 9)
    return len(packed) >= int(len(data) * 0.92)
