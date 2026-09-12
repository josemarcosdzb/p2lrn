from __future__ import annotations

import copy
import hashlib
import json
import mimetypes
import re
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from p2rln_ref import validator as p2_validator
from p2rln_ref.native_questionnaire import MEDIA_TYPE as NATIVE_QUESTIONNAIRE_MEDIA_TYPE
from p2rln_ref.native_questionnaire import PROFILE as NATIVE_QUESTIONNAIRE_PROFILE

from .builder import build_project
from .aulap2p_questionnaire import AulaP2PQuestionnaireError, questionnaire_from_aulap2p
from .project import append_child, save_project

AULAP2P_COURSE_SCHEMA = "aulap2p.curso.v1"
AULAP2P_COURSE_ENVELOPE = "p2rln.aulap2p-course-envelope.v1"
AULAP2P_COURSE_IMPORT = "p2rln.aulap2p-course-import.v1"
AULAP2P_EXT = "https://p2rln.org/ext/aulap2p/course-v1"
QTI_PROFILE = "https://p2rln.org/profile/qti"
TYPE_RESOURCE = "https://p2rln.org/type/resource"
TYPE_ASSESSMENT = "https://p2rln.org/type/assessment"
TYPE_ASSIGNMENT = "https://p2rln.org/type/assignment"

_LOCAL_FIELDS = {
    "id",
    "archivoId",
    "sourceLocalId",
    "localId",
    "databaseId",
    "cursoId",
    "moduloId",
    "leccionId",
    "materialId",
    "cuestionarioId",
    "recursoCursoId",
    "tareaId",
    "profesorId",
    "usuarioId",
    "alumnoId",
}
_TASK_FORBIDDEN_FIELDS = {
    *_LOCAL_FIELDS,
    "entrega",
    "entregas",
    "submission",
    "submissions",
    "intento",
    "intentos",
    "attempt",
    "attempts",
    "nota",
    "notas",
    "grade",
    "grades",
    "feedback",
    "correccion",
    "correcciones",
    "archivoEntrega",
    "archivosEntrega",
    "submissionFile",
    "submissionFiles",
}
_TASK_FIELDS = (
    "titulo",
    "descripcion",
    "puntuacionMaxima",
    "fechaEntrega",
    "permiteRetraso",
    "tituloVisible",
    "obligatorio",
    "positionKey",
    "desbloqueadoEn",
)
_PROJECT_KEY_BAD = re.compile(r"[^A-Za-z0-9._-]+")


class AulaP2PCourseError(ValueError):
    pass


def _json_bytes(obj: Any) -> bytes:
    return (json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def _safe_key(prefix: str, value: str, *, fallback: str) -> str:
    raw = str(value or fallback).strip()
    raw = _PROJECT_KEY_BAD.sub("-", raw).strip("-._") or fallback
    key = f"{prefix}-{raw}" if prefix else raw
    if not key[0].isalnum():
        key = "k-" + key
    return key[:128]


def _langmap(value: Any, language: str) -> dict[str, str]:
    text = str(value or "").strip()
    return {language: text or "Sin titulo"}


def _looks_internal_url(value: str, internal_hosts: set[str]) -> bool:
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    if parsed.scheme not in {"http", "https"}:
        return False
    host = (parsed.hostname or "").lower()
    if not host:
        return False
    if host in internal_hosts:
        return True
    return host in {"localhost", "127.0.0.1", "::1", "host.docker.internal"}


def _portable_value(value: Any, internal_hosts: set[str]) -> Any:
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, item in value.items():
            if key in _LOCAL_FIELDS:
                continue
            if key in {"url", "href", "storageKey", "path"} and isinstance(item, str):
                if _looks_internal_url(item, internal_hosts):
                    continue
            out[key] = _portable_value(item, internal_hosts)
        return out
    if isinstance(value, list):
        return [_portable_value(x, internal_hosts) for x in value]
    if isinstance(value, str) and _looks_internal_url(value, internal_hosts):
        return None
    return value


def _portable_block(block: dict, internal_hosts: set[str]) -> dict:
    allowed = ("tipo", "contenido", "orden", "configuracion", "titulo", "descripcion")
    return {key: _portable_value(block[key], internal_hosts) for key in allowed if key in block}


def _portable_material(material: dict, internal_hosts: set[str]) -> dict:
    allowed = ("titulo", "descripcion", "contenido", "orden", "tipo", "estadoPublicacion")
    return {key: _portable_value(material[key], internal_hosts) for key in allowed if key in material}


def _portable_question(question: dict, internal_hosts: set[str]) -> dict:
    allowed = ("enunciado", "tipo", "configuracion", "solucion", "orden", "puntos", "opciones", "explicacion")
    return {key: _portable_value(question[key], internal_hosts) for key in allowed if key in question}


def _portable_quiz(quiz: dict, internal_hosts: set[str]) -> dict:
    allowed = ("titulo", "descripcion", "configuracion", "orden", "puntuacionMaxima", "intentosPermitidos")
    out = {key: _portable_value(quiz[key], internal_hosts) for key in allowed if key in quiz}
    out["preguntas"] = [_portable_question(q, internal_hosts) for q in quiz.get("preguntas", []) if isinstance(q, dict)]
    return out


def _portable_course_for_identity(course: dict, internal_hosts: set[str]) -> dict:
    out = {
        "version": AULAP2P_COURSE_SCHEMA,
        "curso": _portable_value(course.get("curso", {}), internal_hosts),
        "modulos": [],
        "materiales": [],
        "cuestionarios": [],
    }
    for module in course.get("modulos", []):
        if not isinstance(module, dict):
            continue
        mod = {
            "titulo": module.get("titulo"),
            "descripcion": module.get("descripcion"),
            "orden": module.get("orden"),
            "lecciones": [],
        }
        for lesson in module.get("lecciones", []):
            if not isinstance(lesson, dict):
                continue
            mod["lecciones"].append({
                "titulo": lesson.get("titulo"),
                "descripcion": lesson.get("descripcion"),
                "orden": lesson.get("orden"),
                "bloques": [_portable_block(x, internal_hosts) for x in lesson.get("bloques", []) if isinstance(x, dict)],
                "materiales": [_portable_material(x, internal_hosts) for x in lesson.get("materiales", []) if isinstance(x, dict)],
                "cuestionarios": [_portable_quiz(x, internal_hosts) for x in lesson.get("cuestionarios", []) if isinstance(x, dict)],
            })
        out["modulos"].append(mod)
    out["materiales"] = [_portable_material(x, internal_hosts) for x in course.get("materiales", []) if isinstance(x, dict)]
    out["cuestionarios"] = [_portable_quiz(x, internal_hosts) for x in course.get("cuestionarios", []) if isinstance(x, dict)]
    return out


def _load_input(path: Path) -> tuple[dict, dict]:
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AulaP2PCourseError(f"invalid AulaP2P course JSON: {exc}") from exc
    if not isinstance(raw, dict):
        raise AulaP2PCourseError("AulaP2P course input must be a JSON object")
    if raw.get("version") == AULAP2P_COURSE_SCHEMA:
        return raw, {}
    if raw.get("schema") == AULAP2P_COURSE_ENVELOPE and isinstance(raw.get("course"), dict):
        course = raw["course"]
        if course.get("version") != AULAP2P_COURSE_SCHEMA:
            raise AulaP2PCourseError("bridge envelope course must use aulap2p.curso.v1")
        return course, raw
    raise AulaP2PCourseError("expected aulap2p.curso.v1 or p2rln.aulap2p-course-envelope.v1")


def _entry_list(envelope: dict, name: str) -> list[dict]:
    value = envelope.get(name, [])
    if value is None:
        return []
    if not isinstance(value, list) or any(not isinstance(x, dict) for x in value):
        raise AulaP2PCourseError(f"envelope {name} must be an array of objects")
    return value


def _entry_for(entries: list[dict], canonical_path: str) -> dict | None:
    for item in entries:
        if str(item.get("canonicalPath") or "") == canonical_path:
            return item
    return None


def _copy_payload(project_root: Path, source: Path, label: str) -> str:
    if not source.is_file():
        raise AulaP2PCourseError(f"materialized payload not found: {source}")
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    suffix = source.suffix.lower()
    dest = project_root / "assets" / f"{label}-{digest[:16]}{suffix}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, dest)
    return dest.relative_to(project_root).as_posix()


def _materialized_path(entry: dict, asset_root: Path | None) -> Path | None:
    raw = entry.get("path") or entry.get("materializedPath")
    if not raw:
        return None
    path = Path(str(raw))
    if path.is_absolute():
        return path
    if asset_root is None:
        return None
    root = asset_root.resolve()
    resolved = (root / path).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise AulaP2PCourseError(f"materialized payload escapes asset root: {raw}") from exc
    return resolved


def _external_url_from_canonical(obj: dict, internal_hosts: set[str]) -> str | None:
    candidates: list[Any] = []
    for key in ("url", "href"):
        if key in obj:
            candidates.append(obj.get(key))
    archivo = obj.get("archivo")
    if isinstance(archivo, dict):
        candidates.extend([archivo.get("url"), archivo.get("href")])
    contenido = obj.get("contenido")
    if isinstance(contenido, dict):
        candidates.extend([contenido.get("url"), contenido.get("href")])
    for value in candidates:
        if not isinstance(value, str):
            continue
        try:
            parsed = urlparse(value)
        except ValueError:
            continue
        if parsed.scheme in {"http", "https"} and parsed.netloc and not _looks_internal_url(value, internal_hosts):
            return value
    return None


def _task_forbidden_paths(value: Any, prefix: str = "task") -> list[str]:
    hits: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            path = f"{prefix}.{key}"
            if key in _TASK_FORBIDDEN_FIELDS:
                hits.append(path)
            hits.extend(_task_forbidden_paths(item, path))
    elif isinstance(value, list):
        for idx, item in enumerate(value):
            hits.extend(_task_forbidden_paths(item, f"{prefix}[{idx}]"))
    return hits


def _task_portable(task: dict, internal_hosts: set[str]) -> dict:
    hits = _task_forbidden_paths(task)
    if hits:
        raise AulaP2PCourseError("task contains non-portable learner/local state: " + ", ".join(sorted(set(hits))))
    out: dict[str, Any] = {}
    for field in _TASK_FIELDS:
        if field in task and task[field] is not None:
            out[field] = _portable_value(task[field], internal_hosts)
    return out


def _validate_task_sidecars(tasks: list[dict]) -> None:
    seen: set[str] = set()
    for index, task in enumerate(tasks):
        path = str(task.get("canonicalPath") or f"tasks/{index}")
        if path in seen:
            raise AulaP2PCourseError(f"duplicate task canonicalPath: {path}")
        seen.add(path)
        _task_forbidden = _task_forbidden_paths(task)
        if _task_forbidden:
            raise AulaP2PCourseError("task contains non-portable learner/local state: " + ", ".join(sorted(set(_task_forbidden))))
        for name in ("canonicalPath", "materialPath", "parentPath"):
            if name in task and task[name] is not None and not isinstance(task[name], str):
                raise AulaP2PCourseError(f"task {name} must be a string")


def _ensure_unique_key(project: dict, key: str) -> str:
    known = {project["course"]["key"]}
    for group in ("units", "resources", "activities", "objectives"):
        known.update(str(item["key"]) for item in project[group])
    if key not in known:
        return key
    index = 2
    base = key[:118]
    while f"{base}-{index}" in known:
        index += 1
    return f"{base}-{index}"


def _new_project(course: dict, envelope: dict, language: str, internal_hosts: set[str]) -> dict:
    identity = _portable_course_for_identity(course, internal_hosts)
    project_id = envelope.get("projectId")
    if not isinstance(project_id, str) or not project_id.startswith("urn:uuid:"):
        project_id = "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, _json_bytes(identity).decode("utf-8")))
    course_data = course.get("curso") if isinstance(course.get("curso"), dict) else {}
    title = course_data.get("titulo") or course.get("titulo") or "Curso AulaP2P"
    description = course_data.get("descripcion") or course_data.get("descripcionCorta") or course.get("descripcion")
    revision = course_data.get("revision")
    if not isinstance(revision, int) or revision < 0:
        revision = 1
    ext_course = _portable_value(course_data, internal_hosts)
    for key in list(ext_course) if isinstance(ext_course, dict) else []:
        if key in {"titulo", "descripcion", "descripcionCorta"}:
            ext_course.pop(key, None)
    project = {
        "projectVersion": "0.2.0",
        "targetFormatVersion": "0.4.0",
        "projectId": project_id,
        "course": {
            "key": "course",
            "revision": revision,
            "title": _langmap(title, language),
            "languages": [language],
            "children": [],
            "extensions": {
                AULAP2P_EXT: {
                    "kind": "course",
                    "sourceSchema": AULAP2P_COURSE_SCHEMA,
                    "canonical": ext_course if isinstance(ext_course, dict) else {},
                }
            },
        },
        "units": [],
        "resources": [],
        "activities": [],
        "objectives": [],
        "relations": [],
        "profiles": [],
        "provenance": {
            "adapter": "p2rln.aulap2p-course.v0.6.1",
            "sourceSchema": AULAP2P_COURSE_SCHEMA,
            "identityRule": "installation-local IDs and internal URLs excluded from portable identity",
            "taskRule": "Tarea is a specialization of MaterialEjercicio + RecursoCurso and is emitted once",
            "losses": [],
        },
    }
    if description:
        project["course"]["description"] = _langmap(description, language)
    return project


def _activity(
    project: dict,
    *,
    key: str,
    parent: str,
    title: str,
    language: str,
    activity_type: str,
    kind: str,
    canonical: dict,
    canonical_path: str,
    resource: str | None = None,
    extra_ext: dict | None = None,
) -> dict:
    key = _ensure_unique_key(project, key)
    ext = {
        "kind": kind,
        "canonicalPath": canonical_path,
        "canonical": canonical,
    }
    if extra_ext:
        ext.update(extra_ext)
    out = {
        "key": key,
        "activityType": activity_type,
        "title": _langmap(title, language),
        "extensions": {AULAP2P_EXT: ext},
    }
    if resource:
        out["resource"] = resource
    project["activities"].append(out)
    append_child(project, parent, key)
    return out


def _add_resource_for_object(
    project_root: Path,
    project: dict,
    obj: dict,
    *,
    key: str,
    title: str,
    language: str,
    canonical_path: str,
    asset_entries: list[dict],
    asset_root: Path | None,
    internal_hosts: set[str],
    losses: list[dict],
) -> str | None:
    entry = _entry_for(asset_entries, canonical_path)
    representations: list[dict] = []
    if entry:
        materialized = _materialized_path(entry, asset_root)
        if materialized and materialized.is_file():
            rel = _copy_payload(project_root, materialized, _safe_key("asset", canonical_path, fallback="asset"))
            representations.append({
                "key": "primary",
                "role": str(entry.get("role") or "primary"),
                "source": {"type": "file", "path": rel},
                "mediaType": str(entry.get("mediaType") or mimetypes.guess_type(materialized.name)[0] or "application/octet-stream"),
                "originalName": str(entry.get("originalName") or materialized.name),
            })
        else:
            losses.append({"canonicalPath": canonical_path, "reason": "asset bytes not materialized"})
    if not representations:
        remote = _external_url_from_canonical(obj, internal_hosts)
        if remote:
            representations.append({
                "key": "primary",
                "role": "primary",
                "source": {"type": "remote", "href": remote},
                "mediaType": str((entry or {}).get("mediaType") or "application/octet-stream"),
            })
    if not representations:
        return None
    rkey = _ensure_unique_key(project, _safe_key("res", key, fallback="resource"))
    project["resources"].append({
        "key": rkey,
        "title": _langmap(title, language),
        "representations": representations,
        "extensions": {AULAP2P_EXT: {"canonicalPath": canonical_path}},
    })
    return rkey


def _add_native_questionnaire_resource(
    project_root: Path,
    project: dict,
    quiz: dict,
    *,
    key: str,
    title: str,
    language: str,
    canonical_path: str,
    losses: list[dict],
) -> str | None:
    try:
        payload = questionnaire_from_aulap2p(quiz, language=language)
    except AulaP2PQuestionnaireError as exc:
        losses.append({
            "canonicalPath": canonical_path,
            "reason": f"native questionnaire mapping unavailable: {exc}",
        })
        return None

    generated = project_root / "generated" / "questionnaires"
    generated.mkdir(parents=True, exist_ok=True)
    rel_name = _safe_key("questionnaire", canonical_path, fallback=key) + ".json"
    payload_path = generated / rel_name
    payload_path.write_bytes(_json_bytes(payload))
    rel = payload_path.relative_to(project_root).as_posix()

    rkey = _ensure_unique_key(project, _safe_key("res-native", key, fallback="questionnaire"))
    project["resources"].append({
        "key": rkey,
        "title": _langmap(title, language),
        "representations": [{
            "key": "native-questionnaire",
            "role": "primary",
            "source": {"type": "file", "path": rel},
            "mediaType": NATIVE_QUESTIONNAIRE_MEDIA_TYPE,
            "originalName": rel_name,
            "profile": NATIVE_QUESTIONNAIRE_PROFILE,
            "extensions": {
                AULAP2P_EXT: {
                    "canonicalPath": canonical_path,
                    "generatedFrom": "aulap2p.curso.v1",
                }
            },
        }],
    })
    return rkey


def _add_qti_resource(
    project_root: Path,
    project: dict,
    *,
    key: str,
    title: str,
    language: str,
    canonical_path: str,
    qti_entries: list[dict],
    asset_root: Path | None,
    losses: list[dict],
) -> str | None:
    entry = _entry_for(qti_entries, canonical_path)
    if not entry:
        return None
    materialized = _materialized_path(entry, asset_root)
    if materialized is None or not materialized.is_file():
        losses.append({"canonicalPath": canonical_path, "reason": "QTI package bytes not materialized"})
        return None
    rel = _copy_payload(project_root, materialized, _safe_key("qti", canonical_path, fallback="qti"))
    rkey = _ensure_unique_key(project, _safe_key("res-qti", key, fallback="qti"))
    project["resources"].append({
        "key": rkey,
        "title": _langmap(title, language),
        "representations": [{
            "key": "qti",
            "role": "source",
            "source": {"type": "file", "path": rel},
            "mediaType": str(entry.get("mediaType") or "application/zip"),
            "originalName": str(entry.get("originalName") or materialized.name),
            "profile": QTI_PROFILE,
            "extensions": {AULAP2P_EXT: {"canonicalPath": canonical_path, "sourceVersion": entry.get("sourceVersion")}},
        }],
    })
    return rkey


def ingest_aulap2p_course(
    course_json: Path,
    output: Path,
    *,
    asset_root: Path | None = None,
    language: str = "es",
    strict_profiles: bool = False,
) -> dict:
    course_json = Path(course_json)
    output = Path(output)
    course, envelope = _load_input(course_json)
    if not isinstance(language, str) or not language.strip():
        language = "es"
    language = language.strip()
    internal_hosts = {str(x).lower() for x in envelope.get("internalHosts", []) if isinstance(x, str)}
    asset_entries = _entry_list(envelope, "assets")
    qti_entries = _entry_list(envelope, "qtiPackages")
    tasks = _entry_list(envelope, "tasks")
    _validate_task_sidecars(tasks)
    asset_root = Path(asset_root).resolve() if asset_root else None

    project_root = output.parent / (output.stem + ".p2rln-work")
    if project_root.exists():
        shutil.rmtree(project_root)
    project_root.mkdir(parents=True, exist_ok=True)
    project = _new_project(course, envelope, language, internal_hosts)
    losses: list[dict] = project["provenance"]["losses"]

    portable_keys = envelope.get("portableKeys") if isinstance(envelope.get("portableKeys"), dict) else {}
    path_to_parent: dict[str, str] = {"curso": "course", "course": "course"}
    material_activity_by_path: dict[str, dict] = {}
    activity_by_path: dict[str, dict] = {}
    task_activity_keys: set[str] = set()
    created = {"modules": 0, "lessons": 0, "blocks": 0, "materials": 0, "quizzes": 0, "tasks": 0}

    def pkey(kind: str, path: str, fallback: str) -> str:
        supplied = portable_keys.get(path)
        raw = str(supplied) if supplied else path
        return _safe_key(kind, raw, fallback=fallback)

    def add_material(material: dict, parent_key: str, path: str) -> None:
        title = str(material.get("titulo") or "Material")
        canonical = _portable_material(material, internal_hosts)
        is_task = isinstance(canonical.get("contenido"), dict) and str(canonical["contenido"].get("tipo") or "").upper() == "TAREA"
        kind = "assignment" if is_task else "material"
        activity_type = TYPE_ASSIGNMENT if is_task else TYPE_RESOURCE
        akey = pkey("act", path, "material")
        rkey = _add_resource_for_object(
            project_root, project, material, key=akey, title=title, language=language,
            canonical_path=path, asset_entries=asset_entries, asset_root=asset_root,
            internal_hosts=internal_hosts, losses=losses,
        )
        act = _activity(
            project, key=akey, parent=parent_key, title=title, language=language,
            activity_type=activity_type, kind=kind, canonical=canonical,
            canonical_path=path, resource=rkey,
            extra_ext={"task": {}} if is_task else None,
        )
        material_activity_by_path[path] = act
        activity_by_path[path] = act
        created["materials"] += 1
        if is_task:
            task_activity_keys.add(act["key"])

    def add_quiz(quiz: dict, parent_key: str, path: str) -> None:
        title = str(quiz.get("titulo") or "Cuestionario")
        akey = pkey("act", path, "quiz")
        rkey = _add_qti_resource(
            project_root, project, key=akey, title=title, language=language,
            canonical_path=path, qti_entries=qti_entries, asset_root=asset_root, losses=losses,
        )
        if rkey is None:
            rkey = _add_native_questionnaire_resource(
                project_root, project, quiz, key=akey, title=title, language=language,
                canonical_path=path, losses=losses,
            )
        act = _activity(
            project, key=akey, parent=parent_key, title=title, language=language,
            activity_type=TYPE_ASSESSMENT, kind="assessment",
            canonical=_portable_quiz(quiz, internal_hosts), canonical_path=path,
            resource=rkey,
        )
        activity_by_path[path] = act
        created["quizzes"] += 1

    for mi, module in enumerate(course.get("modulos", [])):
        if not isinstance(module, dict):
            continue
        mpath = f"modulos/{mi}"
        mkey = _ensure_unique_key(project, pkey("unit", mpath, f"module-{mi}"))
        mext = {"kind": "module", "canonicalPath": mpath, "canonical": _portable_value({
            key: module[key] for key in ("orden",) if key in module
        }, internal_hosts)}
        mobj = {
            "key": mkey,
            "role": "module",
            "title": _langmap(module.get("titulo") or f"Modulo {mi + 1}", language),
            "children": [],
            "extensions": {AULAP2P_EXT: mext},
        }
        if module.get("descripcion"):
            mobj["description"] = _langmap(module.get("descripcion"), language)
        project["units"].append(mobj)
        append_child(project, "course", mkey)
        path_to_parent[mpath] = mkey
        created["modules"] += 1

        for li, lesson in enumerate(module.get("lecciones", [])):
            if not isinstance(lesson, dict):
                continue
            lpath = f"{mpath}/lecciones/{li}"
            lkey = _ensure_unique_key(project, pkey("unit", lpath, f"lesson-{mi}-{li}"))
            lext = {"kind": "lesson", "canonicalPath": lpath, "canonical": _portable_value({
                key: lesson[key] for key in ("orden",) if key in lesson
            }, internal_hosts)}
            lobj = {
                "key": lkey,
                "role": "lesson",
                "title": _langmap(lesson.get("titulo") or f"Leccion {li + 1}", language),
                "children": [],
                "extensions": {AULAP2P_EXT: lext},
            }
            if lesson.get("descripcion"):
                lobj["description"] = _langmap(lesson.get("descripcion"), language)
            project["units"].append(lobj)
            append_child(project, mkey, lkey)
            path_to_parent[lpath] = lkey
            created["lessons"] += 1

            for bi, block in enumerate(lesson.get("bloques", [])):
                if not isinstance(block, dict):
                    continue
                bpath = f"{lpath}/bloques/{bi}"
                title = str(block.get("titulo") or block.get("tipo") or f"Bloque {bi + 1}")
                akey = pkey("act", bpath, f"block-{mi}-{li}-{bi}")
                rkey = _add_resource_for_object(
                    project_root, project, block, key=akey, title=title, language=language,
                    canonical_path=bpath, asset_entries=asset_entries, asset_root=asset_root,
                    internal_hosts=internal_hosts, losses=losses,
                )
                act = _activity(
                    project, key=akey, parent=lkey, title=title, language=language,
                    activity_type=TYPE_RESOURCE, kind="block",
                    canonical=_portable_block(block, internal_hosts), canonical_path=bpath,
                    resource=rkey,
                )
                activity_by_path[bpath] = act
                created["blocks"] += 1

            for ri, material in enumerate(lesson.get("materiales", [])):
                if isinstance(material, dict):
                    add_material(material, lkey, f"{lpath}/materiales/{ri}")
            for qi, quiz in enumerate(lesson.get("cuestionarios", [])):
                if isinstance(quiz, dict):
                    add_quiz(quiz, lkey, f"{lpath}/cuestionarios/{qi}")

    for ri, material in enumerate(course.get("materiales", [])):
        if isinstance(material, dict):
            add_material(material, "course", f"materiales/{ri}")
    for qi, quiz in enumerate(course.get("cuestionarios", [])):
        if isinstance(quiz, dict):
            add_quiz(quiz, "course", f"cuestionarios/{qi}")

    for index, task in enumerate(tasks):
        tpath = str(task.get("canonicalPath") or f"tasks/{index}")
        task_spec = _task_portable(task, internal_hosts)
        material_path = str(task.get("materialPath") or "")
        parent_path = str(task.get("parentPath") or "course")
        parent_key = path_to_parent.get(parent_path, "course" if parent_path in {"course", "curso", ""} else "")
        if material_path:
            act = material_activity_by_path.get(material_path)
            if act is None:
                losses.append({"canonicalPath": tpath, "reason": f"task materialPath not found: {material_path}"})
                continue
            ext = act.setdefault("extensions", {}).setdefault(AULAP2P_EXT, {})
            act["activityType"] = TYPE_ASSIGNMENT
            ext["kind"] = "assignment"
            ext["task"] = task_spec
            ext["taskPath"] = tpath
            ext["materialPath"] = material_path
            if parent_path:
                ext["parentPath"] = parent_path
            task_activity_keys.add(act["key"])
            continue
        if not parent_key:
            losses.append({"canonicalPath": tpath, "reason": f"task parentPath not found: {parent_path}"})
            continue
        title = str(task_spec.get("titulo") or "Tarea")
        canonical = {"titulo": title, "descripcion": task_spec.get("descripcion"), "contenido": {"tipo": "TAREA"}}
        canonical = {k: v for k, v in canonical.items() if v is not None}
        act = _activity(
            project,
            key=pkey("act", tpath, f"task-{index}"),
            parent=parent_key,
            title=title,
            language=language,
            activity_type=TYPE_ASSIGNMENT,
            kind="assignment",
            canonical=canonical,
            canonical_path=tpath,
            extra_ext={"task": task_spec, "taskPath": tpath, "parentPath": parent_path},
        )
        activity_by_path[tpath] = act
        task_activity_keys.add(act["key"])

    created["tasks"] = len(task_activity_keys)
    project_path = project_root / "p2rln.project.json"
    save_project(project_path, project)
    result = build_project(project_root, output, strict_profiles=strict_profiles)
    result.update({
        "sourceSchema": AULAP2P_COURSE_SCHEMA,
        "created": created,
        "losses": copy.deepcopy(losses),
    })
    return result


def _read_package(package: Path) -> tuple[dict, dict, dict[str, bytes]]:
    validation = p2_validator.validate_package(package)
    with zipfile.ZipFile(package, "r") as zf:
        manifest = json.loads(zf.read("META-INF/manifest.json"))
        graph = json.loads(zf.read("content/graph.json"))
        payloads = {name: zf.read(name) for name in zf.namelist() if not name.endswith("/")}
    return manifest, graph, {**payloads, "__validation__": _json_bytes(validation)}


def _title(entity: dict, language: str = "es") -> str:
    value = entity.get("title")
    if isinstance(value, dict):
        if language in value:
            return str(value[language])
        if value:
            return str(next(iter(value.values())))
    return str(value or "")


def _description(entity: dict, language: str = "es") -> str | None:
    value = entity.get("description")
    if isinstance(value, dict):
        if language in value:
            return str(value[language])
        if value:
            return str(next(iter(value.values())))
    if isinstance(value, str):
        return value
    return None


def extract_aulap2p_course(package: Path, output_json: Path) -> dict:
    package = Path(package)
    output_json = Path(output_json)
    manifest, graph, payloads = _read_package(package)
    entities = {str(x.get("id")): x for x in graph.get("entities", []) if isinstance(x, dict) and x.get("id")}
    entry = next((x for x in manifest.get("entrypoints", []) if x.get("role") == "primary" and x.get("type") == "course"), None)
    if not entry or str(entry.get("id")) not in entities:
        raise AulaP2PCourseError("P2RLN package has no primary Course entrypoint")
    course_entity = entities[str(entry["id"])]
    cext = (course_entity.get("extensions") or {}).get(AULAP2P_EXT)
    if not isinstance(cext, dict) or cext.get("sourceSchema") != AULAP2P_COURSE_SCHEMA:
        raise AulaP2PCourseError("P2RLN package is not an AulaP2P course bridge package")

    course_meta = copy.deepcopy(cext.get("canonical") if isinstance(cext.get("canonical"), dict) else {})
    course_meta["titulo"] = _title(course_entity)
    desc = _description(course_entity)
    if desc:
        course_meta.setdefault("descripcion", desc)
    course_meta.setdefault("revision", course_entity.get("revision", 1))
    canonical: dict[str, Any] = {
        "version": AULAP2P_COURSE_SCHEMA,
        "curso": course_meta,
        "modulos": [],
        "materiales": [],
        "cuestionarios": [],
    }
    assets: list[dict] = []
    qti_packages: list[dict] = []
    tasks: list[dict] = []
    portable_ids: dict[str, str] = {}
    path_map: dict[str, dict] = {}

    def representations_for(activity: dict, canonical_path: str) -> None:
        rid = activity.get("resource")
        resource = entities.get(str(rid)) if rid else None
        if not resource:
            return
        for rep in resource.get("representations", []):
            if not isinstance(rep, dict):
                continue
            loc = rep.get("location") if isinstance(rep.get("location"), dict) else {}
            if loc.get("type") == "embedded" and isinstance(loc.get("path"), str):
                descriptor = {
                    "canonicalPath": canonical_path,
                    "packagePath": loc["path"],
                    "mediaType": rep.get("mediaType"),
                    "originalName": rep.get("originalName"),
                    "role": rep.get("role"),
                }
                if rep.get("profile") == QTI_PROFILE:
                    ext = (rep.get("extensions") or {}).get(AULAP2P_EXT) if isinstance(rep.get("extensions"), dict) else None
                    if isinstance(ext, dict) and ext.get("sourceVersion") is not None:
                        descriptor["sourceVersion"] = ext.get("sourceVersion")
                    qti_packages.append(descriptor)
                elif rep.get("profile") == NATIVE_QUESTIONNAIRE_PROFILE:
                    # This representation is generated from the canonical quiz. It is
                    # not an AulaP2P source asset and must not reappear as one on round-trip.
                    continue
                else:
                    assets.append(descriptor)
            elif loc.get("type") == "remote" and isinstance(loc.get("href"), str):
                assets.append({
                    "canonicalPath": canonical_path,
                    "remoteUrl": loc["href"],
                    "mediaType": rep.get("mediaType"),
                    "role": rep.get("role"),
                })

    def canonical_from_activity(entity: dict) -> dict:
        ext = (entity.get("extensions") or {}).get(AULAP2P_EXT)
        if not isinstance(ext, dict):
            return {}
        obj = copy.deepcopy(ext.get("canonical") if isinstance(ext.get("canonical"), dict) else {})
        if "titulo" not in obj:
            obj["titulo"] = _title(entity)
        if "descripcion" not in obj:
            desc_value = _description(entity)
            if desc_value:
                obj["descripcion"] = desc_value
        return obj

    def walk(parent_id: str, parent_kind: str, parent_obj: dict | None) -> None:
        parent = entities.get(parent_id)
        if not parent:
            return
        for child_id in parent.get("children", []):
            child = entities.get(str(child_id))
            if not child:
                continue
            ext = (child.get("extensions") or {}).get(AULAP2P_EXT) if isinstance(child.get("extensions"), dict) else None
            if not isinstance(ext, dict):
                continue
            kind = str(ext.get("kind") or "")
            path = str(ext.get("canonicalPath") or ext.get("taskPath") or "")
            if path:
                portable_ids[path] = str(child.get("id"))
            if child.get("type") == "unit" and kind == "module":
                mod = copy.deepcopy(ext.get("canonical") if isinstance(ext.get("canonical"), dict) else {})
                mod["titulo"] = _title(child)
                desc_mod = _description(child)
                if desc_mod:
                    mod["descripcion"] = desc_mod
                mod["lecciones"] = []
                canonical["modulos"].append(mod)
                path_map[path] = mod
                walk(str(child["id"]), "module", mod)
                continue
            if child.get("type") == "unit" and kind == "lesson":
                lesson = copy.deepcopy(ext.get("canonical") if isinstance(ext.get("canonical"), dict) else {})
                lesson["titulo"] = _title(child)
                desc_lesson = _description(child)
                if desc_lesson:
                    lesson["descripcion"] = desc_lesson
                lesson["bloques"] = []
                lesson["materiales"] = []
                lesson["cuestionarios"] = []
                if parent_kind == "module" and parent_obj is not None:
                    parent_obj.setdefault("lecciones", []).append(lesson)
                path_map[path] = lesson
                walk(str(child["id"]), "lesson", lesson)
                continue
            if child.get("type") != "activity":
                continue
            obj = canonical_from_activity(child)
            representations_for(child, path)
            if kind == "block":
                if parent_kind == "lesson" and parent_obj is not None:
                    parent_obj.setdefault("bloques", []).append(obj)
            elif kind in {"material", "assignment"}:
                if parent_kind == "lesson" and parent_obj is not None:
                    parent_obj.setdefault("materiales", []).append(obj)
                else:
                    canonical["materiales"].append(obj)
                if kind == "assignment":
                    task_data = copy.deepcopy(ext.get("task") if isinstance(ext.get("task"), dict) else {})
                    task_data.setdefault("titulo", obj.get("titulo") or _title(child))
                    if obj.get("descripcion") is not None:
                        task_data.setdefault("descripcion", obj.get("descripcion"))
                    task_data["canonicalPath"] = str(ext.get("taskPath") or path or "")
                    contenido = obj.get("contenido")
                    is_material_task = isinstance(contenido, dict) and str(contenido.get("tipo") or "").upper() == "TAREA"
                    if ext.get("materialPath") or is_material_task:
                        task_data["materialPath"] = str(ext.get("materialPath") or path)
                    if ext.get("parentPath"):
                        task_data["parentPath"] = str(ext.get("parentPath"))
                    tasks.append(task_data)
            elif kind == "assessment":
                if parent_kind == "lesson" and parent_obj is not None:
                    parent_obj.setdefault("cuestionarios", []).append(obj)
                else:
                    canonical["cuestionarios"].append(obj)

    walk(str(course_entity["id"]), "course", None)
    creator_ext = (graph.get("extensions") or {}).get("org.p2rln.creator") if isinstance(graph.get("extensions"), dict) else None
    project_id = creator_ext.get("projectId") if isinstance(creator_ext, dict) else None
    result = {
        "schema": AULAP2P_COURSE_IMPORT,
        "course": canonical,
        "assets": assets,
        "qtiPackages": qti_packages,
        "tasks": tasks,
        "identity": {
            "projectId": project_id,
            "packageId": manifest.get("packageId"),
            "contentRoot": (manifest.get("integrity") or {}).get("contentRoot"),
            "portableEntityIds": portable_ids,
        },
    }
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "input": str(package),
        "output": str(output_json),
        "schema": AULAP2P_COURSE_IMPORT,
        "modules": len(canonical["modulos"]),
        "materials": len(canonical["materiales"]) + sum(len(l.get("materiales", [])) for m in canonical["modulos"] for l in m.get("lecciones", [])),
        "quizzes": len(canonical["cuestionarios"]) + sum(len(l.get("cuestionarios", [])) for m in canonical["modulos"] for l in m.get("lecciones", [])),
        "tasks": len(tasks),
        "assets": len(assets),
        "qtiPackages": len(qti_packages),
    }
