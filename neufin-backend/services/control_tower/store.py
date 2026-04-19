"""File-backed persistence for last snapshot and per-connector sync state."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import structlog

from core.config import settings

logger = structlog.get_logger(__name__)

SNAPSHOT_NAME = "control_tower_snapshot.json"
SYNC_STATE_NAME = "connector_sync_state.json"


def _data_dir() -> Path:
    raw = getattr(settings, "OPS_CONTROL_TOWER_DATA_DIR", None) or os.getenv(
        "OPS_CONTROL_TOWER_DATA_DIR", ""
    )
    if raw.strip():
        return Path(raw).expanduser().resolve()
    # Default: neufin-backend/.cache/control_tower (created on write)
    here = Path(__file__).resolve()
    backend_root = here.parents[1]  # services -> neufin-backend
    return (backend_root / ".cache" / "control_tower").resolve()


def persist_snapshot(snapshot: dict[str, Any]) -> Path:
    d = _data_dir()
    d.mkdir(parents=True, exist_ok=True)
    path = d / SNAPSHOT_NAME
    tmp = path.with_suffix(".tmp")
    payload = {**snapshot, "persisted_at": snapshot.get("generated_at")}
    tmp.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    tmp.replace(path)
    logger.info("control_tower.store.written", path=str(path))
    return path


def load_last_snapshot() -> dict[str, Any] | None:
    path = _data_dir() / SNAPSHOT_NAME
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("control_tower.store.read_failed", error=str(exc))
        return None


def persist_sync_state(state: dict[str, Any]) -> None:
    d = _data_dir()
    d.mkdir(parents=True, exist_ok=True)
    path = d / SYNC_STATE_NAME
    path.write_text(json.dumps(state, indent=2, default=str), encoding="utf-8")


def load_sync_state() -> dict[str, Any]:
    path = _data_dir() / SYNC_STATE_NAME
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
