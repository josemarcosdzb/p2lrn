from __future__ import annotations

import hashlib
import html
import json
import mimetypes
import re
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any

from .builder import build_project
from .project import PROJECT_FILE, add_file, add_unit, new_project, save_project

AULAP2P_DOCUMENT_SCHEMA = "aulap2p.documento.extraido.v2"
AULAP2P_MULTIMODAL_SCHEMA = "aulap2p.documento.multimodal.v2"
BRIDGE_SCHEMA = "p2rln.aulap2p-reader-envelope.v1"
PROVENANCE_NS = "https://p2rln.org/ext/provenance"


class AulaP2PIngestError(ValueError):
    pass


def _json_digest(value: Any) -> str:
    data = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def _safe_key(value: str, fallback: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip("-._")
    return (value[:80] or fallback)


def _lang(document: dict, explicit: str | None) -> str:
    value = explicit or (document.get("metadatos") or {}).get("idiomaDetectado") or "es"
    value = str(value).strip().replace("_", "-")
    return value if re.match(r"^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$", value) else "es"


def _title(document: dict, source_file: Path | None) -> str:
    metadata = document.get("metadatos") or {}
    origin = document.get("origen") or {}
    return str(metadata.get("tituloDetectado") or origin.get("nombreArchivo") or (source_file.name if source_file else "Documento importado"))


def _provenance_from_node(node: dict) -> dict:
    out: dict[str, Any] = {
        "sourceNodeId": node.get("id"),
        "sourceType": node.get("tipo"),
        "order": node.get("orden"),
    }
    for src, dst in (("pagina", "page"), ("diapositiva", "slide"), ("hoja", "sheet"), ("bbox", "boundingBox"), ("confianza", "confidence")):
        if node.get(src) is not None:
            out[dst] = node[src]
    proc = node.get("procedencia")
    if isinstance(proc, dict):
        out["extraction"] = {k: v for k, v in proc.items() if k != "raw"}
    return out


def _provenance_from_block(block: dict) -> dict:
    out: dict[str, Any] = {
        "sourceNodeId": block.get("tempId"),
        "sourceType": block.get("tipo"),
        "order": block.get("orden"),
    }
    for src, dst in (("pagina", "page"), ("hoja", "sheet"), ("posicion", "boundingBox")):
        if block.get(src) is not None:
            out[dst] = block[src]
    fuente = block.get("fuente")
    if isinstance(fuente, dict):
        out["sourceFormat"] = fuente.get("tipo")
        raw = fuente.get("raw")
        if isinstance(raw, dict):
            # Keep useful source coordinates/labels, never local persistence identity.
            allowed = {k: raw[k] for k in ("rutaArchivo", "formatoAsset", "documentoOrigen", "slide", "pagina") if k in raw}
            if allowed:
                out["sourceHints"] = allowed
    return out


def _ordered_items(document: dict) -> list[tuple[dict, str]]:
    multimodal = document.get("secuenciaMultimodal")
    if not isinstance(multimodal, dict) or multimodal.get("version") != AULAP2P_MULTIMODAL_SCHEMA:
        raise AulaP2PIngestError(
            f"{AULAP2P_DOCUMENT_SCHEMA} requires {AULAP2P_MULTIMODAL_SCHEMA}"
        )
    nodes = [n for n in multimodal.get("nodos", []) if isinstance(n, dict)]
    return [(n, "multimodal") for n in sorted(nodes, key=lambda n: (n.get("orden", 0), str(n.get("id", ""))))]


def _render_text_fragment(item: dict, mode: str, language: str) -> str | None:
    text = item.get("texto")
    if not isinstance(text, str) or not text.strip():
        return None
    kind = str(item.get("tipo") or "PARRAFO").upper()
    escaped = html.escape(text.strip())
    tag = "p"
    if kind == "TITULO": tag = "h1"
    elif kind in {"SUBTITULO"}: tag = "h2"
    elif kind == "LISTA": tag = "p"
    elif kind == "PREGUNTA": tag = "blockquote"
    elif kind == "SOLUCION": tag = "aside"
    return f'<!doctype html><html lang="{html.escape(language)}"><meta charset="utf-8"><body><{tag}>{escaped}</{tag}></body></html>\n'


def _asset_index(envelope: dict, asset_root: Path | None) -> dict[str, Path]:
    result: dict[str, Path] = {}
    for asset in envelope.get("assets", []) or []:
        if not isinstance(asset, dict):
            continue
        raw_path = asset.get("path")
        if not isinstance(raw_path, str) or not raw_path:
            continue
        path = Path(raw_path)
        if not path.is_absolute() and asset_root:
            path = asset_root / path
        if not path.is_file():
            continue
        for key in (asset.get("sourceNodeId"), asset.get("blockTempId"), asset.get("archivoId"), asset.get("sourceLocalId")):
            if key is not None:
                result[str(key)] = path
    return result


def _image_path(item: dict, asset_index: dict[str, Path]) -> Path | None:
    candidates = [item.get("id"), item.get("tempId"), item.get("archivoId")]
    archivo = item.get("archivo")
    if isinstance(archivo, dict):
        candidates.append(archivo.get("id"))
    for key in candidates:
        if key is not None and str(key) in asset_index:
            return asset_index[str(key)]
    return None


def _add_provenance(entity: dict, provenance: dict) -> None:
    entity.setdefault("extensions", {})[PROVENANCE_NS] = provenance


def ingest_aulap2p_reader(
    input_json: Path,
    output: Path,
    *,
    source_file: Path | None = None,
    asset_root: Path | None = None,
    language: str | None = None,
    strict_profiles: bool = False,
) -> dict:
    input_json = Path(input_json)
    try:
        raw = json.loads(input_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AulaP2PIngestError(f"invalid AulaP2P Reader JSON: {exc}") from exc

    if raw.get("schema") == BRIDGE_SCHEMA:
        envelope = raw
        document = envelope.get("document")
    elif raw.get("version") == AULAP2P_DOCUMENT_SCHEMA:
        envelope = {"schema": BRIDGE_SCHEMA, "document": raw, "assets": []}
        document = raw
    else:
        raise AulaP2PIngestError(
            f"expected {AULAP2P_DOCUMENT_SCHEMA} or {BRIDGE_SCHEMA}"
        )
    if not isinstance(document, dict) or document.get("version") != AULAP2P_DOCUMENT_SCHEMA:
        raise AulaP2PIngestError("envelope does not contain a valid DocumentoExtraidoCanonico")
    required_objects = ("origen", "metadatos", "procedenciaExtraccion")
    for field in required_objects:
        if not isinstance(document.get(field), dict):
            raise AulaP2PIngestError(f"canonical document requires object field: {field}")
    for field in ("bloques", "tablas", "advertencias"):
        if not isinstance(document.get(field), list):
            raise AulaP2PIngestError(f"canonical document requires array field: {field}")
    # This is intentionally required at the bridge boundary. Legacy reader
    # payloads must be normalized inside AulaP2P before P2LRN sees them.
    _ordered_items(document)

    source_file = Path(source_file) if source_file else None
    if source_file and not source_file.is_file():
        raise AulaP2PIngestError(f"source file not found: {source_file}")

    source_digest = hashlib.sha256(source_file.read_bytes()).hexdigest() if source_file else _json_digest(document)
    lang = _lang(document, language)
    title = _title(document, source_file)
    items = _ordered_items(document)
    assets = _asset_index(envelope, Path(asset_root) if asset_root else None)

    with tempfile.TemporaryDirectory(prefix="p2rln-aulap2p-") as td:
        root = Path(td)
        project = new_project(title, lang, "Imported through the AulaP2P canonical document reader")
        project["projectVersion"] = "0.2.0"
        project["projectId"] = "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, f"p2rln:aulap2p-reader:{source_digest}"))
        project["provenance"] = {
            "schema": "p2rln.transformation.v1",
            "source": {
                "adapter": "AulaP2PReaderAdapter",
                "documentSchema": AULAP2P_DOCUMENT_SCHEMA,
                "multimodalSchema": ((document.get("secuenciaMultimodal") or {}).get("version")),
                "detectedFormat": (document.get("origen") or {}).get("tipoArchivoDetectado"),
                "extractionStrategy": (document.get("origen") or {}).get("estrategiaExtraccion"),
                "sha256": f"sha256:{source_digest}",
            },
            "warnings": [w for w in document.get("advertencias", []) if isinstance(w, dict)],
            "losses": [],
            "rules": [
                "Prisma/local IDs are never exported as portable identity",
                "internal AulaP2P URLs are never converted into remote P2RLN locations",
                "source coordinates and extraction confidence are preserved as provenance",
                "PREGUNTA/SOLUCION document nodes are content evidence only; native assessments require reconciled aulap2p.curso.v1 questionnaires",
            ],
        }

        add_unit(project, "document", title, lang, "document", "course")
        generated = root / "generated"
        generated.mkdir(parents=True, exist_ok=True)
        unresolved_images = 0
        created = 0

        for index, (item, mode) in enumerate(items, 1):
            kind = str(item.get("tipo") or "PARRAFO").upper()
            source_id = str(item.get("id") or item.get("tempId") or f"item-{index}")
            key_base = _safe_key(f"{index:04d}-{kind.lower()}-{hashlib.sha1(source_id.encode()).hexdigest()[:8]}", f"item-{index}")
            provenance = _provenance_from_node(item) if mode == "multimodal" else _provenance_from_block(item)

            if kind in {"IMAGEN", "IMAGEN_REFERENCIADA", "GRAFICO"}:
                image = _image_path(item, assets)
                if image:
                    resource, activity = add_file(
                        root, project, image, key_base, str(item.get("texto") or image.name),
                        language=lang, parent="document",
                        media_type=mimetypes.guess_type(image.name)[0] or "application/octet-stream",
                        role="primary", activity_type="https://p2rln.org/type/resource", copy_file=True,
                    )
                    _add_provenance(resource, provenance)
                    _add_provenance(activity, provenance)
                    created += 1
                else:
                    unresolved_images += 1
                continue

            fragment = _render_text_fragment(item, mode, lang)
            if fragment is None:
                continue
            file_path = generated / f"{key_base}.html"
            file_path.write_text(fragment, encoding="utf-8")
            # DocumentoExtraidoCanonico is documentary evidence, not the
            # pedagogical authority for quizzes. PREGUNTA/SOLUCION remain
            # passive resources here; native P2RLN assessments are created
            # only by aulap2p_course.py from reconciled aulap2p.curso.v1.
            activity_type = "https://p2rln.org/type/resource"
            resource, activity = add_file(
                root, project, file_path, key_base, str(item.get("texto") or kind)[:160],
                language=lang, parent="document", media_type="text/html",
                profile="https://p2rln.org/profile/web-content", role="primary",
                activity_type=activity_type, copy_file=False,
            )
            _add_provenance(resource, provenance)
            _add_provenance(activity, provenance)
            created += 1

        if source_file:
            source_copy = root / "source" / source_file.name
            source_copy.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_file, source_copy)
            resource = {
                "key": "res-original-source",
                "title": {lang: f"Fuente original: {source_file.name}"},
                "representations": [{
                    "key": "source",
                    "role": "source",
                    "mediaType": mimetypes.guess_type(source_file.name)[0] or "application/octet-stream",
                    "originalName": source_file.name,
                    "source": {"type": "file", "path": source_copy.relative_to(root).as_posix()},
                }],
            }
            _add_provenance(resource, {"role": "original-source", "sha256": f"sha256:{source_digest}"})
            project["resources"].append(resource)

        if unresolved_images:
            project["provenance"]["warnings"].append({
                "ruta": "assets",
                "nivel": "ADVERTENCIA",
                "mensaje": f"{unresolved_images} image node(s) had only local AulaP2P references and were not exported without materialized bytes.",
            })
            project["provenance"]["losses"].append({
                "kind": "unresolved-local-asset",
                "count": unresolved_images,
                "reason": "portable bytes were not supplied by the bridge",
            })

        save_project(root / PROJECT_FILE, project)
        result = build_project(root, Path(output), strict_profiles=strict_profiles)
        result.update({
            "ingestion": "aulap2p-reader",
            "sourceDocumentSchema": document["version"],
            "sourceItems": len(items),
            "createdActivities": created,
            "unresolvedImages": unresolved_images,
            "sourcePreserved": bool(source_file),
        })
        return result
