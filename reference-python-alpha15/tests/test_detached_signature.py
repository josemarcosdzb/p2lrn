from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
import uuid
import zipfile
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

from p2rln_ref.detached_signature import (
    DetachedSignatureError,
    generate_keypair,
    load_signature,
    sign_package,
    verify_package_signature,
)

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "examples" / "native-questionnaire-course.p2rln"

try:
    import cryptography  # noqa: F401
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False


def repack_with_new_package_id(source: Path, target: Path) -> None:
    with zipfile.ZipFile(source, "r") as zf:
        payloads = {info.filename: zf.read(info.filename) for info in zf.infolist() if not info.is_dir()}
    manifest = json.loads(payloads["META-INF/manifest.json"])
    original_root = manifest["integrity"]["contentRoot"]
    manifest["packageId"] = f"urn:uuid:{uuid.uuid4()}"
    payloads["META-INF/manifest.json"] = (json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data in payloads.items():
            zf.writestr(name, data)
    with zipfile.ZipFile(target, "r") as zf:
        changed = json.loads(zf.read("META-INF/manifest.json"))
    assert changed["integrity"]["contentRoot"] == original_root


@unittest.skipUnless(HAS_CRYPTOGRAPHY, "cryptography optional dependency required")
class DetachedSignatureTests(unittest.TestCase):
    def test_signature_schema_is_valid_json_schema(self):
        schema = json.loads((ROOT / "schemas" / "detached-signature.schema.json").read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        self.assertEqual("https://p2rln.org/schema/detached-signature/1", schema["$id"])

    def test_content_signature_verifies_and_trust_is_separate(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            private = root / "private.pem"
            public = root / "public.pem"
            generated = generate_keypair(private, public)
            self.assertTrue(generated["keyId"].startswith("urn:p2rln:key:ed25519:sha256:"))
            if os.name == "posix":
                self.assertEqual(0o600, private.stat().st_mode & 0o777)
            sig = root / "course.p2rln.sig"
            signed = sign_package(PACKAGE, private, sig, scope="content")
            self.assertLess(signed["bytes"], 4096)
            untrusted = verify_package_signature(PACKAGE, sig)
            self.assertTrue(untrusted["cryptographicallyValid"])
            self.assertFalse(untrusted["trusted"])
            trusted = verify_package_signature(PACKAGE, sig, trusted_public_keys=[public], require_trusted=True)
            self.assertTrue(trusted["trusted"])
            self.assertEqual(generated["keyId"], trusted["keyId"])

    def test_content_scope_survives_repackaging_but_package_scope_binds_package_id(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            private = root / "private.pem"
            public = root / "public.pem"
            generate_keypair(private, public)
            content_sig = root / "content.sig"
            package_sig = root / "package.sig"
            sign_package(PACKAGE, private, content_sig, scope="content")
            sign_package(PACKAGE, private, package_sig, scope="package")
            repacked = root / "repacked.p2rln"
            repack_with_new_package_id(PACKAGE, repacked)
            self.assertTrue(verify_package_signature(repacked, content_sig)["valid"])
            with self.assertRaisesRegex(DetachedSignatureError, "target does not match"):
                verify_package_signature(repacked, package_sig)

    def test_signature_tampering_and_wrong_trust_key_are_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            private = root / "private.pem"
            public = root / "public.pem"
            other_private = root / "other-private.pem"
            other_public = root / "other-public.pem"
            generate_keypair(private, public)
            generate_keypair(other_private, other_public)
            sig = root / "course.sig"
            sign_package(PACKAGE, private, sig)
            envelope = load_signature(sig)
            encoded = envelope["signature"]
            envelope["signature"] = ("A" if encoded[0] != "A" else "B") + encoded[1:]
            sig.write_text(json.dumps(envelope), encoding="utf-8")
            with self.assertRaisesRegex(DetachedSignatureError, "verification failed"):
                verify_package_signature(PACKAGE, sig)

            sign_package(PACKAGE, private, sig, force=True)
            with self.assertRaisesRegex(DetachedSignatureError, "not in the supplied trust store"):
                verify_package_signature(PACKAGE, sig, trusted_public_keys=[other_public], require_trusted=True)

    def test_trust_cli_end_to_end_does_not_modify_package(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            package_copy = root / "course.p2rln"
            shutil.copy2(PACKAGE, package_copy)
            before = package_copy.read_bytes()
            private = root / "private.pem"
            public = root / "public.pem"
            sig = root / "course.sig"
            commands = [
                ["python", "-m", "p2rln_ref.trust_cli", "keygen", str(private), str(public)],
                ["python", "-m", "p2rln_ref.trust_cli", "sign", str(package_copy), str(private), "--output", str(sig), "--scope", "package"],
                ["python", "-m", "p2rln_ref.trust_cli", "verify", str(package_copy), str(sig), "--trust-key", str(public), "--require-trusted"],
            ]
            last = None
            for command in commands:
                last = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
                self.assertEqual(0, last.returncode, last.stderr or last.stdout)
            result = json.loads(last.stdout)
            self.assertTrue(result["trusted"])
            self.assertEqual(before, package_copy.read_bytes())
            with zipfile.ZipFile(package_copy) as zf:
                self.assertFalse(any(name.startswith("META-INF/signatures/") for name in zf.namelist()))


if __name__ == "__main__":
    unittest.main()
