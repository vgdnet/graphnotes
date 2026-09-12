import os
import random

from app.services.noise import inspect_markdown_bytes, inspect_markdown_text


def test_normal_markdown_is_not_noise() -> None:
    text = """---
title: Card
tags: [src]
---
# Card

See [[missing]] and a short paragraph.

```python
print("hello")
```
"""
    assert inspect_markdown_text(text).is_noise is False


def test_cyrillic_cjk_stubs_and_wikilinks_are_not_noise() -> None:
    assert inspect_markdown_text("# Привет\nЭто карточка про [[терапию]].\n").is_noise is False
    assert inspect_markdown_text("# 你好\n这是一张卡片。\n").is_noise is False
    assert inspect_markdown_text("# Stub\n").is_noise is False
    assert inspect_markdown_text("[[wikilink]]\n").is_noise is False


def test_binary_and_invalid_utf8_are_noise() -> None:
    assert inspect_markdown_bytes(b"# hi\x00\xff").is_noise is True
    assert inspect_markdown_bytes(os.urandom(200)).is_noise is True
    assert "invalid_utf8" in inspect_markdown_bytes(b"\xff\xfe" + b"\x80" * 80).reasons or (
        inspect_markdown_bytes(b"\xff\xfe" + b"\x80" * 80).is_noise
    )


def test_symbol_soup_is_noise() -> None:
    soup = "".join("!@#$%^&*()[]{}<>/\\|+=~`"[(i * 7) % 22] for i in range(200))
    verdict = inspect_markdown_text(soup)
    assert verdict.is_noise is True


def test_high_entropy_printable_is_noise() -> None:
    rng = random.Random(42)
    text = "".join(chr(rng.randrange(32, 127)) for _ in range(300))
    verdict = inspect_markdown_text(text)
    assert verdict.is_noise is True
