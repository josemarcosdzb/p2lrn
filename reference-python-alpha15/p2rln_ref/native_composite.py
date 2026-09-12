from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

PROFILE = "https://p2rln.org/profile/native-composite"
MEDIA_TYPE = "application/vnd.p2rln.composite+json"
SCHEMA_ID = "https://p2rln.org/schema/native-composite/0.1"
ACTIVITY_TYPE = "https://p2rln.org/type/composite"
STATE_VERSION = "p2rln-composite-state/0.1"

_SCHEMA_PATH = Path(__file__).resolve().parent / "schemas" / "native-composite.schema.json"


class NativeCompositeError(ValueError):
    pass


def validate_composite(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise NativeCompositeError("composite payload must be an object")
    schema = json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.absolute_path))
    if errors:
        lines: list[str] = []
        for error in errors[:20]:
            path = "/".join(str(v) for v in error.absolute_path) or "$"
            lines.append(f"{path}: {error.message}")
        raise NativeCompositeError("invalid native composite:\n" + "\n".join(lines))
    value = dict(payload)
    if value.get("mode") == "sequence":
        if value.get("navigation") not in (None, "linear"):
            raise NativeCompositeError("sequence mode requires linear navigation")
        value.setdefault("navigation", "linear")
    if value.get("mode") == "free":
        if value.get("navigation") not in (None, "open"):
            raise NativeCompositeError("free mode requires open navigation")
        value.setdefault("navigation", "open")
    return value
