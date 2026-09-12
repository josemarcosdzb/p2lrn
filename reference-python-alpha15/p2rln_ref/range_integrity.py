from __future__ import annotations

import hashlib
import math
from typing import Iterable

EXTENSION = "org.p2rln.rangeIntegrity"
VERSION = "1"
MEDIA_TYPE = "application/vnd.p2rln.range-integrity+json"
DEFAULT_CHUNK_SIZE = 1024 * 1024
MIN_CHUNK_SIZE = 64 * 1024
MAX_CHUNK_SIZE = 8 * 1024 * 1024


class RangeIntegrityError(ValueError):
    pass


def sha256_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def chunk_digests(data: bytes, chunk_size: int = DEFAULT_CHUNK_SIZE) -> list[str]:
    if not isinstance(chunk_size, int) or not (MIN_CHUNK_SIZE <= chunk_size <= MAX_CHUNK_SIZE):
        raise RangeIntegrityError(
            f"chunkSize must be between {MIN_CHUNK_SIZE} and {MAX_CHUNK_SIZE} bytes"
        )
    return [sha256_bytes(data[offset : offset + chunk_size]) for offset in range(0, len(data), chunk_size)]


def build_range_integrity_map(
    payloads: dict[str, bytes],
    paths: Iterable[str],
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> dict:
    entries: dict[str, dict] = {}
    for path in sorted(set(paths)):
        if path not in payloads:
            raise RangeIntegrityError(f"range-integrity payload is missing: {path}")
        data = payloads[path]
        entries[path] = {
            "size": len(data),
            "byteDigest": sha256_bytes(data),
            "chunks": chunk_digests(data, chunk_size),
        }
    return {
        "version": VERSION,
        "algorithm": "sha256",
        "chunkSize": chunk_size,
        "entries": entries,
    }


def validate_range_integrity_map(index: dict, *, inventory: set[str] | None = None) -> dict:
    if not isinstance(index, dict):
        raise RangeIntegrityError("range-integrity map must be an object")
    if index.get("version") != VERSION:
        raise RangeIntegrityError(f"unsupported range-integrity version: {index.get('version')!r}")
    if index.get("algorithm") != "sha256":
        raise RangeIntegrityError("range-integrity algorithm must be sha256")
    chunk_size = index.get("chunkSize")
    if not isinstance(chunk_size, int) or not (MIN_CHUNK_SIZE <= chunk_size <= MAX_CHUNK_SIZE):
        raise RangeIntegrityError("range-integrity chunkSize is outside the supported bounds")
    entries = index.get("entries")
    if not isinstance(entries, dict) or not entries:
        raise RangeIntegrityError("range-integrity entries must be a non-empty object")
    for path, entry in entries.items():
        if not isinstance(path, str) or not path:
            raise RangeIntegrityError("range-integrity entry path must be a non-empty string")
        if inventory is not None and path not in inventory:
            raise RangeIntegrityError(f"range-integrity entry is not inventoried: {path}")
        if not isinstance(entry, dict):
            raise RangeIntegrityError(f"range-integrity entry must be an object: {path}")
        size = entry.get("size")
        digest = entry.get("byteDigest")
        chunks = entry.get("chunks")
        if not isinstance(size, int) or size < 0:
            raise RangeIntegrityError(f"invalid range-integrity size: {path}")
        if not isinstance(digest, str) or not digest.startswith("sha256:") or len(digest) != 71:
            raise RangeIntegrityError(f"invalid range-integrity byteDigest: {path}")
        if not isinstance(chunks, list):
            raise RangeIntegrityError(f"range-integrity chunks must be an array: {path}")
        expected = math.ceil(size / chunk_size) if size else 0
        if len(chunks) != expected:
            raise RangeIntegrityError(
                f"range-integrity chunk count mismatch for {path}: expected {expected}, got {len(chunks)}"
            )
        for chunk in chunks:
            if not isinstance(chunk, str) or not chunk.startswith("sha256:") or len(chunk) != 71:
                raise RangeIntegrityError(f"invalid range-integrity chunk digest: {path}")
    return index
