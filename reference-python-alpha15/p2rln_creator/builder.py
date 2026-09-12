from __future__ import annotations

import hashlib
import json
import mimetypes
import uuid
import zipfile
from pathlib import Path, PurePosixPath

from p2rln_ref import validator as v
from p2rln_ref.zip_policy import zipinfo as package_zipinfo, prefers_stored, base_media_type
from p2rln_ref.range_integrity import (
    EXTENSION as RANGE_INTEGRITY_EXTENSION,
    MEDIA_TYPE as RANGE_INTEGRITY_MEDIA_TYPE,
    build_range_integrity_map,
)
from .project import load_project, validate_project, ProjectError

FORMAT_VERSION = "0.4.0"
COURSE_PROFILE = "https://p2rln.org/profile/course"
WEB_CONTENT_PROFILE = "https://p2rln.org/profile/web-content"
WEB_CONTENT_MAPPING_EXTENSION = "https://p2rln.org/extension/web-content-bundle"
RANGE_INTEGRITY_PATH = "integrity/range-integrity.json"


def _uuid_namespace(project_id: str) -> uuid.UUID:
    if project_id.startswith("urn:uuid:"):
        try:
            return uuid.UUID(project_id.split(":", 2)[2])
        except ValueError:
            pass
    return uuid.uuid5(uuid.NAMESPACE_URL, project_id)


def _urn(ns: uuid.UUID, kind: str, key: str) -> str:
    return "urn:uuid:" + str(uuid.uuid5(ns, f"{kind}:{key}"))


def _json_bytes(obj: dict) -> bytes:
    return (json.dumps(obj, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def _desc(path: str, data: bytes, media_type: str) -> dict:
    return {
        "path": path,
        "mediaType": media_type,
        "size": len(data),
        "byteDigest": v.sha256(data),
        "contentDigest": v.content_digest(data, media_type, path),
    }


def _asset_path(data: bytes) -> str:
    h = hashlib.sha256(data).hexdigest()
    return f"assets/sha256/{h[:2]}/{h[2:4]}/{h}"


def _copy_fields(source: dict, target: dict, names: tuple[str, ...]):
    for name in names:
        if name in source:
            target[name] = source[name]


def _resolve_project_file(project_root: Path, rel: str) -> Path:
    if "\\" in rel:
        raise ProjectError(f"backslash not allowed in project source path: {rel}")
    root = project_root.resolve()
    path = (root / rel).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise ProjectError(f"project source escapes workspace: {rel}") from exc
    if not path.is_file():
        raise ProjectError(f"project source file not found: {rel}")
    return path



def _resolve_project_directory(project_root: Path, rel: str) -> Path:
    if "\\" in rel:
        raise ProjectError(f"backslash not allowed in project source path: {rel}")
    root = project_root.resolve()
    path = (root / rel).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise ProjectError(f"project source escapes workspace: {rel}") from exc
    if not path.is_dir():
        raise ProjectError(f"project source directory not found: {rel}")
    return path


def _safe_logical_web_path(path: str) -> str:
    if not path or "\\" in path or path.startswith("/"):
        raise ProjectError(f"unsafe web-content path: {path!r}")
    pure = PurePosixPath(path)
    if any(part in {"", ".", ".."} for part in pure.parts):
        raise ProjectError(f"unsafe web-content path: {path!r}")
    return pure.as_posix()


def _compile_web_directory(
    project_root: Path,
    source: dict,
    *,
    explicit_media_type: str | None,
    payloads: dict[str, bytes],
    payload_media: dict[str, str],
) -> tuple[str, str, dict]:
    root = _resolve_project_directory(project_root, source["path"])
    entrypoint = _safe_logical_web_path(source["entrypoint"])
    logical_to_payload: dict[str, str] = {}
    files = sorted(path for path in root.rglob("*") if path.is_file())
    if len(files) > 5000:
        raise ProjectError("web-content directory contains more than 5000 files")
    for file_path in files:
        if file_path.is_symlink():
            raise ProjectError(f"web-content symbolic links are not allowed: {file_path}")
        resolved = file_path.resolve()
        try:
            relative = resolved.relative_to(root.resolve()).as_posix()
        except ValueError as exc:
            raise ProjectError(f"web-content file escapes source directory: {file_path}") from exc
        logical = _safe_logical_web_path(relative)
        data = file_path.read_bytes()
        media = mimetypes.guess_type(logical)[0] or "application/octet-stream"
        target = _asset_path(data)
        if target in payloads and payload_media[target] != media:
            raise ProjectError(f"same content-addressed web asset declared with conflicting media types: {logical}")
        payloads[target] = data
        payload_media[target] = media
        logical_to_payload[logical] = target
    if entrypoint not in logical_to_payload:
        raise ProjectError(f"web-content entrypoint is not a regular file in the directory: {entrypoint}")
    entry_media = explicit_media_type or mimetypes.guess_type(entrypoint)[0] or "text/html"
    if entry_media.split(";", 1)[0].strip().lower() != "text/html":
        raise ProjectError("web-directory entrypoint must use media type text/html")
    extension = {
        "version": "1",
        "entrypoint": entrypoint,
        "assets": dict(sorted(logical_to_payload.items())),
    }
    return logical_to_payload[entrypoint], entry_media, extension

def compile_project(project_root: Path, project: dict) -> tuple[dict, dict[str, bytes]]:
    validate_project(project)
    if project["targetFormatVersion"] != FORMAT_VERSION:
        raise ProjectError(f"unsupported targetFormatVersion: {project['targetFormatVersion']}")

    ns = _uuid_namespace(project["projectId"])
    key_to_id: dict[str, str] = {}
    key_to_type: dict[str, str] = {}
    key_to_id[project["course"]["key"]] = _urn(ns, "course", project["course"]["key"])
    key_to_type[project["course"]["key"]] = "course"
    for group, kind in (("units", "unit"), ("resources", "resource"), ("activities", "activity"), ("objectives", "objective")):
        for item in project[group]:
            key_to_id[item["key"]] = _urn(ns, kind, item["key"])
            key_to_type[item["key"]] = kind

    payloads: dict[str, bytes] = {}
    payload_media: dict[str, str] = {}
    entities: list[dict] = []
    used_profiles: set[str] = {COURSE_PROFILE}

    c = project["course"]
    course = {
        "id": key_to_id[c["key"]],
        "type": "course",
        "revision": c["revision"],
        "title": c["title"],
        "children": [key_to_id[k] for k in c["children"]],
    }
    _copy_fields(c, course, ("description", "languages", "extensions"))
    entities.append(course)

    for item in project["units"]:
        out = {
            "id": key_to_id[item["key"]],
            "type": "unit",
            "role": item["role"],
            "title": item["title"],
            "children": [key_to_id[k] for k in item["children"]],
        }
        _copy_fields(item, out, ("description", "extensions"))
        entities.append(out)

    for item in project["resources"]:
        out = {"id": key_to_id[item["key"]], "type": "resource", "representations": []}
        _copy_fields(item, out, ("title", "description", "extensions"))
        rep_keys = set()
        for rep in item["representations"]:
            if rep["key"] in rep_keys:
                raise ProjectError(f"duplicate representation key in {item['key']}: {rep['key']}")
            rep_keys.add(rep["key"])
            source = rep["source"]
            media = rep.get("mediaType")
            rout = {
                "id": _urn(ns, "representation", f"{item['key']}:{rep['key']}"),
                "role": rep["role"],
            }
            if source["type"] == "file":
                src = _resolve_project_file(project_root, source["path"])
                data = src.read_bytes()
                media = media or mimetypes.guess_type(src.name)[0] or "application/octet-stream"
                path = _asset_path(data)
                if path in payloads and payload_media[path] != media:
                    raise ProjectError(f"same content-addressed asset declared with conflicting media types: {path}")
                payloads[path] = data
                payload_media[path] = media
                rout["location"] = {"type": "embedded", "path": path}
                rout["originalName"] = rep.get("originalName") or src.name
            elif source["type"] == "web-directory":
                if rep.get("profile") not in {None, WEB_CONTENT_PROFILE}:
                    raise ProjectError("web-directory source requires the web-content profile")
                path, media, web_extension = _compile_web_directory(
                    project_root,
                    source,
                    explicit_media_type=media,
                    payloads=payloads,
                    payload_media=payload_media,
                )
                rout["location"] = {"type": "embedded", "path": path}
                rout["originalName"] = rep.get("originalName") or source["entrypoint"]
                rout["profile"] = WEB_CONTENT_PROFILE
                extensions = dict(rep.get("extensions") or {})
                if WEB_CONTENT_MAPPING_EXTENSION in extensions:
                    raise ProjectError("web-directory source owns the web-content bundle extension")
                extensions[WEB_CONTENT_MAPPING_EXTENSION] = web_extension
                rout["extensions"] = extensions
                used_profiles.add(WEB_CONTENT_PROFILE)
            elif source["type"] == "remote":
                media = media or "application/octet-stream"
                loc = {"type": "remote", "href": source["href"]}
                if source.get("expectedDigest"):
                    loc["expectedDigest"] = source["expectedDigest"]
                rout["location"] = loc
                if rep.get("originalName"):
                    rout["originalName"] = rep["originalName"]
            else:
                raise ProjectError(f"unsupported representation source type: {source['type']}")
            rout["mediaType"] = media
            for name in ("profile", "language", "accessibility", "extensions"):
                if name in rep and not (source["type"] == "web-directory" and name in {"profile", "extensions"}):
                    rout[name] = rep[name]
            if rep.get("profile"):
                used_profiles.add(rep["profile"])
            out["representations"].append(rout)
        entities.append(out)

    for item in project["activities"]:
        out = {
            "id": key_to_id[item["key"]],
            "type": "activity",
            "activityType": item["activityType"],
            "title": item["title"],
        }
        _copy_fields(item, out, ("description", "extensions"))
        if item.get("resource"):
            out["resource"] = key_to_id[item["resource"]]
        if item.get("resources"):
            out["resources"] = [key_to_id[k] for k in item["resources"]]
        if item.get("objectives"):
            out["objectives"] = [key_to_id[k] for k in item["objectives"]]
        if item.get("children"):
            out["children"] = [key_to_id[k] for k in item["children"]]
        for ns_uri in (item.get("extensions") or {}):
            if ns_uri.startswith("https://p2rln.org/profile/"):
                used_profiles.add(ns_uri)
        entities.append(out)

    for item in project["objectives"]:
        out = {"id": key_to_id[item["key"]], "type": "objective", "title": item["title"]}
        _copy_fields(item, out, ("description", "alignments", "extensions"))
        entities.append(out)

    relations = []
    for rel in project["relations"]:
        out = {
            "source": key_to_id[rel["source"]],
            "predicate": rel["predicate"],
            "target": key_to_id[rel["target"]],
        }
        if rel.get("extensions"):
            out["extensions"] = rel["extensions"]
        relations.append(out)

    graph = {
        "graphVersion": FORMAT_VERSION,
        "entities": entities,
        "relations": relations,
        "extensions": {
            "org.p2rln.creator": {
                "projectVersion": project["projectVersion"],
                "projectId": project["projectId"],
            }
        },
    }
    if project.get("provenance"):
        provenance_bytes = _json_bytes(project["provenance"])
        payloads["provenance/transformation.json"] = provenance_bytes
        payload_media["provenance/transformation.json"] = "application/json"
        graph["extensions"]["org.p2rln.creator"]["provenance"] = "provenance/transformation.json"

    # Static-browser seekability requires cryptographic integrity at the range
    # level.  Whole-file SHA-256 cannot authenticate an arbitrary byte range
    # without downloading the entire media object first, so Creator emits a
    # compact per-chunk map for embedded stored audio/video.  This is an
    # optional graph extension: older packages remain valid and simply use the
    # authenticated Blob fallback.
    seekable_paths = [
        path
        for path, media_type in payload_media.items()
        if base_media_type(media_type).startswith(("audio/", "video/"))
        and prefers_stored(media_type)
    ]
    if seekable_paths:
        range_index = build_range_integrity_map(payloads, seekable_paths)
        range_bytes = _json_bytes(range_index)
        payloads[RANGE_INTEGRITY_PATH] = range_bytes
        payload_media[RANGE_INTEGRITY_PATH] = RANGE_INTEGRITY_MEDIA_TYPE
        graph["extensions"][RANGE_INTEGRITY_EXTENSION] = {
            "version": "1",
            "indexPath": RANGE_INTEGRITY_PATH,
        }

    graph_bytes = _json_bytes(graph)
    graph_desc = _desc("content/graph.json", graph_bytes, "application/json")
    graph_desc["schema"] = f"https://p2rln.org/schema/graph/{FORMAT_VERSION}"

    explicit_profiles = {p["id"]: dict(p) for p in project.get("profiles", [])}
    explicit_profiles[COURSE_PROFILE] = {"id": COURSE_PROFILE, "version": FORMAT_VERSION, "requirement": "required"}
    for profile in sorted(used_profiles):
        explicit_profiles.setdefault(profile, {"id": profile, "version": FORMAT_VERSION, "requirement": "optional"})
    profiles = sorted(explicit_profiles.values(), key=lambda p: p["id"])

    file_descs = [_desc(path, payloads[path], payload_media[path]) for path in sorted(payloads)]
    manifest = {
        "format": "P2RLN",
        "formatVersion": FORMAT_VERSION,
        "packageId": "urn:uuid:00000000-0000-4000-8000-000000000000",
        "entrypoints": [{"id": course["id"], "type": "course", "role": "primary"}],
        "graph": graph_desc,
        "profiles": profiles,
        "files": file_descs,
        "integrity": {"algorithm": "sha256", "contentRoot": "sha256:" + "0" * 64},
    }
    manifest["integrity"]["contentRoot"] = v.compute_content_root(manifest)
    # Stable package identity for an identical project build, while remaining outside contentRoot.
    package_seed = manifest["integrity"]["contentRoot"] + f"|revision:{c['revision']}"
    manifest["packageId"] = _urn(ns, "package", package_seed)
    manifest_bytes = _json_bytes(manifest)

    all_payloads = {"META-INF/manifest.json": manifest_bytes, "content/graph.json": graph_bytes, **payloads}
    return manifest, all_payloads


def build_project(project_root: Path, output: Path, *, strict_profiles: bool = False) -> dict:
    project_path, project = load_project(project_root)
    root = project_path.parent
    manifest, payloads = compile_project(root, project)
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    media_by_path = {"META-INF/manifest.json": "application/json", "content/graph.json": "application/json"}
    media_by_path.update({item["path"]: item["mediaType"] for item in manifest["files"]})
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
        for name in sorted(payloads):
            data = payloads[name]
            zf.writestr(package_zipinfo(name, media_by_path.get(name)), data)
    validation = v.validate_package(output, strict_profiles=strict_profiles)
    return {
        "project": str(project_path),
        "output": str(output),
        "formatVersion": manifest["formatVersion"],
        "packageId": manifest["packageId"],
        "contentRoot": manifest["integrity"]["contentRoot"],
        "entities": validation["entities"],
        "files": validation["files"],
        "validation": validation,
    }
