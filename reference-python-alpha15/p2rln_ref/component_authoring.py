from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

from .native_component import validate_component_instance

SCHEMA_DIR = Path(__file__).resolve().parent / "schemas"
CATALOG_PATH = Path(__file__).resolve().parent / "component-catalog.json"
CATALOG_SCHEMA_ID = "https://p2rln.org/schema/component-catalog/0.1"
EDITOR_SCHEMA_ID = "https://p2rln.org/schema/component-editor/0.1"


class ComponentAuthoringError(ValueError):
    pass


def _schema(name: str) -> dict[str, Any]:
    return json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))


def _validation_error(prefix: str, errors) -> ComponentAuthoringError:
    lines: list[str] = []
    for error in list(errors)[:20]:
        path = "/".join(str(item) for item in error.absolute_path) or "$"
        lines.append(f"{path}: {error.message}")
    return ComponentAuthoringError(prefix + ("\n" + "\n".join(lines) if lines else ""))


@lru_cache(maxsize=1)
def _documents_by_id() -> dict[str, dict[str, Any]]:
    documents: dict[str, dict[str, Any]] = {}
    for path in sorted(SCHEMA_DIR.glob("*.json")):
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        identifier = document.get("$id") or document.get("id")
        if isinstance(identifier, str) and identifier:
            if identifier in documents:
                raise ComponentAuthoringError(f"duplicate reference document id: {identifier}")
            documents[identifier] = document
    return documents


def resolve_reference_document(identifier: str) -> dict[str, Any]:
    try:
        return _documents_by_id()[identifier]
    except KeyError as exc:
        raise ComponentAuthoringError(f"reference document is not installed: {identifier}") from exc


class ReferenceComponentCatalog:
    def __init__(self, document: dict[str, Any] | None = None) -> None:
        self.document = document or json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        catalog_schema = resolve_reference_document(CATALOG_SCHEMA_ID)
        validator = Draft202012Validator(catalog_schema, format_checker=FormatChecker())
        errors = sorted(validator.iter_errors(self.document), key=lambda e: list(e.absolute_path))
        if errors:
            raise _validation_error("invalid reference component catalog:", errors)
        self._definitions: dict[tuple[str, str], dict[str, Any]] = {}
        for definition in self.document["components"]:
            key = (definition["id"], definition["componentVersion"])
            if key in self._definitions:
                raise ComponentAuthoringError(f"duplicate component definition: {key[0]} @ {key[1]}")
            self._validate_definition(definition)
            self._definitions[key] = definition

    def _validate_definition(self, definition: dict[str, Any]) -> None:
        authoring_version = definition["authoringDataVersion"]
        data_schemas = definition["dataSchemas"]
        editor_schemas = definition["editorSchemas"]
        if authoring_version not in data_schemas:
            raise ComponentAuthoringError(
                f"component {definition['id']} authoringDataVersion {authoring_version} has no data schema"
            )
        if authoring_version not in editor_schemas:
            raise ComponentAuthoringError(
                f"component {definition['id']} authoringDataVersion {authoring_version} has no editor schema"
            )
        for version, identifier in data_schemas.items():
            schema = resolve_reference_document(identifier)
            if schema.get("$id") != identifier:
                raise ComponentAuthoringError(f"data schema id mismatch: {identifier}")
            Draft202012Validator.check_schema(schema)
        editor_meta_schema = resolve_reference_document(EDITOR_SCHEMA_ID)
        editor_validator = Draft202012Validator(editor_meta_schema, format_checker=FormatChecker())
        for version, identifier in editor_schemas.items():
            editor = resolve_reference_document(identifier)
            errors = sorted(editor_validator.iter_errors(editor), key=lambda e: list(e.absolute_path))
            if errors:
                raise _validation_error(f"invalid component editor document {identifier}:", errors)
            component = editor["component"]
            if (
                component["id"] != definition["id"]
                or component["componentVersion"] != definition["componentVersion"]
                or component["dataVersion"] != version
            ):
                raise ComponentAuthoringError(f"editor/component identity mismatch: {identifier}")
            expected_data_schema = data_schemas.get(version)
            if editor["dataSchema"] != expected_data_schema:
                raise ComponentAuthoringError(f"editor dataSchema mismatch: {identifier}")

    def definition(self, component_id: str, component_version: str) -> dict[str, Any] | None:
        value = self._definitions.get((component_id, component_version))
        return json.loads(json.dumps(value)) if value is not None else None

    def list(self) -> list[dict[str, Any]]:
        return [json.loads(json.dumps(item)) for item in self.document["components"]]

    def authoring_documents(self, component_id: str, component_version: str) -> dict[str, Any]:
        definition = self.definition(component_id, component_version)
        if definition is None:
            raise ComponentAuthoringError(f"component is not in reference catalog: {component_id} @ {component_version}")
        version = definition["authoringDataVersion"]
        return {
            "definition": definition,
            "dataVersion": version,
            "dataSchema": resolve_reference_document(definition["dataSchemas"][version]),
            "editorSchema": resolve_reference_document(definition["editorSchemas"][version]),
        }

    def validate_instance_data(self, instance: object, *, require_known: bool = True) -> dict[str, Any]:
        validated = validate_component_instance(instance)
        component = validated["component"]
        definition = self.definition(component["id"], component["componentVersion"])
        if definition is None:
            if require_known:
                raise ComponentAuthoringError(
                    f"component is not in reference catalog: {component['id']} @ {component['componentVersion']}"
                )
            return {"known": False, "instance": validated}
        if component["runtimeContractVersion"] != definition["runtimeContractVersion"]:
            raise ComponentAuthoringError(
                f"component runtime contract {component['runtimeContractVersion']} does not match catalog contract {definition['runtimeContractVersion']}"
            )
        data_schema_id = definition["dataSchemas"].get(component["dataVersion"])
        if not data_schema_id:
            raise ComponentAuthoringError(
                f"catalog has no data schema for {component['id']} data version {component['dataVersion']}"
            )
        data_schema = resolve_reference_document(data_schema_id)
        validator = Draft202012Validator(data_schema, format_checker=FormatChecker())
        errors = sorted(validator.iter_errors(validated["data"]), key=lambda e: list(e.absolute_path))
        if errors:
            raise _validation_error(f"invalid data for {component['id']} data version {component['dataVersion']}:", errors)
        declared = validated.get("schemas") or {}
        if declared.get("data") and declared["data"] != data_schema_id:
            raise ComponentAuthoringError(
                f"instance declares data schema {declared['data']} but catalog expects {data_schema_id}"
            )
        return {
            "known": True,
            "instance": validated,
            "definition": definition,
            "dataSchema": data_schema,
        }


@lru_cache(maxsize=1)
def reference_component_catalog() -> ReferenceComponentCatalog:
    return ReferenceComponentCatalog()
