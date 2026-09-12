#!/usr/bin/env python3
"""Reference validator for the P2RLN 0.4.0 implementation draft."""
from __future__ import annotations

import hashlib
import io
import json
import math
import os
from pathlib import Path, PurePosixPath
import zipfile
import stat
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET

from jsonschema import Draft202012Validator, FormatChecker

SCHEMA_DIR = Path(__file__).resolve().parent / "schemas"

from .jcs import canonicalize_bytes
from .native_composite import (
    ACTIVITY_TYPE as NATIVE_COMPOSITE_ACTIVITY_TYPE,
    MEDIA_TYPE as NATIVE_COMPOSITE_MEDIA_TYPE,
    PROFILE as NATIVE_COMPOSITE_PROFILE,
    NativeCompositeError,
    validate_composite,
)
from .native_component import (
    ACTIVITY_TYPE as NATIVE_COMPONENT_ACTIVITY_TYPE,
    MEDIA_TYPE as NATIVE_COMPONENT_MEDIA_TYPE,
    PROFILE as NATIVE_COMPONENT_PROFILE,
    NativeComponentError,
    validate_component_instance,
)
from .web_content import PROFILE as WEB_CONTENT_PROFILE, WebContentError, validate_web_content_mapping
from .range_integrity import (
    EXTENSION as RANGE_INTEGRITY_EXTENSION,
    MEDIA_TYPE as RANGE_INTEGRITY_MEDIA_TYPE,
    RangeIntegrityError,
    validate_range_integrity_map,
)
from .native_questionnaire import (
    MEDIA_TYPE as NATIVE_QUESTIONNAIRE_MEDIA_TYPE,
    PROFILE as NATIVE_QUESTIONNAIRE_PROFILE,
    NativeQuestionnaireError,
    validate_questionnaire,
)
KNOWN_PROFILE_VERSIONS = {
    "https://p2rln.org/profile/course": {"0.4.0"},
    "https://p2rln.org/profile/web-content": {"0.4.0"},
    "https://p2rln.org/profile/qti": {"0.4.0"},
    "https://p2rln.org/profile/h5p": {"0.4.0"},
    "https://p2rln.org/profile/scorm": {"0.4.0"},
    "https://p2rln.org/profile/cmi5": {"0.4.0"},
    "https://p2rln.org/profile/common-cartridge": {"0.4.0"},
    "https://p2rln.org/profile/tincan-package": {"0.4.0"},
    "https://p2rln.org/profile/lti": {"0.4.0"},
    "https://p2rln.org/profile/case": {"0.4.0"},
    "https://p2rln.org/profile/xapi": {"0.4.0"},
    "https://p2rln.org/profile/accessibility": {"0.4.0"},
    NATIVE_QUESTIONNAIRE_PROFILE: {"0.4.0"},
    NATIVE_COMPOSITE_PROFILE: {"0.4.0"},
    NATIVE_COMPONENT_PROFILE: {"0.4.0"},
}
KNOWN_PROFILES = set(KNOWN_PROFILE_VERSIONS)
SAFE_INT = 2**53 - 1
RENDERER_HINT_EXTENSION = "https://p2rln.org/ext/renderer-preference/1"


class ValidationFailure(Exception):
    pass


def sha256(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def no_duplicates(pairs):
    out = {}
    for k, v in pairs:
        if k in out:
            raise ValidationFailure(f"duplicate JSON member name: {k!r}")
        out[k] = v
    return out


def load_json_bytes(data: bytes, label: str):
    try:
        text = data.decode("utf-8", "strict")
    except UnicodeDecodeError as exc:
        raise ValidationFailure(f"{label}: not valid UTF-8: {exc}") from exc
    try:
        obj = json.loads(text, object_pairs_hook=no_duplicates)
    except (json.JSONDecodeError, ValidationFailure) as exc:
        raise ValidationFailure(f"{label}: invalid JSON/I-JSON: {exc}") from exc
    validate_ijson_value(obj, label)
    return obj


def validate_ijson_value(value, label: str):
    if isinstance(value, str):
        if any(0xD800 <= ord(ch) <= 0xDFFF for ch in value):
            raise ValidationFailure(f"{label}: unpaired Unicode surrogate is not allowed")
    elif isinstance(value, bool) or value is None:
        return
    elif isinstance(value, int):
        if abs(value) > SAFE_INT:
            raise ValidationFailure(f"{label}: integer outside interoperable IEEE-754 safe range: {value}")
    elif isinstance(value, float):
        if not math.isfinite(value):
            raise ValidationFailure(f"{label}: non-finite number")
    elif isinstance(value, list):
        for item in value:
            validate_ijson_value(item, label)
    elif isinstance(value, dict):
        for key, item in value.items():
            validate_ijson_value(key, label)
            validate_ijson_value(item, label)


def jcs_bytes(obj) -> bytes:
    return canonicalize_bytes(obj)


def content_digest(data: bytes, media_type: str, label: str) -> str:
    base = media_type.split(";", 1)[0].strip().lower()
    if base == "application/json" or base.endswith("+json"):
        obj = load_json_bytes(data, label)
        return sha256(jcs_bytes(obj))
    return sha256(data)


def schema(name: str):
    return json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))


def validate_schema(instance, schema_obj, label: str):
    validator = Draft202012Validator(schema_obj, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.absolute_path))
    if errors:
        formatted = []
        for e in errors[:20]:
            path = "/".join(str(p) for p in e.absolute_path) or "$"
            formatted.append(f"{label} {path}: {e.message}")
        raise ValidationFailure("\n".join(formatted))


def safe_zip_name(name: str):
    if not name or "\x00" in name or "\\" in name or name.startswith("/"):
        raise ValidationFailure(f"unsafe ZIP path: {name!r}")
    p = PurePosixPath(name)
    if any(part in ("", ".", "..") for part in p.parts):
        raise ValidationFailure(f"unsafe ZIP path component: {name!r}")
    if p.parts and len(p.parts[0]) >= 2 and p.parts[0][1] == ":":
        raise ValidationFailure(f"Windows drive path not allowed: {name!r}")
    if len(p.parts) > 32:
        raise ValidationFailure(f"ZIP path exceeds maximum depth: {name!r}")


def normalize_integrity_input(manifest):
    entrypoints = [
        {"id": e["id"], "type": e["type"], "role": e["role"]}
        for e in manifest["entrypoints"]
    ]
    entrypoints.sort(key=lambda e: (e["role"], e["type"], e["id"]))

    profiles = [
        {"id": p["id"], "version": p["version"], "requirement": p["requirement"]}
        for p in manifest["profiles"]
    ]
    profiles.sort(key=lambda p: (p["id"], p["version"], p["requirement"]))

    files = [
        {"path": f["path"], "mediaType": f["mediaType"], "contentDigest": f["contentDigest"]}
        for f in manifest["files"]
    ]
    files.sort(key=lambda f: f["path"])

    g = manifest["graph"]
    return {
        "format": manifest["format"],
        "formatVersion": manifest["formatVersion"],
        "entrypoints": entrypoints,
        "graph": {
            "schema": g["schema"],
            "mediaType": g["mediaType"],
            "contentDigest": g["contentDigest"],
        },
        "profiles": profiles,
        "files": files,
    }


def compute_content_root(manifest):
    return sha256(jcs_bytes(normalize_integrity_input(manifest)))


def validate_graph_semantics(graph, manifest):
    entities = graph["entities"]
    ids = {}
    for entity in entities:
        eid = entity["id"]
        if eid in ids:
            raise ValidationFailure(f"duplicate entity id: {eid}")
        ids[eid] = entity

    def must_resolve(ref: str, context: str, allowed=None):
        target = ids.get(ref)
        if target is None:
            raise ValidationFailure(f"broken reference {context}: {ref}")
        if allowed and target["type"] not in allowed:
            raise ValidationFailure(f"type mismatch {context}: {ref} is {target['type']}, expected {sorted(allowed)}")

    global_ids = set(ids)
    for entity in entities:
        if entity["type"] == "resource":
            for rep in entity["representations"]:
                rid = rep["id"]
                if rid in global_ids:
                    raise ValidationFailure(f"duplicate portable id across graph: {rid}")
                global_ids.add(rid)

    for entity in entities:
        for child in entity.get("children", []):
            must_resolve(child, f"{entity['id']}.children")
        if "resource" in entity:
            must_resolve(entity["resource"], f"{entity['id']}.resource", {"resource"})
        for ref in entity.get("resources", []):
            must_resolve(ref, f"{entity['id']}.resources", {"resource"})
        for ref in entity.get("objectives", []):
            must_resolve(ref, f"{entity['id']}.objectives", {"objective"})

    for rel in graph["relations"]:
        must_resolve(rel["source"], "relation.source")
        must_resolve(rel["target"], "relation.target")

    for entry in manifest["entrypoints"]:
        must_resolve(entry["id"], "manifest.entrypoint", {entry["type"]})

    # children cycle detection
    state = {}
    def dfs(eid, trail):
        s = state.get(eid, 0)
        if s == 1:
            raise ValidationFailure("children cycle: " + " -> ".join(trail + [eid]))
        if s == 2:
            return
        state[eid] = 1
        for child in ids[eid].get("children", []):
            dfs(child, trail + [eid])
        state[eid] = 2
    for eid in ids:
        dfs(eid, [])

    # embedded representation paths must be inventoried; representation profiles must be declared.
    inventory = {manifest["graph"]["path"], *(f["path"] for f in manifest["files"])}
    declared_profiles = {p["id"] for p in manifest["profiles"]}

    renderer_preference_schema = schema("renderer-preference.schema.json")
    range_integrity_extension_schema = schema("range-integrity-extension.schema.json")

    graph_extensions = graph.get("extensions") or {}
    if RANGE_INTEGRITY_EXTENSION in graph_extensions:
        value = graph_extensions[RANGE_INTEGRITY_EXTENSION]
        validate_schema(value, range_integrity_extension_schema, "range-integrity extension")
        index_path = value["indexPath"]
        if index_path not in inventory:
            raise ValidationFailure(f"range-integrity index is not inventoried: {index_path}")

    def check_known_extensions(ext, context, *, holder_type: str):
        for namespace, value in (ext or {}).items():
            if namespace.startswith("https://p2rln.org/profile/") and namespace not in declared_profiles:
                raise ValidationFailure(f"profile extension not declared in manifest at {context}: {namespace}")
            if namespace == RENDERER_HINT_EXTENSION:
                if holder_type != "activity":
                    raise ValidationFailure(
                        f"renderer preference extension is only valid on activities: {context}"
                    )
                validate_schema(
                    value,
                    renderer_preference_schema,
                    f"renderer preference at {context}",
                )

    for entity in entities:
        check_known_extensions(
            entity.get("extensions"),
            entity["id"],
            holder_type=entity["type"],
        )
        if entity["type"] == "resource":
            for rep in entity.get("representations", []):
                check_known_extensions(
                    rep.get("extensions"),
                    rep["id"],
                    holder_type="representation",
                )
    for idx, rel in enumerate(graph.get("relations", [])):
        check_known_extensions(
            rel.get("extensions"),
            f"relation[{idx}]",
            holder_type="relation",
        )

    # Native composite activities reuse Core children as the single source of
    # identity/order and must point at one native-composite configuration resource.
    for entity in entities:
        if entity.get("type") != "activity" or entity.get("activityType") != NATIVE_COMPOSITE_ACTIVITY_TYPE:
            continue
        children = entity.get("children") or []
        if not children:
            raise ValidationFailure(f"native composite activity has no children: {entity['id']}")
        for child_id in children:
            child = ids.get(child_id)
            if child is None or child.get("type") != "activity":
                raise ValidationFailure(
                    f"native composite child must resolve to an activity: {entity['id']} -> {child_id}"
                )
        resource_id = entity.get("resource")
        if not resource_id:
            raise ValidationFailure(f"native composite activity has no configuration resource: {entity['id']}")
        resource = ids.get(resource_id)
        reps = [] if not isinstance(resource, dict) else resource.get("representations", [])
        valid_reps = [
            rep
            for rep in reps
            if rep.get("profile") == NATIVE_COMPOSITE_PROFILE
            and rep.get("mediaType", "").split(";", 1)[0].strip().lower() == NATIVE_COMPOSITE_MEDIA_TYPE
            and (rep.get("location") or {}).get("type") == "embedded"
        ]
        if not valid_reps:
            raise ValidationFailure(
                f"native composite activity resource has no embedded {NATIVE_COMPOSITE_PROFILE} representation with media type {NATIVE_COMPOSITE_MEDIA_TYPE}: {entity['id']}"
            )

    # Native component Activities are data-only instances.  Their executable
    # implementation is intentionally outside the package, so the graph must
    # point at one embedded declarative component payload with the exact profile
    # and media type.  This prevents an arbitrary HTML/JS representation from
    # masquerading as a native component.
    for entity in entities:
        if entity.get("type") != "activity" or entity.get("activityType") != NATIVE_COMPONENT_ACTIVITY_TYPE:
            continue
        resource_id = entity.get("resource")
        if not resource_id:
            raise ValidationFailure(f"native component activity has no component resource: {entity['id']}")
        resource = ids.get(resource_id)
        reps = [] if not isinstance(resource, dict) else resource.get("representations", [])
        valid_reps = [
            rep
            for rep in reps
            if rep.get("profile") == NATIVE_COMPONENT_PROFILE
            and rep.get("mediaType", "").split(";", 1)[0].strip().lower() == NATIVE_COMPONENT_MEDIA_TYPE
            and (rep.get("location") or {}).get("type") == "embedded"
        ]
        if not valid_reps:
            raise ValidationFailure(
                f"native component activity resource has no embedded {NATIVE_COMPONENT_PROFILE} representation with media type {NATIVE_COMPONENT_MEDIA_TYPE}: {entity['id']}"
            )

    for entity in entities:
        if entity["type"] == "resource":
            rep_ids = set()
            for rep in entity["representations"]:
                rep_profile = rep.get("profile")
                if rep_profile and rep_profile not in declared_profiles:
                    raise ValidationFailure(f"representation profile not declared in manifest: {rep_profile}")
                if rep["id"] in rep_ids:
                    raise ValidationFailure(f"duplicate representation id in {entity['id']}: {rep['id']}")
                rep_ids.add(rep["id"])
                loc = rep["location"]
                if loc["type"] == "embedded" and loc["path"] not in inventory:
                    raise ValidationFailure(f"embedded representation not inventoried: {loc['path']}")
                if loc["type"] == "package-member":
                    if loc["package"] not in inventory:
                        raise ValidationFailure(f"package-member package not inventoried: {loc['package']}")
                    if not loc["package"].startswith("packages/sha256/"):
                        raise ValidationFailure(f"package-member must reference packages/sha256 payload: {loc['package']}")
                    safe_zip_name(loc["member"])

    # Course profile rules
    if any(p["id"] == "https://p2rln.org/profile/course" for p in manifest["profiles"]):
        primaries = [e for e in manifest["entrypoints"] if e["type"] == "course" and e["role"] == "primary"]
        if len(primaries) != 1:
            raise ValidationFailure("Course Profile requires exactly one primary course entrypoint")




def validate_range_integrity_payload(graph, manifest, zf: zipfile.ZipFile):
    extension = (graph.get("extensions") or {}).get(RANGE_INTEGRITY_EXTENSION)
    if not extension:
        return
    index_path = extension["indexPath"]
    descriptor = next((item for item in manifest["files"] if item["path"] == index_path), None)
    if descriptor is None:
        raise ValidationFailure("range-integrity index is not declared in manifest files")
    if descriptor["mediaType"].split(";", 1)[0].strip().lower() != RANGE_INTEGRITY_MEDIA_TYPE:
        raise ValidationFailure("range-integrity index has the wrong media type")
    index_obj = load_json_bytes(zf.read(index_path), "range-integrity map")
    validate_schema(index_obj, schema("range-integrity-map.schema.json"), "range-integrity map")
    inventory = {manifest["graph"]["path"], *(item["path"] for item in manifest["files"])}
    try:
        validate_range_integrity_map(index_obj, inventory=inventory)
    except RangeIntegrityError as exc:
        raise ValidationFailure(str(exc)) from exc
    descriptors = {item["path"]: item for item in manifest["files"]}
    chunk_size = index_obj["chunkSize"]
    for path, entry in index_obj["entries"].items():
        desc = descriptors.get(path)
        if desc is None:
            raise ValidationFailure(f"range-integrity target is not a manifest file: {path}")
        if desc["size"] != entry["size"] or desc["byteDigest"] != entry["byteDigest"]:
            raise ValidationFailure(f"range-integrity target metadata mismatch: {path}")
        info = zf.getinfo(path)
        if info.compress_type != zipfile.ZIP_STORED:
            raise ValidationFailure(f"range-integrity target must be ZIP_STORED: {path}")
        with zf.open(path, "r") as source:
            chunks = []
            while True:
                data = source.read(chunk_size)
                if not data:
                    break
                chunks.append(sha256(data))
        if chunks != entry["chunks"]:
            raise ValidationFailure(f"range-integrity chunk digest mismatch: {path}")


def validate_package_member_locations(graph, zf: zipfile.ZipFile):
    """Verify package-member locations without extraction or code execution."""
    by_package = {}
    for entity in graph["entities"]:
        if entity["type"] != "resource":
            continue
        for rep in entity.get("representations", []):
            loc = rep.get("location", {})
            if loc.get("type") == "package-member":
                by_package.setdefault(loc["package"], set()).add(loc["member"])

    for package_path, members in by_package.items():
        data = zf.read(package_path)
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as nested:
                nested_infos = nested.infolist()
                if len(nested_infos) > 20000:
                    raise ValidationFailure(f"nested package has more than 20000 entries: {package_path}")
                names = set()
                for info in nested_infos:
                    if info.is_dir():
                        continue
                    safe_zip_name(info.filename)
                    if info.filename in names:
                        raise ValidationFailure(f"duplicate nested package path {info.filename}: {package_path}")
                    names.add(info.filename)
                    if info.flag_bits & 0x1:
                        raise ValidationFailure(f"encrypted nested member {info.filename}: {package_path}")
                for member in members:
                    if member not in names:
                        raise ValidationFailure(f"package-member target missing: {package_path}#{member}")
        except zipfile.BadZipFile as exc:
            raise ValidationFailure(f"package-member payload is not ZIP: {package_path}") from exc


def _local_xml(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _validate_nested_zip_bytes(data: bytes, label: str):
    if not zipfile.is_zipfile(__import__("io").BytesIO(data)):
        raise ValidationFailure(f"{label}: profile payload is not a ZIP package")
    import io
    with zipfile.ZipFile(io.BytesIO(data), "r") as nested:
        infos = nested.infolist()
        if len(infos) > 20000:
            raise ValidationFailure(f"{label}: nested package has more than 20000 entries")
        seen = set()
        for info in infos:
            name = info.filename.rstrip("/")
            if not name:
                continue
            safe_zip_name(name)
            if info.filename in seen:
                raise ValidationFailure(f"{label}: duplicate nested ZIP entry: {info.filename}")
            seen.add(info.filename)
            if info.flag_bits & 0x1:
                raise ValidationFailure(f"{label}: encrypted nested ZIP entry: {info.filename}")
            unix_mode = (info.external_attr >> 16) & 0xFFFF
            if unix_mode and stat.S_ISLNK(unix_mode):
                raise ValidationFailure(f"{label}: symbolic link in nested package: {info.filename}")
            if info.file_size > 0 and info.compress_size > 0 and info.file_size / info.compress_size > 500:
                raise ValidationFailure(f"{label}: nested ZIP compression ratio exceeds 500: {info.filename}")
        files = {i.filename: nested.read(i.filename) for i in infos if not i.is_dir()}
    return files


def _relative_launch_exists(files: dict[str, bytes], href: str, label: str):
    if not href:
        return
    split = urlsplit(href.strip())
    if split.scheme or split.netloc:
        return  # remote references are not dereferenced during validation
    path = split.path.lstrip("/")
    if not path:
        return
    if path not in files:
        raise ValidationFailure(f"{label}: relative launch target missing from preserved package: {path}")


def validate_profile_payloads(graph, manifest, zf: zipfile.ZipFile):
    """Validate preserved external package structure for profiles implemented by the reference tool.

    This is stronger than Core validation and intentionally does not execute or fetch anything.
    """
    checked = set()
    for entity in graph["entities"]:
        if entity["type"] != "resource":
            continue
        for rep in entity["representations"]:
            profile = rep.get("profile")
            loc = rep.get("location", {})
            if profile == WEB_CONTENT_PROFILE:
                try:
                    validate_web_content_mapping(rep, set(zf.namelist()))
                except WebContentError as exc:
                    raise ValidationFailure(f"web-content representation {rep.get('id')}: {exc}") from exc
            if profile == NATIVE_COMPOSITE_PROFILE:
                if loc.get("type") != "embedded":
                    raise ValidationFailure("native composite profile requires an embedded JSON representation")
                if rep.get("mediaType", "").split(";", 1)[0].strip().lower() != NATIVE_COMPOSITE_MEDIA_TYPE:
                    raise ValidationFailure(
                        f"native composite media type must be {NATIVE_COMPOSITE_MEDIA_TYPE}: {rep.get('mediaType')}"
                    )
                path = loc["path"]
                key = (profile, path)
                if key not in checked:
                    checked.add(key)
                    payload = load_json_bytes(zf.read(path), f"native composite {path}")
                    try:
                        validate_composite(payload)
                    except NativeCompositeError as exc:
                        raise ValidationFailure(f"native composite {path}: {exc}") from exc
                continue
            if profile == NATIVE_COMPONENT_PROFILE:
                if loc.get("type") != "embedded":
                    raise ValidationFailure("native component profile requires an embedded JSON representation")
                if rep.get("mediaType", "").split(";", 1)[0].strip().lower() != NATIVE_COMPONENT_MEDIA_TYPE:
                    raise ValidationFailure(
                        f"native component media type must be {NATIVE_COMPONENT_MEDIA_TYPE}: {rep.get('mediaType')}"
                    )
                path = loc["path"]
                key = (profile, path)
                if key not in checked:
                    checked.add(key)
                    payload = load_json_bytes(zf.read(path), f"native component {path}")
                    try:
                        validate_component_instance(payload)
                    except NativeComponentError as exc:
                        raise ValidationFailure(f"native component {path}: {exc}") from exc
                continue
            if profile == NATIVE_QUESTIONNAIRE_PROFILE:
                if loc.get("type") != "embedded":
                    raise ValidationFailure("native questionnaire profile requires an embedded JSON representation")
                if rep.get("mediaType", "").split(";", 1)[0].strip().lower() != NATIVE_QUESTIONNAIRE_MEDIA_TYPE:
                    raise ValidationFailure(
                        f"native questionnaire media type must be {NATIVE_QUESTIONNAIRE_MEDIA_TYPE}: {rep.get('mediaType')}"
                    )
                path = loc["path"]
                key = (profile, path)
                if key not in checked:
                    checked.add(key)
                    payload = load_json_bytes(zf.read(path), f"native questionnaire {path}")
                    try:
                        validate_questionnaire(payload)
                    except NativeQuestionnaireError as exc:
                        raise ValidationFailure(f"native questionnaire {path}: {exc}") from exc
                continue
            if profile not in {
                "https://p2rln.org/profile/h5p",
                "https://p2rln.org/profile/scorm",
                "https://p2rln.org/profile/cmi5",
                "https://p2rln.org/profile/common-cartridge",
                "https://p2rln.org/profile/qti",
                "https://p2rln.org/profile/tincan-package",
            } or loc.get("type") != "embedded":
                continue
            path = loc["path"]
            key = (profile, path)
            if key in checked:
                continue
            checked.add(key)
            files = _validate_nested_zip_bytes(zf.read(path), f"{profile} {path}")
            names = set(files)
            if profile == "https://p2rln.org/profile/h5p":
                if "h5p.json" not in names or "content/content.json" not in names:
                    raise ValidationFailure("H5P profile payload requires h5p.json and content/content.json")
                h5p = load_json_bytes(files["h5p.json"], "nested h5p.json")
                content = load_json_bytes(files["content/content.json"], "nested H5P content/content.json")
                if not isinstance(h5p, dict) or not isinstance(content, dict):
                    raise ValidationFailure("H5P h5p.json and content/content.json must be JSON objects")
                main_library = h5p.get("mainLibrary")
                if not isinstance(main_library, str) or not main_library.strip():
                    raise ValidationFailure("H5P h5p.json requires a non-empty mainLibrary")

                def h5p_dependencies(value, label):
                    if value is None:
                        return []
                    if not isinstance(value, list):
                        raise ValidationFailure(f"H5P {label} must be an array")
                    result = []
                    for index, dep in enumerate(value):
                        if not isinstance(dep, dict) or not isinstance(dep.get("machineName"), str) or not dep.get("machineName"):
                            raise ValidationFailure(f"H5P {label}[{index}] requires machineName")
                        try:
                            major = int(dep["majorVersion"]); minor = int(dep["minorVersion"])
                        except (KeyError, TypeError, ValueError) as exc:
                            raise ValidationFailure(f"H5P {label}[{index}] requires integer majorVersion/minorVersion") from exc
                        if major < 0 or minor < 0:
                            raise ValidationFailure(f"H5P {label}[{index}] has negative majorVersion/minorVersion")
                        result.append((dep["machineName"], major, minor))
                    return result

                required = set(h5p_dependencies(h5p.get("preloadedDependencies"), "preloadedDependencies"))
                if not any(machine == main_library for machine, _, _ in required):
                    raise ValidationFailure("H5P mainLibrary must be declared in preloadedDependencies")

                embedded = set()
                for nested_name, nested_bytes in files.items():
                    if nested_name.count("/") != 1 or not nested_name.endswith("/library.json"):
                        continue
                    library = load_json_bytes(nested_bytes, f"nested H5P {nested_name}")
                    if not isinstance(library, dict) or not isinstance(library.get("machineName"), str) or not library.get("machineName"):
                        raise ValidationFailure(f"H5P {nested_name} requires machineName")
                    try:
                        major = int(library["majorVersion"]); minor = int(library["minorVersion"])
                    except (KeyError, TypeError, ValueError) as exc:
                        raise ValidationFailure(f"H5P {nested_name} requires integer majorVersion/minorVersion") from exc
                    embedded.add((library["machineName"], major, minor))
                    h5p_dependencies(library.get("preloadedDependencies"), f"{nested_name} preloadedDependencies")

                matched = required.intersection(embedded)
                missing = required.difference(embedded)
                actual_mode = "bundled" if required and not missing else "mixed" if matched else "external"
                declared_h5p = (rep.get("extensions") or {}).get(profile) or {}
                if isinstance(declared_h5p, dict):
                    if declared_h5p.get("mainLibrary") not in (None, main_library):
                        raise ValidationFailure("H5P P2RLN metadata mainLibrary does not match preserved h5p.json")
                    if declared_h5p.get("dependencyMode") not in (None, actual_mode):
                        raise ValidationFailure("H5P P2RLN metadata dependencyMode does not match preserved package")
                    if declared_h5p.get("embeddedLibraryCount") not in (None, len(embedded)):
                        raise ValidationFailure("H5P P2RLN metadata embeddedLibraryCount does not match preserved package")
            elif profile == "https://p2rln.org/profile/scorm":
                if "imsmanifest.xml" not in names:
                    raise ValidationFailure("SCORM profile payload requires root imsmanifest.xml")
                try:
                    root = ET.fromstring(files["imsmanifest.xml"])
                except ET.ParseError as exc:
                    raise ValidationFailure(f"SCORM imsmanifest.xml invalid XML: {exc}") from exc
                for el in root.iter():
                    if _local_xml(el.tag) == "resource":
                        href = el.attrib.get("href")
                        if href:
                            _relative_launch_exists(files, href, "SCORM")
            elif profile == "https://p2rln.org/profile/common-cartridge":
                if "imsmanifest.xml" not in names:
                    raise ValidationFailure("Common Cartridge profile payload requires root imsmanifest.xml")
                try:
                    ET.fromstring(files["imsmanifest.xml"])
                except ET.ParseError as exc:
                    raise ValidationFailure(f"Common Cartridge imsmanifest.xml invalid XML: {exc}") from exc
            elif profile == "https://p2rln.org/profile/qti":
                if "imsmanifest.xml" not in names:
                    raise ValidationFailure("QTI profile payload requires root imsmanifest.xml")
                try:
                    root = ET.fromstring(files["imsmanifest.xml"])
                except ET.ParseError as exc:
                    raise ValidationFailure(f"QTI imsmanifest.xml invalid XML: {exc}") from exc
                schema = ""
                qti_resources = 0
                for el in root.iter():
                    ln = _local_xml(el.tag)
                    if ln == "schema" and el.text:
                        schema = el.text.strip()
                    if ln == "resource":
                        rtype = (el.attrib.get("type") or "").lower()
                        if "qti" in rtype:
                            qti_resources += 1
                        href = el.attrib.get("href")
                        if href:
                            _relative_launch_exists(files, href, "QTI")
                ns = root.tag[1:].split("}", 1)[0] if root.tag.startswith("{") else ""
                if "QTI Package" not in schema and "qti/qtiv3p0" not in ns and qti_resources == 0:
                    raise ValidationFailure("QTI profile payload does not identify a QTI package")
                if qti_resources == 0:
                    raise ValidationFailure("QTI profile payload has no QTI resources")
            elif profile == "https://p2rln.org/profile/cmi5":
                if "cmi5.xml" not in names:
                    raise ValidationFailure("cmi5 profile payload requires root cmi5.xml")
                try:
                    root = ET.fromstring(files["cmi5.xml"])
                except ET.ParseError as exc:
                    raise ValidationFailure(f"cmi5.xml invalid XML: {exc}") from exc
                for el in root.iter():
                    if _local_xml(el.tag) == "au":
                        url_el = next((c for c in list(el) if _local_xml(c.tag) == "url"), None)
                        href = "" if url_el is None else "".join(url_el.itertext()).strip()
                        _relative_launch_exists(files, href, "cmi5")
            elif profile == "https://p2rln.org/profile/tincan-package":
                if "tincan.xml" not in names:
                    raise ValidationFailure("Legacy Tin Can profile payload requires root tincan.xml")
                try:
                    root = ET.fromstring(files["tincan.xml"])
                except ET.ParseError as exc:
                    raise ValidationFailure(f"tincan.xml invalid XML: {exc}") from exc
                for el in root.iter():
                    if _local_xml(el.tag).lower() == "launch":
                        _relative_launch_exists(files, "".join(el.itertext()).strip(), "Tin Can package")


def validate_package(path: Path, strict_profiles: bool = False, validate_profile_payloads_flag: bool = False):
    if not zipfile.is_zipfile(path):
        raise ValidationFailure("not a ZIP/ZIP64 package")

    with zipfile.ZipFile(path, "r") as zf:
        infos = zf.infolist()
        if len(infos) > 5000:
            raise ValidationFailure("ZIP has more than 5000 entries")
        seen = set()
        for info in infos:
            safe_zip_name(info.filename.rstrip("/"))
            if info.filename in seen:
                raise ValidationFailure(f"duplicate ZIP entry: {info.filename}")
            seen.add(info.filename)
            if info.flag_bits & 0x1:
                raise ValidationFailure(f"encrypted ZIP entries are not allowed: {info.filename}")
            if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                raise ValidationFailure(f"unsupported ZIP compression method {info.compress_type}: {info.filename}")
            unix_mode = (info.external_attr >> 16) & 0xFFFF
            if unix_mode and stat.S_ISLNK(unix_mode):
                raise ValidationFailure(f"symbolic links are not allowed: {info.filename}")
            if info.file_size > 0 and info.compress_size > 0 and info.file_size / info.compress_size > 250:
                raise ValidationFailure(f"ZIP compression ratio exceeds 250: {info.filename}")

        names = [i.filename for i in infos if not i.is_dir()]
        if names.count("META-INF/manifest.json") != 1:
            raise ValidationFailure("package must contain exactly one META-INF/manifest.json")

        manifest_bytes = zf.read("META-INF/manifest.json")
        manifest = load_json_bytes(manifest_bytes, "manifest")
        validate_schema(manifest, schema("manifest.schema.json"), "manifest")

        graph_path = manifest["graph"]["path"]
        if graph_path != "content/graph.json":
            raise ValidationFailure("Core 0.4.0 requires graph.path == content/graph.json")
        if names.count(graph_path) != 1:
            raise ValidationFailure("package must contain exactly one content/graph.json")

        # Unique profile and entrypoint declarations.
        profile_ids = [p["id"] for p in manifest["profiles"]]
        if len(profile_ids) != len(set(profile_ids)):
            raise ValidationFailure("manifest declares the same profile id more than once")
        ep_keys = [(e["id"], e["type"], e["role"]) for e in manifest["entrypoints"]]
        if len(ep_keys) != len(set(ep_keys)):
            raise ValidationFailure("manifest declares duplicate entrypoints")

        # Unique manifest path declarations
        declared = [graph_path] + [f["path"] for f in manifest["files"]]
        if len(declared) != len(set(declared)):
            raise ValidationFailure("manifest declares duplicate paths")

        # Core 0.4.0 has no signature profile yet; no hidden/uninventoried payloads are allowed.
        allowed = {"META-INF/manifest.json", *declared}
        for name in names:
            if name.startswith("META-INF/signatures/"):
                raise ValidationFailure("signature payloads are reserved but not supported by Core 0.4.0")
            if name not in allowed:
                raise ValidationFailure(f"uninventoried payload: {name}")
        for name in declared:
            if name not in names:
                raise ValidationFailure(f"manifest declares missing payload: {name}")

        descriptors = [manifest["graph"], *manifest["files"]]
        for desc in descriptors:
            data = zf.read(desc["path"])
            if len(data) != desc["size"]:
                raise ValidationFailure(f"size mismatch: {desc['path']}")
            bd = sha256(data)
            if bd != desc["byteDigest"]:
                raise ValidationFailure(f"byteDigest mismatch: {desc['path']}")
            cd = content_digest(data, desc["mediaType"], desc["path"])
            if cd != desc["contentDigest"]:
                raise ValidationFailure(f"contentDigest mismatch: {desc['path']}")
            for prefix in ("assets/sha256", "packages/sha256"):
                if desc["path"].startswith(prefix + "/"):
                    expected_hex = desc["byteDigest"].split(":", 1)[1]
                    expected_path = f"{prefix}/{expected_hex[:2]}/{expected_hex[2:4]}/{expected_hex}"
                    if desc["path"] != expected_path:
                        raise ValidationFailure(f"content-addressed path does not match byteDigest: {desc['path']}")

        graph_bytes = zf.read(graph_path)
        graph = load_json_bytes(graph_bytes, "graph")
        validate_schema(graph, schema("graph.schema.json"), "graph")
        validate_graph_semantics(graph, manifest)
        validate_range_integrity_payload(graph, manifest, zf)
        validate_package_member_locations(graph, zf)

        transform_ext = (graph.get("extensions") or {}).get("org.p2rln.transform")
        if transform_ext:
            report_path = transform_ext.get("report")
            if not report_path:
                raise ValidationFailure("org.p2rln.transform requires report path")
            descriptor = next((f for f in manifest["files"] if f["path"] == report_path), None)
            if descriptor is None:
                raise ValidationFailure("transformation report is not inventoried")
            report_obj = load_json_bytes(zf.read(report_path), "transformation report")
            validate_schema(report_obj, schema("transformation-report.schema.json"), "transformation report")

        if validate_profile_payloads_flag:
            validate_profile_payloads(graph, manifest, zf)

        root = compute_content_root(manifest)
        if root != manifest["integrity"]["contentRoot"]:
            raise ValidationFailure(f"contentRoot mismatch: expected {root}, manifest has {manifest['integrity']['contentRoot']}")

        unknown_required = [p["id"] for p in manifest["profiles"] if p["requirement"] == "required" and p["id"] not in KNOWN_PROFILES]
        unsupported_required_versions = [
            f"{p['id']}@{p['version']}"
            for p in manifest["profiles"]
            if p["requirement"] == "required"
            and p["id"] in KNOWN_PROFILE_VERSIONS
            and p["version"] not in KNOWN_PROFILE_VERSIONS[p["id"]]
        ]
        if strict_profiles and unknown_required:
            raise ValidationFailure("unknown required profiles: " + ", ".join(unknown_required))
        if strict_profiles and unsupported_required_versions:
            raise ValidationFailure("unsupported required profile versions: " + ", ".join(unsupported_required_versions))

        return {
            "format": manifest["format"],
            "formatVersion": manifest["formatVersion"],
            "packageId": manifest["packageId"],
            "contentRoot": root,
            "entities": len(graph["entities"]),
            "files": len(manifest["files"]),
            "unknownRequiredProfiles": unknown_required,
        }


