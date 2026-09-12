from __future__ import annotations

import copy
import json
import re
import shutil
import uuid
from pathlib import Path
from urllib.parse import urlsplit

from jsonschema import Draft202012Validator, FormatChecker

from p2rln_ref.native_composite import (
    ACTIVITY_TYPE as NATIVE_COMPOSITE_ACTIVITY_TYPE,
    MEDIA_TYPE as NATIVE_COMPOSITE_MEDIA_TYPE,
    PROFILE as NATIVE_COMPOSITE_PROFILE,
    SCHEMA_ID as NATIVE_COMPOSITE_SCHEMA_ID,
    validate_composite,
)
from p2rln_ref.native_component import (
    ACTIVITY_TYPE as NATIVE_COMPONENT_ACTIVITY_TYPE,
    MEDIA_TYPE as NATIVE_COMPONENT_MEDIA_TYPE,
    PROFILE as NATIVE_COMPONENT_PROFILE,
    NativeComponentError,
    validate_component_instance,
)
from p2rln_ref.native_questionnaire import (
    MEDIA_TYPE as NATIVE_QUESTIONNAIRE_MEDIA_TYPE,
    PROFILE as NATIVE_QUESTIONNAIRE_PROFILE,
    NativeQuestionnaireError,
    validate_questionnaire,
)

PROJECT_FILE = "p2rln.project.json"
KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
SCHEMA_PATH = Path(__file__).resolve().parent / "schemas" / "project.schema.json"
RENDERER_HINT_EXTENSION = "https://p2rln.org/ext/renderer-preference/1"
WEB_CONTENT_PROFILE = "https://p2rln.org/profile/web-content"


class ProjectError(ValueError):
    pass


def _langmap(text: str | None, language: str) -> dict[str, str] | None:
    if text is None:
        return None
    value = text.strip()
    return {language: value} if value else None


def new_project(title: str, language: str = "es", description: str | None = None) -> dict:
    project_id = "urn:uuid:" + str(uuid.uuid4())
    course = {
        "key": "course",
        "revision": 1,
        "title": {language: title.strip() or "Untitled course"},
        "languages": [language],
        "children": [],
    }
    desc = _langmap(description, language)
    if desc:
        course["description"] = desc
    return {
        "projectVersion": "0.2.0",
        "targetFormatVersion": "0.4.0",
        "projectId": project_id,
        "course": course,
        "units": [],
        "resources": [],
        "activities": [],
        "objectives": [],
        "relations": [],
        "profiles": [],
    }


def project_path(root: Path) -> Path:
    root = Path(root)
    return root / PROJECT_FILE if root.is_dir() or root.suffix == "" else root


def load_project(root: Path) -> tuple[Path, dict]:
    path = project_path(Path(root))
    if not path.exists():
        raise ProjectError(f"project file not found: {path}")
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ProjectError(f"invalid project JSON: {exc}") from exc
    validate_project(obj)
    return path, obj


def save_project(path: Path, project: dict) -> None:
    validate_project(project)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(project, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def validate_project(project: dict) -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(project), key=lambda e: list(e.absolute_path))
    if errors:
        lines = []
        for err in errors[:20]:
            loc = "/".join(str(v) for v in err.absolute_path) or "$"
            lines.append(f"{loc}: {err.message}")
        raise ProjectError("invalid P2RLN creator project:\n" + "\n".join(lines))

    keys = []
    keys.append(project["course"]["key"])
    for group in ("units", "resources", "activities", "objectives"):
        keys.extend(x["key"] for x in project[group])
    if len(keys) != len(set(keys)):
        raise ProjectError("project entity keys must be globally unique")
    for key in keys:
        if not KEY_RE.match(key):
            raise ProjectError(f"invalid project key: {key!r}")

    known = set(keys)
    kind_by_key = {project["course"]["key"]: "course"}
    for group, kind in (("units", "unit"), ("resources", "resource"), ("activities", "activity"), ("objectives", "objective")):
        for item in project[group]:
            kind_by_key[item["key"]] = kind

    hierarchy = [project["course"], *project["units"], *project["activities"]]
    for entity in hierarchy:
        for child in entity.get("children", []):
            if child not in known:
                raise ProjectError(f"unknown child key {child!r} in {entity['key']}")
        if entity in project["activities"]:
            children = entity.get("children", [])
            if entity.get("activityType") == NATIVE_COMPOSITE_ACTIVITY_TYPE:
                if not children:
                    raise ProjectError(f"native composite must contain at least one child activity: {entity['key']}")
                for child in children:
                    if kind_by_key.get(child) != "activity":
                        raise ProjectError(f"native composite children must be activities: {entity['key']} -> {child}")
            elif children:
                raise ProjectError(f"activity children require {NATIVE_COMPOSITE_ACTIVITY_TYPE}: {entity['key']}")

    child_map = {entity["key"]: list(entity.get("children", [])) for entity in hierarchy}
    visiting: set[str] = set()
    visited: set[str] = set()
    def visit(key: str, trail: list[str]) -> None:
        if key in visiting:
            raise ProjectError("project hierarchy cycle: " + " -> ".join([*trail, key]))
        if key in visited or key not in child_map:
            return
        visiting.add(key)
        for child in child_map[key]:
            visit(child, [*trail, key])
        visiting.remove(key)
        visited.add(key)
    for key in child_map:
        visit(key, [])

    for activity in project["activities"]:
        if activity.get("resource") and activity["resource"] not in known:
            raise ProjectError(f"unknown resource key {activity['resource']!r} in {activity['key']}")
        for resource in activity.get("resources", []):
            if resource not in known:
                raise ProjectError(f"unknown resource key {resource!r} in {activity['key']}")
        for objective in activity.get("objectives", []):
            if objective not in known:
                raise ProjectError(f"unknown objective key {objective!r} in {activity['key']}")
    for relation in project["relations"]:
        for side in ("source", "target"):
            if relation[side] not in known:
                raise ProjectError(f"unknown relation {side} key: {relation[side]!r}")


def _entity_by_key(project: dict, key: str) -> dict:
    if project["course"]["key"] == key:
        return project["course"]
    for group in ("units", "resources", "activities", "objectives"):
        for entity in project[group]:
            if entity["key"] == key:
                return entity
    raise ProjectError(f"unknown entity key: {key}")


def append_child(project: dict, parent_key: str, child_key: str) -> None:
    parent = _entity_by_key(project, parent_key)
    allowed = parent is project["course"] or parent in project["units"]
    if parent in project["activities"] and parent.get("activityType") == NATIVE_COMPOSITE_ACTIVITY_TYPE:
        allowed = True
    if not allowed:
        raise ProjectError("children can only be attached to course, unit, or native composite activity entities")
    if parent in project["activities"] and _entity_by_key(project, child_key) not in project["activities"]:
        raise ProjectError("native composite children must be activities")
    children = parent.setdefault("children", [])
    if child_key not in children:
        children.append(child_key)


def add_unit(project: dict, key: str, title: str, language: str = "es", role: str = "module", parent: str = "course") -> dict:
    if not KEY_RE.match(key):
        raise ProjectError(f"invalid key: {key!r}")
    _assert_key_unused(project, key)
    unit = {"key": key, "role": role, "title": {language: title.strip() or key}, "children": []}
    project["units"].append(unit)
    append_child(project, parent, key)
    validate_project(project)
    return unit


def _assert_key_unused(project: dict, key: str) -> None:
    try:
        _entity_by_key(project, key)
    except ProjectError:
        return
    raise ProjectError(f"project key already exists: {key}")


def _copy_into_project(project_root: Path, source: Path, key: str) -> str:
    assets_dir = project_root / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    suffix = source.suffix.lower()
    candidate = assets_dir / f"{key}{suffix}"
    if candidate.exists() and candidate.resolve() != source.resolve():
        digest = uuid.uuid5(uuid.NAMESPACE_URL, str(source.resolve())).hex[:8]
        candidate = assets_dir / f"{key}-{digest}{suffix}"
    if source.resolve() != candidate.resolve():
        shutil.copy2(source, candidate)
    return candidate.relative_to(project_root).as_posix()


def add_file(
    project_root: Path,
    project: dict,
    source: Path,
    key: str,
    title: str,
    *,
    language: str = "es",
    parent: str = "course",
    media_type: str | None = None,
    profile: str | None = None,
    role: str = "primary",
    activity_type: str = "https://p2rln.org/type/resource",
    copy_file: bool = True,
) -> tuple[dict, dict]:
    source = Path(source)
    if not source.is_file():
        raise ProjectError(f"source file not found: {source}")
    resource_key = f"res-{key}"
    activity_key = f"act-{key}"
    _assert_key_unused(project, resource_key)
    _assert_key_unused(project, activity_key)
    rel = _copy_into_project(project_root, source, key) if copy_file else _relative_source(project_root, source)
    rep = {
        "key": "primary",
        "role": role,
        "source": {"type": "file", "path": rel},
    }
    if media_type:
        rep["mediaType"] = media_type
    if profile:
        rep["profile"] = profile
    resource = {
        "key": resource_key,
        "title": {language: title.strip() or key},
        "representations": [rep],
    }
    activity = {
        "key": activity_key,
        "activityType": activity_type,
        "title": {language: title.strip() or key},
        "resource": resource_key,
    }
    project["resources"].append(resource)
    project["activities"].append(activity)
    append_child(project, parent, activity_key)
    validate_project(project)
    return resource, activity



def _relative_directory_source(project_root: Path, source: Path) -> str:
    root = Path(project_root).resolve()
    source = Path(source).resolve()
    if not source.is_dir():
        raise ProjectError(f"source directory not found: {source}")
    try:
        return source.relative_to(root).as_posix()
    except ValueError as exc:
        raise ProjectError(f"web directory is outside project workspace: {source}") from exc


def _copy_directory_into_project(project_root: Path, source: Path, key: str) -> str:
    root = Path(project_root).resolve()
    source_input = Path(source)
    if source_input.is_symlink():
        raise ProjectError(f"web content symbolic links are not allowed: {source_input}")
    source = source_input.resolve()
    for candidate in source.rglob("*"):
        if candidate.is_symlink():
            raise ProjectError(f"web content symbolic links are not allowed: {candidate}")
    assets = root / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    target = assets / f"{key}-web"
    if target.exists():
        raise ProjectError(f"web content target already exists: {target}")
    shutil.copytree(source, target, symlinks=False)
    return target.relative_to(root).as_posix()


def _safe_web_entrypoint(value: str) -> str:
    raw = str(value or "").replace("\\", "/").strip("/")
    parts = raw.split("/") if raw else []
    if not parts or any(part in {"", ".", ".."} for part in parts):
        raise ProjectError("web entrypoint must be a safe relative path")
    return "/".join(parts)


def add_web_content(
    project_root: Path,
    project: dict,
    source_dir: Path,
    entrypoint: str,
    key: str,
    title: str,
    *,
    language: str = "es",
    parent: str = "course",
    copy_directory: bool = True,
) -> tuple[dict, dict]:
    """Add a passive web-content directory without flattening its relative paths.

    The editable project remembers the directory + entrypoint. At build time the
    directory is content-addressed and a web-content profile mapping preserves
    logical relative paths without making them duplicate graph Resources.
    """
    source_dir = Path(source_dir)
    if not source_dir.is_dir():
        raise ProjectError(f"source directory not found: {source_dir}")
    entrypoint = _safe_web_entrypoint(entrypoint)
    entry_file = source_dir.joinpath(*entrypoint.split("/"))
    if not entry_file.is_file():
        raise ProjectError(f"web entrypoint not found: {entrypoint}")

    candidate = copy.deepcopy(project)
    resource_key = f"res-{key}"
    activity_key = f"act-{key}"
    _assert_key_unused(candidate, resource_key)
    _assert_key_unused(candidate, activity_key)
    source_path = (f"assets/{key}-web" if copy_directory else _relative_directory_source(Path(project_root), source_dir))
    resource = {
        "key": resource_key,
        "title": {language: title.strip() or key},
        "representations": [{
            "key": "primary",
            "role": "primary",
            "mediaType": "text/html",
            "profile": WEB_CONTENT_PROFILE,
            "source": {"type": "web-directory", "path": source_path, "entrypoint": entrypoint},
        }],
    }
    activity = {
        "key": activity_key,
        "activityType": "https://p2rln.org/type/resource",
        "title": {language: title.strip() or key},
        "resource": resource_key,
    }
    candidate["resources"].append(resource)
    candidate["activities"].append(activity)
    append_child(candidate, parent, activity_key)
    validate_project(candidate)

    if copy_directory:
        actual = _copy_directory_into_project(Path(project_root), source_dir, key)
        target_resource = next(item for item in candidate["resources"] if item["key"] == resource_key)
        target_resource["representations"][0]["source"]["path"] = actual

    project.clear()
    project.update(candidate)
    return _entity_by_key(project, resource_key), _entity_by_key(project, activity_key)

def add_questionnaire(
    project_root: Path,
    project: dict,
    source: Path,
    key: str,
    title: str | None = None,
    *,
    language: str = "es",
    parent: str = "course",
    copy_file: bool = True,
    renderer: str | None = None,
    renderer_version: str | None = None,
) -> tuple[dict, dict]:
    """Add a validated native P2RLN questionnaire as one Resource + Activity.

    The editable JSON remains an authoring input. The emitted package uses the
    native questionnaire profile and the regular Creator content-addressing path.
    """
    source = Path(source)
    if not source.is_file():
        raise ProjectError(f"source file not found: {source}")
    try:
        payload = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProjectError(f"invalid native questionnaire JSON: {exc}") from exc
    try:
        validate_questionnaire(payload)
    except NativeQuestionnaireError as exc:
        raise ProjectError(f"invalid native questionnaire: {exc}") from exc

    if renderer:
        renderer = renderer.strip()
        parsed = urlsplit(renderer)
        if not renderer or not parsed.scheme or parsed.scheme not in {"https", "urn"}:
            raise ProjectError("renderer must be an absolute https: or urn: identifier")
        if renderer_version is not None:
            renderer_version = renderer_version.strip()
            if not renderer_version or len(renderer_version) > 64:
                raise ProjectError("renderer_version must be a non-empty value up to 64 characters")
    elif renderer_version is not None:
        raise ProjectError("renderer_version requires renderer")

    resolved_title = (title or str(payload.get("title") or "")).strip() or key
    resource, activity = add_file(
        project_root,
        project,
        source,
        key,
        resolved_title,
        language=language,
        parent=parent,
        media_type=NATIVE_QUESTIONNAIRE_MEDIA_TYPE,
        profile=NATIVE_QUESTIONNAIRE_PROFILE,
        role="primary",
        activity_type="https://p2rln.org/type/assessment",
        copy_file=copy_file,
    )
    if renderer:
        hint = {"preferred": renderer, "required": False}
        if renderer_version:
            hint["version"] = renderer_version
        activity.setdefault("extensions", {})[RENDERER_HINT_EXTENSION] = hint
        validate_project(project)
    return resource, activity


def add_component(
    project_root: Path,
    project: dict,
    source: Path,
    key: str,
    title: str | None = None,
    *,
    language: str = "es",
    parent: str = "course",
    copy_file: bool = True,
) -> tuple[dict, dict]:
    """Add one validated declarative native component instance.

    Component implementation code is deliberately not copied into the project.
    The package carries only the instance data and version identifiers; a
    Reading System resolves the trusted implementation from its Component
    Registry at run time.
    """
    source = Path(source)
    if not source.is_file():
        raise ProjectError(f"source file not found: {source}")
    try:
        payload = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProjectError(f"invalid native component JSON: {exc}") from exc
    try:
        payload = validate_component_instance(payload)
    except NativeComponentError as exc:
        raise ProjectError(f"invalid native component: {exc}") from exc

    # Validate the full candidate project before mutating the caller or copying
    # bytes.  This keeps failures such as an invalid parent transactional.
    candidate = copy.deepcopy(project)
    resolved_title = (title or str(payload.get("title") or "")).strip() or key
    source_rel = _relative_source(Path(project_root), source) if not copy_file else f"assets/{key}{source.suffix.lower()}"
    resource_key = f"res-{key}"
    activity_key = f"act-{key}"
    _assert_key_unused(candidate, resource_key)
    _assert_key_unused(candidate, activity_key)
    resource = {
        "key": resource_key,
        "title": {language: resolved_title},
        "representations": [{
            "key": "primary",
            "role": "primary",
            "mediaType": NATIVE_COMPONENT_MEDIA_TYPE,
            "profile": NATIVE_COMPONENT_PROFILE,
            "source": {"type": "file", "path": source_rel},
        }],
    }
    activity = {
        "key": activity_key,
        "activityType": NATIVE_COMPONENT_ACTIVITY_TYPE,
        "title": {language: resolved_title},
        "resource": resource_key,
    }
    candidate["resources"].append(resource)
    candidate["activities"].append(activity)
    append_child(candidate, parent, activity_key)
    validate_project(candidate)

    if copy_file:
        actual_rel = _copy_into_project(Path(project_root), source, key)
        resource["representations"][0]["source"]["path"] = actual_rel
        # If collision-safe naming changed the path, mirror it in the candidate.
        candidate_resource = next(item for item in candidate["resources"] if item["key"] == resource_key)
        candidate_resource["representations"][0]["source"]["path"] = actual_rel

    project.clear()
    project.update(candidate)
    return _entity_by_key(project, resource_key), _entity_by_key(project, activity_key)

def _detach_child(project: dict, child_key: str, *, except_parent: str | None = None) -> None:
    for entity in [project["course"], *project["units"], *project["activities"]]:
        if entity.get("key") == except_parent:
            continue
        children = entity.get("children")
        if isinstance(children, list) and child_key in children:
            entity["children"] = [key for key in children if key != child_key]


def add_composite(
    project_root: Path,
    project: dict,
    key: str,
    title: str,
    *,
    language: str = "es",
    parent: str = "course",
    mode: str = "sequence",
    completion: str = "all",
    navigation: str | None = None,
    children: list[str] | None = None,
    move_children: bool = True,
) -> tuple[dict, dict]:
    if not KEY_RE.match(key):
        raise ProjectError(f"invalid key: {key!r}")
    resource_key = f"res-{key}"
    activity_key = f"act-{key}"
    _assert_key_unused(project, resource_key)
    _assert_key_unused(project, activity_key)
    child_keys = list(dict.fromkeys(children or []))
    if not child_keys:
        raise ProjectError("native composite requires at least one child activity")
    for child_key in child_keys:
        child = _entity_by_key(project, child_key)
        if child not in project["activities"]:
            raise ProjectError(f"native composite child is not an activity: {child_key}")

    # Validate every semantic decision and hierarchy mutation on a deep copy.
    # The caller's in-memory project is committed only after the candidate passes.
    candidate = copy.deepcopy(project)
    payload = {
        "schema": NATIVE_COMPOSITE_SCHEMA_ID,
        "version": "0.1",
        "mode": mode,
        "completion": completion,
        "title": title.strip() or key,
    }
    if navigation:
        payload["navigation"] = navigation
    payload = validate_composite(payload)

    rel = f"assets/{key}.composite.json"
    resource = {
        "key": resource_key,
        "title": {language: title.strip() or key},
        "representations": [{
            "key": "primary",
            "role": "primary",
            "mediaType": NATIVE_COMPOSITE_MEDIA_TYPE,
            "profile": NATIVE_COMPOSITE_PROFILE,
            "source": {"type": "file", "path": rel},
        }],
    }
    activity = {
        "key": activity_key,
        "activityType": NATIVE_COMPOSITE_ACTIVITY_TYPE,
        "title": {language: title.strip() or key},
        "resource": resource_key,
        "children": child_keys,
    }
    candidate["resources"].append(resource)
    candidate["activities"].append(activity)
    if move_children:
        for child_key in child_keys:
            _detach_child(candidate, child_key, except_parent=activity_key)
    append_child(candidate, parent, activity_key)
    validate_project(candidate)

    assets_dir = Path(project_root) / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    config_path = assets_dir / f"{key}.composite.json"
    temporary = assets_dir / f".{key}.composite.json.tmp"
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(config_path)
    project.clear()
    project.update(candidate)
    return _entity_by_key(project, resource_key), _entity_by_key(project, activity_key)


def _relative_source(project_root: Path, source: Path) -> str:
    root = project_root.resolve()
    path = source.resolve()
    try:
        return path.relative_to(root).as_posix()
    except ValueError as exc:
        raise ProjectError("source must be inside the project unless --copy is used") from exc


def add_url(
    project: dict,
    url: str,
    key: str,
    title: str,
    *,
    language: str = "es",
    parent: str = "course",
    media_type: str = "text/html",
    profile: str | None = None,
    role: str = "primary",
    activity_type: str = "https://p2rln.org/type/resource",
) -> tuple[dict, dict]:
    resource_key = f"res-{key}"
    activity_key = f"act-{key}"
    _assert_key_unused(project, resource_key)
    _assert_key_unused(project, activity_key)
    rep = {
        "key": "primary",
        "role": role,
        "mediaType": media_type,
        "source": {"type": "remote", "href": url},
    }
    if profile:
        rep["profile"] = profile
    resource = {"key": resource_key, "title": {language: title.strip() or key}, "representations": [rep]}
    activity = {
        "key": activity_key,
        "activityType": activity_type,
        "title": {language: title.strip() or key},
        "resource": resource_key,
    }
    project["resources"].append(resource)
    project["activities"].append(activity)
    append_child(project, parent, activity_key)
    validate_project(project)
    return resource, activity
