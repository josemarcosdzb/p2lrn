from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

PROFILE = "https://p2rln.org/profile/native-component"
MEDIA_TYPE = "application/vnd.p2rln.component+json"
SCHEMA_ID = "https://p2rln.org/schema/native-component/0.1"
ACTIVITY_TYPE = "https://p2rln.org/type/component"
RUNTIME_CONTRACT_VERSION = "1"

_SCHEMA_PATH = Path(__file__).resolve().parent / "schemas" / "native-component.schema.json"


class NativeComponentError(ValueError):
    pass


def validate_component_instance(payload: object) -> dict:
    """Validate the portable component-instance document only.

    Runtime compatibility is deliberately not part of format validity.  A
    reader that only implements Host Contract 1 must still be able to validate
    and preserve a syntactically valid future instance that declares contract 2.
    Delivery compatibility is negotiated separately by the Component Registry.
    """
    if not isinstance(payload, dict):
        raise NativeComponentError("component instance payload must be an object")
    schema = json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.absolute_path))
    if errors:
        lines: list[str] = []
        for error in errors[:20]:
            path = "/".join(str(v) for v in error.absolute_path) or "$"
            lines.append(f"{path}: {error.message}")
        raise NativeComponentError("invalid native component instance:\n" + "\n".join(lines))
    return dict(payload)


def require_runtime_contract(payload: object, expected: str = RUNTIME_CONTRACT_VERSION) -> dict:
    validated = validate_component_instance(payload)
    actual = validated["component"]["runtimeContractVersion"]
    if actual != expected:
        raise NativeComponentError(
            f"runtimeContractVersion {actual!r} is not supported by this runtime; expected {expected!r}"
        )
    return validated
