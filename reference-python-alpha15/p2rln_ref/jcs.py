"""Small RFC 8785 JSON Canonicalization Scheme implementation for P2RLN.

The serializer is intentionally limited to I-JSON values already validated by
P2RLN. Number serialization follows ECMAScript JSON.stringify thresholds and
shortest round-trip spelling, which is the numeric form required by RFC 8785.
"""
from __future__ import annotations

import json
import math
import re
from typing import Any


def _number(value: int | float) -> str:
    if isinstance(value, bool):
        raise TypeError("bool is not a JSON number here")
    if isinstance(value, int):
        return str(value)
    if not math.isfinite(value):
        raise ValueError("JCS forbids non-finite numbers")
    if value == 0:
        return "0"

    negative = value < 0
    absolute = -value if negative else value
    text = repr(absolute)
    if "e" in text or "E" in text:
        coefficient, exponent_text = re.split("[eE]", text)
        exponent = int(exponent_text)
        digits = coefficient.replace(".", "")
        fraction = len(coefficient.split(".", 1)[1]) if "." in coefficient else 0
        decimal_exponent = exponent - fraction
    else:
        digits = text.replace(".", "")
        fraction = len(text.split(".", 1)[1]) if "." in text else 0
        decimal_exponent = -fraction

    digits = digits.lstrip("0") or "0"
    while len(digits) > 1 and digits.endswith("0"):
        digits = digits[:-1]
        decimal_exponent += 1

    point = len(digits) + decimal_exponent
    if absolute >= 1e21 or absolute < 1e-6:
        mantissa = digits if len(digits) == 1 else digits[0] + "." + digits[1:]
        exponent = point - 1
        rendered = mantissa + "e" + ("+" if exponent >= 0 else "") + str(exponent)
    else:
        if point <= 0:
            rendered = "0." + "0" * (-point) + digits
        elif point >= len(digits):
            rendered = digits + "0" * (point - len(digits))
        else:
            rendered = digits[:point] + "." + digits[point:]
    return ("-" if negative else "") + rendered


def _string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def canonicalize(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return _number(value)
    if isinstance(value, str):
        return _string(value)
    if isinstance(value, list):
        return "[" + ",".join(canonicalize(v) for v in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value, key=lambda s: s.encode("utf-16-be"))
        return "{" + ",".join(_string(k) + ":" + canonicalize(value[k]) for k in keys) + "}"
    raise TypeError(f"unsupported JSON value: {type(value).__name__}")


def canonicalize_bytes(value: Any) -> bytes:
    return canonicalize(value).encode("utf-8")
