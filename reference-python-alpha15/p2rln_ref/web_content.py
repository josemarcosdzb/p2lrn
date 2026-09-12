from __future__ import annotations

from pathlib import PurePosixPath
from typing import Any

PROFILE = "https://p2rln.org/profile/web-content"
MAPPING_EXTENSION = "https://p2rln.org/extension/web-content-bundle"
EXTENSION_VERSION = "1"


class WebContentError(ValueError):
    pass


def safe_logical_path(value: str) -> str:
    value = str(value or "")
    if not value or value.startswith("/") or "\\" in value or "\x00" in value:
        raise WebContentError(f"unsafe web-content logical path: {value!r}")
    path = PurePosixPath(value)
    if any(part in {"", ".", ".."} for part in path.parts):
        raise WebContentError(f"unsafe web-content logical path: {value!r}")
    return path.as_posix()


def validate_web_content_mapping(rep: dict[str, Any], inventory: set[str]) -> dict[str, Any] | None:
    ext = (rep.get("extensions") or {}).get(MAPPING_EXTENSION)
    if ext is None:
        return None
    if not isinstance(ext, dict):
        raise WebContentError("web-content bundle extension must be an object")
    if ext.get("version") != EXTENSION_VERSION:
        raise WebContentError(f"unsupported web-content mapping version: {ext.get('version')!r}")
    entrypoint = safe_logical_path(ext.get("entrypoint", ""))
    assets = ext.get("assets")
    if not isinstance(assets, dict) or not assets:
        raise WebContentError("web-content assets must be a non-empty object")
    if len(assets) > 5000:
        raise WebContentError("web-content mapping contains more than 5000 assets")
    normalized: dict[str, str] = {}
    for logical, embedded in assets.items():
        logical_path = safe_logical_path(logical)
        if logical_path != logical:
            raise WebContentError(f"web-content logical path is not canonical: {logical!r}")
        if not isinstance(embedded, str) or embedded not in inventory:
            raise WebContentError(f"web-content asset is not inventoried: {logical_path}")
        normalized[logical_path] = embedded
    if entrypoint not in normalized:
        raise WebContentError("web-content entrypoint is absent from assets mapping")
    location = rep.get("location") or {}
    if location.get("type") != "embedded" or location.get("path") != normalized[entrypoint]:
        raise WebContentError("web-content representation location must match the mapped entrypoint payload")
    return {"version": EXTENSION_VERSION, "entrypoint": entrypoint, "assets": normalized}
