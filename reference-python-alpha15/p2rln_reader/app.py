from __future__ import annotations

from dataclasses import dataclass
import base64
import json
import mimetypes
from pathlib import Path
import secrets
import struct
import threading
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlsplit
import webbrowser
from email.utils import formatdate

from p2rln_ref import P2RLNReader, CapabilitySet, ReadError
from p2rln_ref.web_content import PROFILE as WEB_CONTENT_PROFILE, WebContentError, safe_logical_path, validate_web_content_mapping

ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = Path(__file__).resolve().parent / "web"

COURSE = "https://p2rln.org/profile/course"
WEB = WEB_CONTENT_PROFILE
VIRTUAL_DEFLATED_RANGE_LIMIT = 64 * 1024 * 1024


class ReaderError(Exception):
    pass


def _b64u(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")


def _b64u_decode(value: str) -> str:
    padding = "=" * (-len(value) % 4)
    try:
        return base64.urlsafe_b64decode((value + padding).encode("ascii")).decode("utf-8")
    except Exception as exc:
        raise ReaderError("invalid encoded path") from exc


@dataclass(frozen=True)
class ViewTarget:
    status: str
    entity_id: str
    resource_id: str | None = None
    representation_id: str | None = None
    kind: str | None = None
    url: str | None = None
    media_type: str | None = None
    runtime: str | None = None
    reason: str | None = None
    metadata: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "entityId": self.entity_id,
            "resourceId": self.resource_id,
            "representationId": self.representation_id,
            "kind": self.kind,
            "url": self.url,
            "mediaType": self.media_type,
            "runtime": self.runtime,
            "reason": self.reason,
            "metadata": self.metadata or {},
        }


class P2RLNReadingSystem:
    """First-party reader for the `.p2rln` extension.

    It owns opening, validation, graph navigation and safe delivery of native
    P2RLN content. Specialized runtimes remain pluggable; unsupported profiles
    are inspected/preserved rather than executed implicitly.
    """

    def __init__(self, package: str | Path, *, validate_profile_payloads: bool = True) -> None:
        try:
            self.reader = P2RLNReader(
                package,
                strict_profiles=True,
                validate_profile_payloads=validate_profile_payloads,
            )
        except ReadError as exc:
            raise ReaderError(str(exc)) from exc
        self.package = Path(package)
        capabilities_doc = json.loads((Path(__file__).resolve().parent / "capabilities.json").read_text(encoding="utf-8"))
        self.capability_document = capabilities_doc
        self.capabilities = CapabilitySet.from_document(capabilities_doc)
        component_capability_path = Path(__file__).resolve().parent / "component-capabilities.json"
        component_capabilities = (
            json.loads(component_capability_path.read_text(encoding="utf-8"))
            if component_capability_path.is_file()
            else {"components": []}
        )
        self.component_capability_document = component_capabilities
        self._component_capabilities = {
            (item.get("id"), item.get("componentVersion")): item
            for item in component_capabilities.get("components", [])
            if item.get("id") and item.get("componentVersion")
        }
        self._manifest_files = {f["path"]: f for f in self.reader.manifest.get("files", [])}
        stat = self.package.stat()
        self._validated_package_identity = (stat.st_size, stat.st_mtime_ns)
        self._virtual_entry_cache: dict[str, dict[str, Any]] = {}

    def summary(self) -> dict[str, Any]:
        data = self.reader.summary()
        data["reader"] = {
            **self.capability_document["product"],
            "roles": self.capability_document["roles"],
            "nativeDelivery": ["web-content", "browser-media", "native-questionnaire", "native-composite", "native-component"],
            "componentImplementations": list(self.component_capability_document.get("components", [])),
            "specializedRuntimes": "plugin-required",
            "networkOnOpen": False,
        }
        return data

    def tree(self) -> dict[str, Any]:
        return self.reader.tree()

    def entity(self, entity_id: str) -> dict[str, Any]:
        try:
            return self.reader.entity(entity_id)
        except ReadError as exc:
            raise ReaderError(str(exc)) from exc

    def read_plan(self) -> dict[str, Any]:
        return self.reader.course_read_plan(self.capabilities, mode="read")

    def import_plan(self) -> dict[str, Any]:
        return self.reader.import_plan(self.capabilities)

    def _entity_resource(self, entity_id: str) -> tuple[str, dict[str, Any]]:
        entity = self.entity(entity_id)
        if entity["type"] == "resource":
            return entity_id, entity
        if entity["type"] == "activity" and entity.get("resource"):
            rid = entity["resource"]
            return rid, self.entity(rid)
        raise ReaderError("entity has no directly viewable resource")

    def view_target(self, entity_id: str, token: str) -> ViewTarget:
        try:
            resource_id, resource = self._entity_resource(entity_id)
        except ReaderError as exc:
            return ViewTarget(status="not-viewable", entity_id=entity_id, reason=str(exc))

        rep = self.reader.choose_representation(resource_id, self.capabilities, mode="deliver")
        if rep is None:
            # Explain whether preservation is still possible.
            preserve = self.reader.choose_representation(resource_id, self.capabilities, mode="preserve")
            reason = "No installed runtime can deliver this representation."
            if preserve is not None:
                reason += " The original representation can still be preserved and inspected."
            return ViewTarget(
                status="runtime-required",
                entity_id=entity_id,
                resource_id=resource_id,
                reason=reason,
                metadata={
                    "availableProfiles": [r.get("profile") for r in resource.get("representations", [])],
                    "preservable": preserve is not None,
                },
            )

        plan = self.reader.representation_plan(rep)
        kind = plan["kind"]
        media_type = plan.get("mediaType") or rep.get("mediaType")
        if kind in {"native-questionnaire", "native-composite", "native-component"}:
            try:
                payload = json.loads(self.reader.read_embedded_file(plan["path"], max_bytes=8 * 1024 * 1024))
            except (UnicodeDecodeError, json.JSONDecodeError, ReadError) as exc:
                return ViewTarget(
                    status="not-viewable",
                    entity_id=entity_id,
                    resource_id=resource_id,
                    representation_id=rep["id"],
                    kind=kind,
                    media_type=media_type,
                    runtime=plan.get("runtime"),
                    reason=f"Native P2RLN payload cannot be opened: {exc}",
                )
            if kind == "native-component":
                component = payload.get("component") if isinstance(payload, dict) else None
                if not isinstance(component, dict):
                    return ViewTarget(
                        status="not-viewable",
                        entity_id=entity_id,
                        resource_id=resource_id,
                        representation_id=rep["id"],
                        kind=kind,
                        media_type=media_type,
                        runtime=plan.get("runtime"),
                        reason="Native component payload has no component descriptor.",
                    )
                component_id = component.get("id")
                component_version = component.get("componentVersion")
                runtime_contract = component.get("runtimeContractVersion")
                data_version = component.get("dataVersion")
                installed = self._component_capabilities.get((component_id, component_version))
                component_meta = {
                    "componentId": component_id,
                    "componentVersion": component_version,
                    "runtimeContractVersion": runtime_contract,
                    "dataVersion": data_version,
                    "preservable": True,
                }
                if installed is None:
                    return ViewTarget(
                        status="runtime-required",
                        entity_id=entity_id,
                        resource_id=resource_id,
                        representation_id=rep["id"],
                        kind=kind,
                        media_type=media_type,
                        runtime=plan.get("runtime"),
                        reason=f"Native component implementation is not installed: {component_id} @ {component_version}.",
                        metadata=component_meta,
                    )
                if runtime_contract != installed.get("runtimeContractVersion"):
                    return ViewTarget(
                        status="runtime-required",
                        entity_id=entity_id,
                        resource_id=resource_id,
                        representation_id=rep["id"],
                        kind=kind,
                        media_type=media_type,
                        runtime=plan.get("runtime"),
                        reason=(
                            f"Native component runtime contract {runtime_contract} is not supported; "
                            f"installed implementation requires {installed.get('runtimeContractVersion')}."
                        ),
                        metadata=component_meta,
                    )
                if data_version not in installed.get("inputDataVersions", []):
                    return ViewTarget(
                        status="runtime-required",
                        entity_id=entity_id,
                        resource_id=resource_id,
                        representation_id=rep["id"],
                        kind=kind,
                        media_type=media_type,
                        runtime=plan.get("runtime"),
                        reason=f"Native component data version is not supported: {data_version}.",
                        metadata=component_meta,
                    )
        url: str | None = None
        if kind in {"embedded-file", "native-questionnaire", "native-composite", "native-component"}:
            url = f"/content/outer/{_b64u(plan['path'])}?t={quote(token)}"
        elif kind == "package-member" and plan.get("runtime") in {"passive", None}:
            url = (
                f"/content/package/{_b64u(plan['packagePath'])}/"
                f"{quote(plan['member'], safe='/')}?t={quote(token)}"
            )
        elif kind == "remote":
            return ViewTarget(
                status="external",
                entity_id=entity_id,
                resource_id=resource_id,
                representation_id=rep["id"],
                kind=kind,
                media_type=media_type,
                runtime=plan.get("runtime"),
                reason="Remote content is never fetched automatically by the reader.",
                metadata={"href": plan.get("href")},
            )
        else:
            return ViewTarget(
                status="runtime-required",
                entity_id=entity_id,
                resource_id=resource_id,
                representation_id=rep["id"],
                kind=kind,
                media_type=media_type,
                runtime=plan.get("runtime"),
                reason=f"This content requires the {plan.get('runtime') or 'profile'} runtime plugin.",
                metadata=plan.get("metadata") or {},
            )

        return ViewTarget(
            status="ready",
            entity_id=entity_id,
            resource_id=resource_id,
            representation_id=rep["id"],
            kind=kind,
            url=url,
            media_type=media_type,
            runtime=plan.get("runtime"),
            metadata=plan.get("metadata") or {},
        )

    def _assert_package_unchanged(self) -> None:
        stat = self.package.stat()
        current = (stat.st_size, stat.st_mtime_ns)
        if current != self._validated_package_identity:
            raise ReaderError("package changed on disk after validation; reopen the Reading System")

    def resolve_web_asset(self, representation_id: str, logical_path: str) -> str:
        self._assert_package_unchanged()
        try:
            _resource_id, rep = self.reader.representations[representation_id]
        except KeyError as exc:
            raise ReaderError(f"unknown representation: {representation_id}") from exc
        if rep.get("profile") != WEB_CONTENT_PROFILE:
            raise ReaderError("representation is not passive web-content")
        try:
            logical = safe_logical_path(logical_path)
            mapping = validate_web_content_mapping(rep, set(self._manifest_files))
        except WebContentError as exc:
            raise ReaderError(str(exc)) from exc
        if mapping is None:
            raise ReaderError("web-content representation has no relative-asset mapping")
        embedded = mapping["assets"].get(logical)
        if not embedded:
            raise ReaderError(f"web-content logical asset is not mapped: {logical}")
        return embedded

    def virtual_outer_info(self, path: str) -> dict[str, Any]:
        self._assert_package_unchanged()
        descriptor = self._manifest_files.get(path)
        if descriptor is None:
            raise ReaderError(f"embedded path is not inventoried: {path}")
        cached = self._virtual_entry_cache.get(path)
        if cached is not None:
            return dict(cached)
        try:
            with zipfile.ZipFile(self.package, "r") as zf:
                info = zf.getinfo(path)
            with self.package.open("rb") as handle:
                handle.seek(info.header_offset)
                header = handle.read(30)
                if len(header) != 30 or struct.unpack_from("<I", header, 0)[0] != 0x04034B50:
                    raise ReaderError(f"invalid local ZIP header for virtual resource: {path}")
                flags = struct.unpack_from("<H", header, 6)[0]
                method = struct.unpack_from("<H", header, 8)[0]
                name_length, extra_length = struct.unpack_from("<HH", header, 26)
                if flags & 0x0001:
                    raise ReaderError(f"encrypted ZIP member cannot be exposed as a virtual resource: {path}")
                if method != info.compress_type:
                    raise ReaderError(f"ZIP compression method mismatch for virtual resource: {path}")
                local_name_bytes = handle.read(name_length)
                if len(local_name_bytes) != name_length:
                    raise ReaderError(f"truncated local ZIP filename for virtual resource: {path}")
                try:
                    local_name = local_name_bytes.decode("utf-8" if flags & 0x0800 else "cp437")
                except UnicodeDecodeError as exc:
                    raise ReaderError(f"invalid local ZIP filename encoding for virtual resource: {path}") from exc
                if local_name != info.filename or local_name != path:
                    raise ReaderError(f"local/central ZIP filename mismatch for virtual resource: {path}")
                data_offset = info.header_offset + 30 + name_length + extra_length
            result = {
                "path": path,
                "mediaType": descriptor.get("mediaType") or mimetypes.guess_type(path)[0] or "application/octet-stream",
                "size": int(descriptor["size"]),
                "byteDigest": descriptor["byteDigest"],
                "contentDigest": descriptor["contentDigest"],
                "compressType": info.compress_type,
                "compressedSize": info.compress_size,
                "dataOffset": data_offset,
                "seekable": info.compress_type == zipfile.ZIP_STORED,
            }
            if info.file_size != result["size"]:
                raise ReaderError(f"ZIP/manifest size mismatch for virtual resource: {path}")
            self._virtual_entry_cache[path] = result
            return dict(result)
        except (KeyError, zipfile.BadZipFile) as exc:
            raise ReaderError(f"cannot resolve virtual resource {path}: {exc}") from exc

    def read_outer(self, path: str, *, max_bytes: int = 64 * 1024 * 1024) -> tuple[bytes, str]:
        self._assert_package_unchanged()
        data = self.reader.read_embedded_file(path, max_bytes=max_bytes)
        media_type = self._manifest_files.get(path, {}).get("mediaType")
        if not media_type:
            media_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
        return data, media_type

    def read_package_member(self, package_path: str, member: str, *, max_bytes: int = 64 * 1024 * 1024) -> tuple[bytes, str]:
        data = self.reader.read_package_member(package_path, member, max_bytes=max_bytes)
        media_type = mimetypes.guess_type(urlsplit(member).path)[0] or "application/octet-stream"
        return data, media_type


class _Handler(BaseHTTPRequestHandler):
    server_version = "P2RLNReader/0.4.0a15"

    @property
    def app(self) -> "ReaderServer":
        return self.server.reader_server  # type: ignore[attr-defined]

    def log_message(self, format: str, *args: Any) -> None:
        if self.app.verbose:
            super().log_message(format, *args)

    def _token_ok(self) -> bool:
        query = parse_qs(urlsplit(self.path).query)
        if query.get("t", [None])[0] == self.app.token:
            return True
        cookie = self.headers.get("Cookie") or ""
        for part in cookie.split(";"):
            name, sep, value = part.strip().partition("=")
            if sep and name == "p2rln_reader" and value == self.app.token:
                return True
        return False

    def _host_ok(self) -> bool:
        host = (self.headers.get("Host") or "").split(":", 1)[0].strip("[]").lower()
        return host in {"127.0.0.1", "localhost", "::1"}

    def _security_headers(self, *, content_type: str) -> None:
        self.send_header("Content-Type", content_type)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data:; media-src 'self'; "
            "style-src 'self'; script-src 'self'; frame-src 'self'; connect-src 'self'; "
            "object-src 'none'; base-uri 'none'; form-action 'none'",
        )

    def _json(self, status: int, obj: Any) -> None:
        body = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self._security_headers(content_type="application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _bytes(self, status: int, body: bytes, media_type: str, *, sandbox_content: bool = False, set_session_cookie: bool = False) -> None:
        self.send_response(status)
        self._security_headers(content_type=media_type)
        if set_session_cookie:
            self.send_header("Set-Cookie", f"p2rln_reader={self.app.token}; Path=/; HttpOnly; SameSite=Strict")
        if sandbox_content:
            # Native P2RLN reader content is previewed without script execution.
            self.send_header("Content-Security-Policy", "default-src 'self' data:; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _package_etag(self, path: Path) -> tuple[str, str]:
        stat = path.stat()
        etag = f'"p2rln-{stat.st_size:x}-{stat.st_mtime_ns:x}"'
        modified = formatdate(stat.st_mtime, usegmt=True)
        return etag, modified

    def _parse_single_range(self, value: str, size: int) -> tuple[int, int] | None:
        value = value.strip()
        if not value.startswith("bytes=") or "," in value:
            return None
        spec = value[6:].strip()
        start_text, sep, end_text = spec.partition("-")
        if not sep:
            return None
        try:
            if start_text:
                start = int(start_text)
                end = int(end_text) if end_text else size - 1
                if start < 0 or start >= size or end < start:
                    return None
                return start, min(end, size - 1)
            suffix = int(end_text)
            if suffix <= 0:
                return None
            return max(0, size - suffix), size - 1
        except ValueError:
            return None

    def _package_file(self) -> None:
        package = self.app.system.package
        size = package.stat().st_size
        etag, modified = self._package_etag(package)
        range_header = self.headers.get("Range")
        if_range = self.headers.get("If-Range")
        use_range = bool(range_header) and (not if_range or if_range in {etag, modified})
        selected = self._parse_single_range(range_header, size) if use_range and range_header else None
        if use_range and range_header and selected is None:
            self.send_response(416)
            self._security_headers(content_type="application/vnd.p2rln+zip")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.send_header("ETag", etag)
            self.send_header("Last-Modified", modified)
            self.end_headers()
            return

        status = 206 if selected else 200
        start, end = selected if selected else (0, size - 1)
        length = end - start + 1
        self.send_response(status)
        self._security_headers(content_type="application/vnd.p2rln+zip")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("ETag", etag)
        self.send_header("Last-Modified", modified)
        if selected:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(length))
        self.end_headers()
        with package.open("rb") as handle:
            handle.seek(start)
            remaining = length
            while remaining:
                chunk = handle.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def _virtual_etag(self, byte_digest: str) -> str:
        return '"p2rln-' + str(byte_digest).removeprefix("sha256:") + '"'

    def _virtual_outer(self, embedded_path: str) -> None:
        info = self.app.system.virtual_outer_info(embedded_path)
        size = info["size"]
        etag = self._virtual_etag(info["byteDigest"] )
        modified = self._package_etag(self.app.system.package)[1]
        range_header = self.headers.get("Range")
        if_range = self.headers.get("If-Range")
        if not info["seekable"] and size > VIRTUAL_DEFLATED_RANGE_LIMIT:
            raise ReaderError(
                "deflated virtual resource exceeds the safe materialization limit; "
                "rebuild the package with the seekable ZIP storage policy"
            )
        allow_direct_range = True
        use_range = bool(range_header and (not if_range or if_range in {etag, modified}))
        selected = self._parse_single_range(range_header, size) if use_range and range_header else None
        if range_header and use_range and selected is None:
            self.send_response(416)
            self._security_headers(content_type=info["mediaType"])
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.send_header("ETag", etag)
            self.send_header("Last-Modified", modified)
            self.end_headers()
            return

        status = 206 if selected else 200
        start, end = selected if selected else (0, size - 1)
        length = max(0, end - start + 1)
        self.send_response(status)
        self._security_headers(content_type=info["mediaType"])
        if str(info["mediaType"]).split(";", 1)[0].strip().lower() == "text/html":
            self.send_header("Content-Security-Policy", "default-src 'self' data: blob:; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("ETag", etag)
        self.send_header("Last-Modified", modified)
        if selected:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(length))
        self.end_headers()
        if length == 0:
            return

        if info["seekable"]:
            with self.app.system.package.open("rb") as handle:
                handle.seek(info["dataOffset"] + start)
                remaining = length
                while remaining:
                    chunk = handle.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ReaderError(f"truncated stored virtual resource: {embedded_path}")
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
            return

        # Deflated members are not random-seekable. Small assets can still honor
        # a Range request by validating/decompressing the complete member first.
        data, _media = self.app.system.read_outer(embedded_path, max_bytes=VIRTUAL_DEFLATED_RANGE_LIMIT)
        self.wfile.write(data[start:end + 1])

    def do_GET(self) -> None:
        if not self._host_ok():
            self._json(403, {"error": "invalid host"})
            return
        parsed = urlsplit(self.path)
        path = parsed.path
        if path == "/health":
            self._json(200, {"ok": True})
            return
        if not self._token_ok():
            self._json(403, {"error": "invalid reader token"})
            return
        try:
            if path == "/":
                body = (WEB_ROOT / "index.html").read_bytes()
                self._bytes(200, body, "text/html; charset=utf-8", set_session_cookie=True)
                return
            if path == "/package.p2rln":
                self._package_file()
                return
            if path.endswith((".js", ".css")):
                relative = Path(unquote(path.removeprefix("/")))
                candidate = (WEB_ROOT / relative).resolve()
                web_root = WEB_ROOT.resolve()
                if candidate != web_root and web_root in candidate.parents and candidate.is_file():
                    media = "text/javascript; charset=utf-8" if candidate.suffix == ".js" else "text/css; charset=utf-8"
                    self._bytes(200, candidate.read_bytes(), media)
                    return
            if path == "/api/summary":
                self._json(200, self.app.system.summary())
                return
            if path == "/api/tree":
                self._json(200, self.app.system.tree())
                return
            if path == "/api/read-plan":
                self._json(200, self.app.system.read_plan())
                return
            if path == "/api/import-plan":
                self._json(200, self.app.system.import_plan())
                return
            if path == "/api/entity":
                entity_id = parse_qs(parsed.query).get("id", [""])[0]
                self._json(200, self.app.system.entity(entity_id))
                return
            if path == "/api/view":
                entity_id = parse_qs(parsed.query).get("id", [""])[0]
                self._json(200, self.app.system.view_target(entity_id, self.app.token).to_dict())
                return
            if path.startswith("/virtual/outer/"):
                encoded = path.removeprefix("/virtual/outer/")
                self._virtual_outer(_b64u_decode(encoded))
                return
            if path.startswith("/virtual/web/"):
                rest = path.removeprefix("/virtual/web/")
                encoded, sep, logical = rest.partition("/")
                if not sep or not logical:
                    raise ReaderError("missing web-content logical asset path")
                representation_id = _b64u_decode(encoded)
                embedded = self.app.system.resolve_web_asset(representation_id, unquote(logical))
                self._virtual_outer(embedded)
                return
            if path.startswith("/content/outer/"):
                encoded = path.removeprefix("/content/outer/")
                data, media = self.app.system.read_outer(_b64u_decode(encoded))
                self._bytes(200, data, media, sandbox_content=media.startswith("text/html"))
                return
            if path.startswith("/content/package/"):
                rest = path.removeprefix("/content/package/")
                encoded, sep, member = rest.partition("/")
                if not sep:
                    raise ReaderError("missing package member")
                package_path = _b64u_decode(encoded)
                member = unquote(member)
                data, media = self.app.system.read_package_member(package_path, member)
                self._bytes(200, data, media, sandbox_content=media.startswith("text/html"))
                return
            self._json(404, {"error": "not found"})
        except (ReaderError, ReadError, KeyError, ValueError) as exc:
            self._json(400, {"error": str(exc)})


class ReaderServer:
    def __init__(self, system: P2RLNReadingSystem, *, host: str = "127.0.0.1", port: int = 0, verbose: bool = False) -> None:
        self.system = system
        self.host = host
        self.port = port
        self.verbose = verbose
        self.token = secrets.token_urlsafe(24)
        self.httpd: ThreadingHTTPServer | None = None
        self.thread: threading.Thread | None = None

    def start(self) -> str:
        if self.httpd is not None:
            return self.url
        httpd = ThreadingHTTPServer((self.host, self.port), _Handler)
        httpd.reader_server = self  # type: ignore[attr-defined]
        self.httpd = httpd
        self.port = int(httpd.server_address[1])
        self.thread = threading.Thread(target=httpd.serve_forever, name="p2rln-reader", daemon=True)
        self.thread.start()
        return self.url

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}/?t={quote(self.token)}"

    def open_browser(self) -> None:
        webbrowser.open(self.url, new=2)

    def stop(self) -> None:
        if self.httpd is not None:
            self.httpd.shutdown()
            self.httpd.server_close()
            self.httpd = None
        if self.thread is not None:
            self.thread.join(timeout=2)
            self.thread = None

    def serve_forever(self, *, open_browser: bool = True) -> None:
        self.start()
        if open_browser:
            self.open_browser()
        try:
            assert self.thread is not None
            self.thread.join()
        except KeyboardInterrupt:
            pass
        finally:
            self.stop()
