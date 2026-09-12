from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
import zipfile
from typing import Iterable

from jsonschema import Draft202012Validator, FormatChecker

from .jcs import canonicalize_bytes
from .validator import SCHEMA_DIR, ValidationFailure, load_json_bytes, validate_package

SIGNATURE_SCHEMA_ID = "https://p2rln.org/schema/detached-signature/1"
SIGNATURE_INPUT_SCHEMA_ID = "https://p2rln.org/schema/detached-signature-input/1"
KEY_ID_PREFIX = "urn:p2rln:key:ed25519:sha256:"


class DetachedSignatureError(ValueError):
    pass


def _crypto():
    try:
        from cryptography.exceptions import InvalidSignature
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
    except ImportError as exc:  # pragma: no cover - exercised in installations without the optional extra
        raise DetachedSignatureError(
            "Ed25519 support requires the optional trust dependency: pip install 'p2rln-toolkit[trust]'"
        ) from exc
    return InvalidSignature, serialization, Ed25519PrivateKey, Ed25519PublicKey


def _b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64u(value: str) -> bytes:
    if not isinstance(value, str):
        raise DetachedSignatureError("base64url value must be a string")
    padding = "=" * ((4 - len(value) % 4) % 4)
    try:
        return base64.b64decode(value + padding, altchars=b"-_", validate=True)
    except Exception as exc:
        raise DetachedSignatureError("invalid base64url value") from exc


def _raw_public(public_key) -> bytes:
    _, serialization, _, _ = _crypto()
    return public_key.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)


def key_id_for_public_key(public_key) -> str:
    return KEY_ID_PREFIX + hashlib.sha256(_raw_public(public_key)).hexdigest()


def _load_private(path: Path):
    _, serialization, Ed25519PrivateKey, _ = _crypto()
    try:
        key = serialization.load_pem_private_key(Path(path).read_bytes(), password=None)
    except Exception as exc:
        raise DetachedSignatureError(f"cannot load private key {path}: {exc}") from exc
    if not isinstance(key, Ed25519PrivateKey):
        raise DetachedSignatureError("private key is not Ed25519")
    return key


def _load_public(path: Path):
    _, serialization, _, Ed25519PublicKey = _crypto()
    try:
        key = serialization.load_pem_public_key(Path(path).read_bytes())
    except Exception as exc:
        raise DetachedSignatureError(f"cannot load public key {path}: {exc}") from exc
    if not isinstance(key, Ed25519PublicKey):
        raise DetachedSignatureError("public key is not Ed25519")
    return key


def generate_keypair(private_path: Path, public_path: Path, *, force: bool = False) -> dict:
    _, serialization, Ed25519PrivateKey, _ = _crypto()
    private_path = Path(private_path)
    public_path = Path(public_path)
    if not force:
        for path in (private_path, public_path):
            if path.exists():
                raise DetachedSignatureError(f"refusing to overwrite existing key: {path}")
    private_path.parent.mkdir(parents=True, exist_ok=True)
    public_path.parent.mkdir(parents=True, exist_ok=True)
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    private_bytes = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    public_bytes = public_key.public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    private_path.write_bytes(private_bytes)
    try:
        os.chmod(private_path, 0o600)
    except OSError:
        pass
    public_path.write_bytes(public_bytes)
    return {
        "algorithm": "Ed25519",
        "keyId": key_id_for_public_key(public_key),
        "privateKey": str(private_path),
        "publicKey": str(public_path),
    }


def _manifest(package: Path) -> dict:
    try:
        validate_package(Path(package))
    except ValidationFailure as exc:
        raise DetachedSignatureError(f"cannot sign/verify invalid P2RLN package: {exc}") from exc
    with zipfile.ZipFile(package, "r") as zf:
        return load_json_bytes(zf.read("META-INF/manifest.json"), "manifest")


def target_for_manifest(manifest: dict, scope: str) -> dict:
    if scope not in {"content", "package"}:
        raise DetachedSignatureError("signature scope must be 'content' or 'package'")
    target = {
        "scope": scope,
        "format": manifest["format"],
        "formatVersion": manifest["formatVersion"],
        "contentRoot": manifest["integrity"]["contentRoot"],
    }
    if scope == "package":
        target["packageId"] = manifest["packageId"]
    return target


def signature_statement(envelope: dict) -> dict:
    return {
        "schema": SIGNATURE_INPUT_SCHEMA_ID,
        "version": "1",
        "algorithm": envelope["algorithm"],
        "keyId": envelope["keyId"],
        "target": envelope["target"],
    }


def _validate_envelope(envelope: object) -> dict:
    if not isinstance(envelope, dict):
        raise DetachedSignatureError("detached signature must be a JSON object")
    schema = json.loads((SCHEMA_DIR / "detached-signature.schema.json").read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(envelope), key=lambda e: list(e.absolute_path))
    if errors:
        lines = []
        for error in errors[:20]:
            path = "/".join(str(v) for v in error.absolute_path) or "$"
            lines.append(f"{path}: {error.message}")
        raise DetachedSignatureError("invalid detached signature:\n" + "\n".join(lines))
    return dict(envelope)


def sign_package(package: Path, private_key_path: Path, output: Path | None = None, *, scope: str = "content", force: bool = False) -> dict:
    package = Path(package)
    manifest = _manifest(package)
    private_key = _load_private(private_key_path)
    public_key = private_key.public_key()
    raw_public = _raw_public(public_key)
    key_id = key_id_for_public_key(public_key)
    envelope = {
        "schema": SIGNATURE_SCHEMA_ID,
        "version": "1",
        "algorithm": "Ed25519",
        "keyId": key_id,
        "publicKey": {"format": "raw", "encoding": "base64url", "value": _b64u(raw_public)},
        "target": target_for_manifest(manifest, scope),
    }
    envelope["signature"] = _b64u(private_key.sign(canonicalize_bytes(signature_statement(envelope))))
    _validate_envelope(envelope)
    output = Path(output) if output is not None else Path(str(package) + ".sig")
    if output.exists() and not force:
        raise DetachedSignatureError(f"refusing to overwrite existing signature: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(envelope, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "signature": str(output),
        "keyId": key_id,
        "scope": scope,
        "contentRoot": envelope["target"]["contentRoot"],
        "packageId": envelope["target"].get("packageId"),
        "bytes": output.stat().st_size,
    }


def load_signature(path: Path) -> dict:
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise DetachedSignatureError(f"cannot read detached signature {path}: {exc}") from exc
    try:
        envelope = load_json_bytes(data, "detached signature")
    except ValidationFailure as exc:
        raise DetachedSignatureError(str(exc)) from exc
    return _validate_envelope(envelope)


def verify_package_signature(
    package: Path,
    signature_path: Path,
    *,
    trusted_public_keys: Iterable[Path] = (),
    require_trusted: bool = False,
) -> dict:
    InvalidSignature, _, _, Ed25519PublicKey = _crypto()
    manifest = _manifest(Path(package))
    envelope = load_signature(Path(signature_path))
    raw = _unb64u(envelope["publicKey"]["value"])
    if len(raw) != 32:
        raise DetachedSignatureError("embedded Ed25519 public key must be exactly 32 bytes")
    try:
        public_key = Ed25519PublicKey.from_public_bytes(raw)
    except Exception as exc:
        raise DetachedSignatureError("invalid embedded Ed25519 public key") from exc
    derived_key_id = key_id_for_public_key(public_key)
    if derived_key_id != envelope["keyId"]:
        raise DetachedSignatureError("keyId does not match the embedded public key fingerprint")
    expected_target = target_for_manifest(manifest, envelope["target"]["scope"])
    if expected_target != envelope["target"]:
        raise DetachedSignatureError("detached signature target does not match this P2RLN package")
    signature = _unb64u(envelope["signature"])
    try:
        public_key.verify(signature, canonicalize_bytes(signature_statement(envelope)))
    except InvalidSignature as exc:
        raise DetachedSignatureError("Ed25519 signature verification failed") from exc

    trusted = False
    trust_sources: list[str] = []
    for path in trusted_public_keys:
        trusted_key = _load_public(Path(path))
        if key_id_for_public_key(trusted_key) == derived_key_id and _raw_public(trusted_key) == raw:
            trusted = True
            trust_sources.append(str(path))
    if require_trusted and not trusted:
        raise DetachedSignatureError(
            f"signature is cryptographically valid but key {derived_key_id} is not in the supplied trust store"
        )
    return {
        "valid": True,
        "cryptographicallyValid": True,
        "trusted": trusted,
        "keyId": derived_key_id,
        "trustSources": trust_sources,
        "scope": envelope["target"]["scope"],
        "contentRoot": envelope["target"]["contentRoot"],
        "packageId": envelope["target"].get("packageId"),
    }
