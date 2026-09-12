from __future__ import annotations

import zipfile

# Physical ZIP policy for browser-friendly P2RLN packages. This does not affect
# Core contentRoot semantics: two packages with different ZIP methods can carry
# exactly the same P2RLN content.
_STORED_MEDIA_TYPES = {
    "application/pdf",
    "application/zip",
    "application/gzip",
    "application/x-gzip",
    "application/x-7z-compressed",
    "application/x-rar-compressed",
    "application/vnd.rar",
    "application/wasm",
}
_STORED_SUFFIXES = (
    "+zip",
)


def base_media_type(media_type: str | None) -> str:
    return str(media_type or "application/octet-stream").split(";", 1)[0].strip().lower()


def prefers_stored(media_type: str | None) -> bool:
    media = base_media_type(media_type)
    if media.startswith(("audio/", "video/")):
        return True
    # Raster images are normally already compressed. Keep SVG/XML deflated.
    if media.startswith("image/") and media not in {"image/svg+xml", "image/x-icon"}:
        return True
    if media in _STORED_MEDIA_TYPES or media.endswith(_STORED_SUFFIXES):
        return True
    return False


def compression_method(media_type: str | None) -> int:
    return zipfile.ZIP_STORED if prefers_stored(media_type) else zipfile.ZIP_DEFLATED


def zipinfo(name: str, media_type: str | None) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = compression_method(media_type)
    info.external_attr = 0o100644 << 16
    return info
