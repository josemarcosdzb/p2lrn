from __future__ import annotations

import json
import os
from pathlib import Path
import stat
import tempfile
import zipfile

from jsonschema import Draft202012Validator, FormatChecker

from .zip_policy import zipinfo as package_zipinfo
from .validator import (
    SCHEMA_DIR,
    ValidationFailure,
    compute_content_root,
    content_digest,
    load_json_bytes,
    safe_zip_name,
    sha256,
    validate_package,
    validate_schema,
    schema as core_schema,
)

DELTA_SCHEMA_ID = "https://p2rln.org/schema/delta/0.1"
DELTA_MANIFEST = "META-INF/delta.json"
TARGET_MANIFEST = "target/META-INF/manifest.json"
TARGET_GRAPH = "target/content/graph.json"


class DeltaError(ValueError):
    pass


def _json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def _zip_write(zf: zipfile.ZipFile, name: str, data: bytes) -> None:
    """Compatibility writer used by the detached-delta container itself.

    Keep this three-argument contract stable because callers/tests may wrap it.
    Target P2RLN payloads use _package_zip_write so their physical compression
    follows the package-wide seekability policy.
    """
    safe_zip_name(name)
    zf.writestr(package_zipinfo(name, None), data)


def _package_zip_write(zf: zipfile.ZipFile, name: str, data: bytes, media_type: str | None) -> None:
    safe_zip_name(name)
    zf.writestr(package_zipinfo(name, media_type), data)


def _temporary_output(output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        prefix=f".{output.name}.",
        suffix=".tmp",
        dir=output.parent,
        delete=False,
    )
    path = Path(handle.name)
    handle.close()
    return path


def _discard(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def _package_manifest(package: Path) -> dict:
    try:
        validate_package(package)
    except ValidationFailure as exc:
        raise DeltaError(f"invalid P2RLN package {package}: {exc}") from exc
    with zipfile.ZipFile(package, "r") as zf:
        return load_json_bytes(zf.read("META-INF/manifest.json"), "manifest")


def _descriptor_map_by_digest(manifest: dict) -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = {}
    for descriptor in manifest["files"]:
        result.setdefault(descriptor["byteDigest"], []).append(descriptor)
    return result


def _validate_delta_document(document: object) -> dict:
    if not isinstance(document, dict):
        raise DeltaError("delta manifest must be a JSON object")
    schema = json.loads((SCHEMA_DIR / "delta.schema.json").read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(document), key=lambda e: list(e.absolute_path))
    if errors:
        lines = []
        for error in errors[:20]:
            path = "/".join(str(v) for v in error.absolute_path) or "$"
            lines.append(f"{path}: {error.message}")
        raise DeltaError("invalid delta manifest:\n" + "\n".join(lines))
    payload_paths = [item["path"] for item in document["payloads"]]
    delta_paths = [item["deltaPath"] for item in document["payloads"]]
    if len(payload_paths) != len(set(payload_paths)):
        raise DeltaError("delta manifest declares the same target payload path more than once")
    if len(delta_paths) != len(set(delta_paths)):
        raise DeltaError("delta manifest declares the same delta payload path more than once")
    for item in document["payloads"]:
        safe_zip_name(item["path"])
        safe_zip_name(item["deltaPath"])
        expected = f"payloads/{item['path']}"
        if item["deltaPath"] != expected:
            raise DeltaError(f"deltaPath must be the canonical payloads/<target-path> form: {item['deltaPath']}")
    return dict(document)


def create_delta(base: Path, target: Path, output: Path, *, force: bool = False) -> dict:
    base = Path(base)
    target = Path(target)
    output = Path(output)
    base_manifest = _package_manifest(base)
    target_manifest = _package_manifest(target)
    if base_manifest["formatVersion"] != target_manifest["formatVersion"]:
        raise DeltaError("base and target formatVersion differ; cross-format deltas are not supported")
    if output.exists() and not force:
        raise DeltaError(f"refusing to overwrite existing delta: {output}")

    base_by_digest = _descriptor_map_by_digest(base_manifest)
    changed: list[dict] = []
    with zipfile.ZipFile(target, "r") as target_zip:
        target_manifest_bytes = target_zip.read("META-INF/manifest.json")
        target_graph_bytes = target_zip.read(target_manifest["graph"]["path"])
        for descriptor in target_manifest["files"]:
            reusable = any(
                candidate["size"] == descriptor["size"]
                for candidate in base_by_digest.get(descriptor["byteDigest"], [])
            )
            if reusable:
                continue
            changed.append({
                "path": descriptor["path"],
                "deltaPath": f"payloads/{descriptor['path']}",
                "byteDigest": descriptor["byteDigest"],
                "size": descriptor["size"],
            })

        document = {
            "schema": DELTA_SCHEMA_ID,
            "version": "0.1",
            "base": {
                "formatVersion": base_manifest["formatVersion"],
                "contentRoot": base_manifest["integrity"]["contentRoot"],
            },
            "target": {
                "formatVersion": target_manifest["formatVersion"],
                "packageId": target_manifest["packageId"],
                "contentRoot": target_manifest["integrity"]["contentRoot"],
                "manifestByteDigest": sha256(target_manifest_bytes),
                "graphByteDigest": sha256(target_graph_bytes),
            },
            "payloads": changed,
        }
        _validate_delta_document(document)
        temporary = _temporary_output(output)
        try:
            with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as delta_zip:
                _zip_write(delta_zip, DELTA_MANIFEST, _json_bytes(document))
                _zip_write(delta_zip, TARGET_MANIFEST, target_manifest_bytes)
                _zip_write(delta_zip, TARGET_GRAPH, target_graph_bytes)
                for item in changed:
                    _zip_write(delta_zip, item["deltaPath"], target_zip.read(item["path"]))
            # Re-open the completed sidecar before publishing it so callers never
            # observe a partially written delta.
            verified_zip, _ = _open_delta(temporary)
            verified_zip.close()
            os.replace(temporary, output)
        except Exception:
            _discard(temporary)
            raise

    return {
        "output": str(output),
        "baseContentRoot": document["base"]["contentRoot"],
        "targetContentRoot": document["target"]["contentRoot"],
        "changedPayloads": len(changed),
        "reusedPayloads": len(target_manifest["files"]) - len(changed),
        "deltaBytes": output.stat().st_size,
        "targetBytes": target.stat().st_size,
        "ratio": (output.stat().st_size / target.stat().st_size) if target.stat().st_size else 0.0,
    }


def _open_delta(path: Path):
    if not zipfile.is_zipfile(path):
        raise DeltaError("delta is not a ZIP/ZIP64 container")
    zf = zipfile.ZipFile(path, "r")
    infos = zf.infolist()
    if len(infos) > 5000:
        zf.close()
        raise DeltaError("delta ZIP has more than 5000 entries")
    seen = set()
    for info in infos:
        name = info.filename.rstrip("/")
        if not name:
            continue
        try:
            safe_zip_name(name)
        except ValidationFailure as exc:
            zf.close()
            raise DeltaError(str(exc)) from exc
        if info.filename in seen:
            zf.close()
            raise DeltaError(f"duplicate delta ZIP entry: {info.filename}")
        seen.add(info.filename)
        if info.flag_bits & 0x1:
            zf.close()
            raise DeltaError(f"encrypted delta ZIP entry: {info.filename}")
        if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            zf.close()
            raise DeltaError(f"unsupported delta compression method: {info.filename}")
        unix_mode = (info.external_attr >> 16) & 0xFFFF
        if unix_mode and stat.S_ISLNK(unix_mode):
            zf.close()
            raise DeltaError(f"symbolic link in delta: {info.filename}")
        if info.file_size > 0 and info.compress_size > 0 and info.file_size / info.compress_size > 250:
            zf.close()
            raise DeltaError(f"delta ZIP compression ratio exceeds 250: {info.filename}")
    names = {info.filename for info in infos if not info.is_dir()}
    for required in (DELTA_MANIFEST, TARGET_MANIFEST, TARGET_GRAPH):
        if required not in names:
            zf.close()
            raise DeltaError(f"delta is missing required entry: {required}")
    try:
        document = _validate_delta_document(load_json_bytes(zf.read(DELTA_MANIFEST), "delta manifest"))
    except (ValidationFailure, DeltaError) as exc:
        zf.close()
        raise DeltaError(str(exc)) from exc
    expected = {DELTA_MANIFEST, TARGET_MANIFEST, TARGET_GRAPH, *(item["deltaPath"] for item in document["payloads"])}
    extra = names - expected
    missing = expected - names
    if extra:
        zf.close()
        raise DeltaError("uninventoried delta payload: " + ", ".join(sorted(extra)))
    if missing:
        zf.close()
        raise DeltaError("delta declares missing payload: " + ", ".join(sorted(missing)))
    return zf, document


def inspect_delta(path: Path) -> dict:
    zf, document = _open_delta(Path(path))
    try:
        return document
    finally:
        zf.close()


def apply_delta(base: Path, delta: Path, output: Path, *, force: bool = False) -> dict:
    base = Path(base)
    delta = Path(delta)
    output = Path(output)
    base_manifest = _package_manifest(base)
    delta_zip, document = _open_delta(delta)
    try:
        if document["base"]["formatVersion"] != base_manifest["formatVersion"]:
            raise DeltaError("delta base formatVersion does not match base package")
        if document["base"]["contentRoot"] != base_manifest["integrity"]["contentRoot"]:
            raise DeltaError("delta base contentRoot does not match base package")
        target_manifest_bytes = delta_zip.read(TARGET_MANIFEST)
        target_graph_bytes = delta_zip.read(TARGET_GRAPH)
        if sha256(target_manifest_bytes) != document["target"]["manifestByteDigest"]:
            raise DeltaError("target manifest byte digest mismatch inside delta")
        if sha256(target_graph_bytes) != document["target"]["graphByteDigest"]:
            raise DeltaError("target graph byte digest mismatch inside delta")
        try:
            target_manifest = load_json_bytes(target_manifest_bytes, "target manifest")
            validate_schema(target_manifest, core_schema("manifest.schema.json"), "target manifest")
        except ValidationFailure as exc:
            raise DeltaError(str(exc)) from exc
        if target_manifest["formatVersion"] != document["target"]["formatVersion"]:
            raise DeltaError("target manifest formatVersion mismatch inside delta")
        if target_manifest["packageId"] != document["target"]["packageId"]:
            raise DeltaError("target packageId mismatch inside delta")
        if target_manifest["integrity"]["contentRoot"] != document["target"]["contentRoot"]:
            raise DeltaError("target contentRoot mismatch inside delta")
        if compute_content_root(target_manifest) != document["target"]["contentRoot"]:
            raise DeltaError("target manifest does not recompute to declared contentRoot")
        graph_descriptor = target_manifest["graph"]
        if graph_descriptor["path"] != "content/graph.json":
            raise DeltaError("delta target graph path is not Core 0.4.0 content/graph.json")
        if len(target_graph_bytes) != graph_descriptor["size"] or sha256(target_graph_bytes) != graph_descriptor["byteDigest"]:
            raise DeltaError("target graph does not match its manifest descriptor")
        if content_digest(target_graph_bytes, graph_descriptor["mediaType"], graph_descriptor["path"]) != graph_descriptor["contentDigest"]:
            raise DeltaError("target graph contentDigest mismatch")

        changed = {item["path"]: item for item in document["payloads"]}
        target_desc = {item["path"]: item for item in target_manifest["files"]}
        unknown_changed = set(changed) - set(target_desc)
        if unknown_changed:
            raise DeltaError("delta includes payloads not declared by target manifest: " + ", ".join(sorted(unknown_changed)))

        base_by_digest = _descriptor_map_by_digest(base_manifest)
        if output.exists() and not force:
            raise DeltaError(f"refusing to overwrite existing package: {output}")
        temporary = _temporary_output(output)
        try:
            with zipfile.ZipFile(base, "r") as base_zip, zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as out_zip:
                _zip_write(out_zip, "META-INF/manifest.json", target_manifest_bytes)
                _zip_write(out_zip, "content/graph.json", target_graph_bytes)
                for descriptor in sorted(target_manifest["files"], key=lambda item: item["path"]):
                    item = changed.get(descriptor["path"])
                    if item is not None:
                        data = delta_zip.read(item["deltaPath"])
                        if item["byteDigest"] != descriptor["byteDigest"] or item["size"] != descriptor["size"]:
                            raise DeltaError(f"delta payload metadata disagrees with target descriptor: {descriptor['path']}")
                    else:
                        candidates = [candidate for candidate in base_by_digest.get(descriptor["byteDigest"], []) if candidate["size"] == descriptor["size"]]
                        if not candidates:
                            raise DeltaError(f"target payload is absent from delta and cannot be reused from base: {descriptor['path']}")
                        data = base_zip.read(candidates[0]["path"])
                    if len(data) != descriptor["size"] or sha256(data) != descriptor["byteDigest"]:
                        raise DeltaError(f"reconstructed payload byte mismatch: {descriptor['path']}")
                    if content_digest(data, descriptor["mediaType"], descriptor["path"]) != descriptor["contentDigest"]:
                        raise DeltaError(f"reconstructed payload contentDigest mismatch: {descriptor['path']}")
                    _package_zip_write(out_zip, descriptor["path"], data, descriptor["mediaType"])

            try:
                validation = validate_package(temporary)
            except ValidationFailure as exc:
                raise DeltaError(f"reconstructed target package is invalid: {exc}") from exc
            if validation["contentRoot"] != document["target"]["contentRoot"]:
                raise DeltaError("reconstructed package contentRoot does not match delta target")
            os.replace(temporary, output)
        except Exception:
            _discard(temporary)
            raise
        return {
            "output": str(output),
            "packageId": validation["packageId"],
            "contentRoot": validation["contentRoot"],
            "changedPayloads": len(changed),
            "reusedPayloads": len(target_manifest["files"]) - len(changed),
        }
    finally:
        delta_zip.close()
