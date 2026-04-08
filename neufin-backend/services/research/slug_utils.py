from __future__ import annotations

import re


def slugify(title: str) -> str:
    slug = title.lower()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug.strip())
    return slug[:80]


def estimate_read_time_minutes(*chunks: str) -> int:
    words = 0
    for c in chunks:
        if c:
            words += len(c.split())
    # Average reading speed ~200 wpm; never show 0.
    return max(1, round(words / 200))

