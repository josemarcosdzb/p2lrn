import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("p2validate", ROOT / "tools" / "validate.py")
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)


def rewrite_package(src: Path, dst: Path, *, graph_mutator=None, manifest_mutator=None, extra_files=None):
    with zipfile.ZipFile(src) as zin:
        manifest = json.loads(zin.read("META-INF/manifest.json"))
        graph = json.loads(zin.read("content/graph.json"))
        files = {name: zin.read(name) for name in zin.namelist() if not name.endswith("/") and name not in {"META-INF/manifest.json", "content/graph.json"}}

    if graph_mutator:
        graph_mutator(graph)
    graph_bytes = (json.dumps(graph, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    manifest["graph"]["size"] = len(graph_bytes)
    manifest["graph"]["byteDigest"] = v.sha256(graph_bytes)
    manifest["graph"]["contentDigest"] = v.sha256(v.jcs_bytes(graph))

    if manifest_mutator:
        manifest_mutator(manifest)

    # Recompute root after semantic manifest changes.
    manifest["integrity"]["contentRoot"] = v.compute_content_root(manifest)
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

    if extra_files:
        files.update(extra_files)

    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        zout.writestr("META-INF/manifest.json", manifest_bytes)
        zout.writestr("content/graph.json", graph_bytes)
        for name, data in sorted(files.items()):
            zout.writestr(name, data)


class P2RLNReferenceTests(unittest.TestCase):
    def test_schemas_are_valid_draft_2020_12(self):
        for path in sorted((ROOT / "schemas").glob("*.schema.json")):
            obj = json.loads(path.read_text(encoding="utf-8"))
            Draft202012Validator.check_schema(obj)

    def test_profile_descriptors_validate(self):
        schema = json.loads((ROOT / "schemas" / "profile.schema.json").read_text(encoding="utf-8"))
        validator = Draft202012Validator(schema, format_checker=FormatChecker())
        for path in sorted((ROOT / "profiles").glob("*/profile.json")):
            obj = json.loads(path.read_text(encoding="utf-8"))
            errors = list(validator.iter_errors(obj))
            self.assertEqual([], errors, f"{path}: {errors}")

    def test_capability_example_validates(self):
        schema = json.loads((ROOT / "schemas" / "capabilities.schema.json").read_text(encoding="utf-8"))
        obj = json.loads((ROOT / "examples" / "capabilities" / "reference-capabilities.json").read_text(encoding="utf-8"))
        errors = list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(obj))
        self.assertEqual([], errors, errors)

    def test_minimal_package_validates(self):
        result = v.validate_package(ROOT / "examples" / "minimal-course.p2rln")
        self.assertEqual("P2RLN", result["format"])
        self.assertEqual(1, result["entities"])

    def test_web_package_validates(self):
        result = v.validate_package(ROOT / "examples" / "web-course.p2rln")
        self.assertEqual(3, result["entities"])
        self.assertEqual(1, result["files"])

    def test_advanced_interoperability_package_validates(self):
        result = v.validate_package(ROOT / "examples" / "advanced-interoperability.p2rln", strict_profiles=True)
        self.assertEqual(7, result["entities"])
        self.assertEqual(2, result["files"])

    def test_package_id_does_not_change_content_root(self):
        with zipfile.ZipFile(ROOT / "examples" / "minimal-course.p2rln") as z:
            manifest = json.loads(z.read("META-INF/manifest.json"))
        original = v.compute_content_root(manifest)
        manifest["packageId"] = "urn:uuid:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        self.assertEqual(original, v.compute_content_root(manifest))

    def test_graph_formatting_does_not_change_content_digest(self):
        graph = {"z": 1, "a": [True, None, "x"]}
        pretty = json.dumps(graph, ensure_ascii=False, indent=4).encode()
        compact = json.dumps(graph, ensure_ascii=False, separators=(",", ":")).encode()
        self.assertEqual(
            v.content_digest(pretty, "application/json", "pretty"),
            v.content_digest(compact, "application/json", "compact"),
        )

    def test_tampered_graph_fails_exact_byte_integrity(self):
        src = ROOT / "examples" / "minimal-course.p2rln"
        with tempfile.TemporaryDirectory() as td:
            dst = Path(td) / "tampered.p2rln"
            with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
                for info in zin.infolist():
                    data = zin.read(info.filename)
                    if info.filename == "content/graph.json":
                        data = data.replace(b"Mi primer curso", b"Mi pr1mer curso")
                    zout.writestr(info.filename, data)
            with self.assertRaisesRegex(v.ValidationFailure, "byteDigest mismatch"):
                v.validate_package(dst)

    def test_uninventoried_payload_fails(self):
        src = ROOT / "examples" / "minimal-course.p2rln"
        with tempfile.TemporaryDirectory() as td:
            dst = Path(td) / "hidden.p2rln"
            with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
                for info in zin.infolist():
                    zout.writestr(info.filename, zin.read(info.filename))
                zout.writestr("assets/hidden.bin", b"hidden")
            with self.assertRaisesRegex(v.ValidationFailure, "uninventoried payload"):
                v.validate_package(dst)

    def test_duplicate_profile_rejected_by_package_validator(self):
        src = ROOT / "examples" / "minimal-course.p2rln"
        with tempfile.TemporaryDirectory() as td:
            dst = Path(td) / "duplicate-profile.p2rln"
            rewrite_package(src, dst, manifest_mutator=lambda m: m["profiles"].append(copy.deepcopy(m["profiles"][0])))
            with self.assertRaisesRegex(v.ValidationFailure, "same profile id"):
                v.validate_package(dst)

    def test_broken_reference_rejected_after_integrity_passes(self):
        src = ROOT / "examples" / "minimal-course.p2rln"
        with tempfile.TemporaryDirectory() as td:
            dst = Path(td) / "broken-reference.p2rln"
            def mutate(g):
                g["entities"][0]["children"] = ["urn:uuid:ffffffff-ffff-4fff-8fff-ffffffffffff"]
            rewrite_package(src, dst, graph_mutator=mutate)
            with self.assertRaisesRegex(v.ValidationFailure, "broken reference"):
                v.validate_package(dst)

    def test_children_cycle_rejected_after_integrity_passes(self):
        src = ROOT / "examples" / "web-course.p2rln"
        with tempfile.TemporaryDirectory() as td:
            dst = Path(td) / "cycle.p2rln"
            def mutate(g):
                # Course -> Unit already exists; add Unit -> Course.
                for e in g["entities"]:
                    if e["type"] == "unit":
                        e["children"].append("urn:uuid:30000000-0000-4000-8000-000000000001")
            rewrite_package(src, dst, graph_mutator=mutate)
            with self.assertRaisesRegex(v.ValidationFailure, "children cycle"):
                v.validate_package(dst)

    def test_content_addressed_asset_path_matches_digest(self):
        result = v.validate_package(ROOT / "examples" / "web-course.p2rln")
        self.assertEqual(1, result["files"])


# Additional 0.4.0 regression tests are kept in this module so the Core suite remains
# runnable without the optional real-world corpus.
class P2RLN020Regressions(unittest.TestCase):
    def test_representation_profile_must_be_declared(self):
        src = ROOT / "examples" / "web-course.p2rln"
        with tempfile.TemporaryDirectory() as td:
            dst = Path(td) / "undeclared-profile.p2rln"
            def mutate(g):
                for e in g["entities"]:
                    if e["type"] == "resource":
                        e["representations"][0]["profile"] = "https://example.org/profile/not-declared"
            rewrite_package(src, dst, graph_mutator=mutate)
            with self.assertRaisesRegex(v.ValidationFailure, "representation profile not declared"):
                v.validate_package(dst)

    def test_entity_profile_extension_must_be_declared(self):
        src = ROOT / "examples" / "minimal-course.p2rln"
        with tempfile.TemporaryDirectory() as td:
            dst = Path(td) / "undeclared-extension-profile.p2rln"
            def mutate(g):
                g["entities"][0]["extensions"] = {"https://p2rln.org/profile/not-declared": {"x": 1}}
            rewrite_package(src, dst, graph_mutator=mutate)
            with self.assertRaisesRegex(v.ValidationFailure, "profile extension not declared"):
                v.validate_package(dst)

    def test_strict_profile_version_is_enforced(self):
        src = ROOT / "examples" / "minimal-course.p2rln"
        with tempfile.TemporaryDirectory() as td:
            dst = Path(td) / "future-profile.p2rln"
            def mutate(m):
                m["profiles"][0]["version"] = "99.0.0"
            rewrite_package(src, dst, manifest_mutator=mutate)
            with self.assertRaisesRegex(v.ValidationFailure, "unsupported required profile versions"):
                v.validate_package(dst, strict_profiles=True)

    def test_packages_sha256_path_is_content_addressed(self):
        # Use a generated external example when present; this test is skipped in
        # source-only distributions that intentionally omit external fixtures.
        ext = ROOT / "examples" / "external" / "h5p-crossword.p2rln"
        if not ext.exists():
            self.skipTest("external fixture not bundled")
        result = v.validate_package(ext, strict_profiles=True, validate_profile_payloads_flag=True)
        self.assertEqual(2, result["files"])


if __name__ == "__main__":
    unittest.main()
