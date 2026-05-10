"""Python 3.9 helpers: ``zip(..., strict=...)`` exists only in 3.10+."""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from typing import Any


def zip_equal(*iterables: Iterable[Any]) -> Iterator[tuple[Any, ...]]:
    """Like ``zip(..., strict=True)``: raise if argument lengths differ."""
    seqs = [list(x) for x in iterables]
    if not seqs:
        return iter(())

    n = len(seqs[0])
    if any(len(s) != n for s in seqs[1:]):
        raise ValueError("zip() argument lengths differ")

    def _gen() -> Iterator[tuple[Any, ...]]:
        for i in range(n):
            yield tuple(s[i] for s in seqs)

    return _gen()
