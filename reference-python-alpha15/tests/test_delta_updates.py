import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

from p2rln_creator.builder import build_project
from p2rln_creator.project import PROJECT_FILE, add_file, new_project, save_project
from p2rln_ref.delta import DeltaError, apply_delta, create_delta, inspect_delta
from p2rln_ref.delta_cli import main as delta_main
from p2rln_ref.validator import validate_package


class P2RLNDetachedDeltaTests(unittest.TestCase):
    def make_project(self, root: Path, *, large_size: int = 512 * 1024):
        project = new_project("Curso base", "es", "Prueba de delta")
        asset = root / "large.bin"
        asset.write_bytes(os.urandom(large_size))
        note = root / "note.txt"
        note.write_text("version uno\n", encoding="utf-8")
        add_file(root, project, asset, "large", "Recurso grande", media_type="application/octet-stream", copy_file=False)
        add_file(root, project, note, "note", "Nota", media_type="text/plain", copy_file=False)
        save_project(root / PROJECT_FILE, project)
        return project, asset, note

    @staticmethod
    def rewrite_entry(source: Path, output: Path, name: str, transform):
        with zipfile.ZipFile(source, "r") as src, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as dst:
            for info in src.infolist():
                data = src.read(info.filename)
                if info.filename == name:
                    data = transform(data)
                dst.writestr(info, data)

    def test_graph_only_update_reuses_large_payload_and_reconstructs_target(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project, _, _ = self.make_project(root)
            base = root / "base.p2rln"
            target = root / "target.p2rln"
            delta = root / "update.p2rln.delta"
            rebuilt = root / "rebuilt.p2rln"
            build_project(root, base)

            project["course"]["title"]["es"] = "Curso objetivo"
            project["course"]["revision"] = 2
            save_project(root / PROJECT_FILE, project)
            build_project(root, target)

            created = create_delta(base, target, delta)
            self.assertEqual(0, created["changedPayloads"])
            self.assertGreaterEqual(created["reusedPayloads"], 2)
            self.assertLess(created["ratio"], 0.10)
            self.assertLess(delta.stat().st_size, 80_000)

            applied = apply_delta(base, delta, rebuilt)
            target_validation = validate_package(target)
            rebuilt_validation = validate_package(rebuilt)
            self.assertEqual(target_validation["contentRoot"], applied["contentRoot"])
            self.assertEqual(target_validation["contentRoot"], rebuilt_validation["contentRoot"])
            self.assertEqual(target_validation["packageId"], rebuilt_validation["packageId"])

    def test_changed_payload_is_carried_and_applied(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project, _, note = self.make_project(root, large_size=64 * 1024)
            base = root / "base.p2rln"
            target = root / "target.p2rln"
            delta = root / "update.p2rln.delta"
            rebuilt = root / "rebuilt.p2rln"
            build_project(root, base)

            note.write_text("version dos con contenido distinto\n", encoding="utf-8")
            project["course"]["revision"] = 2
            save_project(root / PROJECT_FILE, project)
            build_project(root, target)

            created = create_delta(base, target, delta)
            self.assertEqual(1, created["changedPayloads"])
            document = inspect_delta(delta)
            self.assertEqual(1, len(document["payloads"]))
            self.assertTrue(document["payloads"][0]["deltaPath"].startswith("payloads/"))

            apply_delta(base, delta, rebuilt)
            self.assertEqual(validate_package(target)["contentRoot"], validate_package(rebuilt)["contentRoot"])

    def test_wrong_base_and_tampered_target_graph_are_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project, _, note = self.make_project(root, large_size=16 * 1024)
            base = root / "base.p2rln"
            target = root / "target.p2rln"
            delta = root / "update.p2rln.delta"
            tampered = root / "tampered.delta"
            build_project(root, base)
            note.write_text("changed\n", encoding="utf-8")
            project["course"]["revision"] = 2
            save_project(root / PROJECT_FILE, project)
            build_project(root, target)
            create_delta(base, target, delta)

            with self.assertRaisesRegex(DeltaError, "base contentRoot"):
                apply_delta(target, delta, root / "wrong.p2rln")

            self.rewrite_entry(delta, tampered, "target/content/graph.json", lambda data: data + b" ")
            with self.assertRaisesRegex(DeltaError, "target graph byte digest mismatch"):
                apply_delta(base, tampered, root / "tampered-out.p2rln")
            self.assertFalse((root / "tampered-out.p2rln").exists())

    def test_delta_inventory_rejects_uninventoried_entry(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project, _, _ = self.make_project(root, large_size=4096)
            base = root / "base.p2rln"
            target = root / "target.p2rln"
            delta = root / "update.p2rln.delta"
            bad = root / "extra.delta"
            build_project(root, base)
            project["course"]["title"]["es"] = "Objetivo"
            project["course"]["revision"] = 2
            save_project(root / PROJECT_FILE, project)
            build_project(root, target)
            create_delta(base, target, delta)
            with zipfile.ZipFile(delta, "r") as src, zipfile.ZipFile(bad, "w", zipfile.ZIP_DEFLATED) as dst:
                for info in src.infolist():
                    dst.writestr(info, src.read(info.filename))
                dst.writestr("payloads/not-declared.bin", b"x")
            with self.assertRaisesRegex(DeltaError, "uninventoried"):
                inspect_delta(bad)

    def test_create_and_apply_are_atomic_on_mid_write_failure(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project, _, note = self.make_project(root, large_size=4096)
            base = root / "base.p2rln"
            target = root / "target.p2rln"
            good_delta = root / "good.delta"
            destination_delta = root / "destination.delta"
            destination_package = root / "destination.p2rln"
            build_project(root, base)
            note.write_text("changed\n", encoding="utf-8")
            project["course"]["revision"] = 2
            save_project(root / PROJECT_FILE, project)
            build_project(root, target)
            create_delta(base, target, good_delta)

            destination_delta.write_bytes(b"old-delta")
            from p2rln_ref import delta as delta_module
            original_write = delta_module._zip_write
            calls = {"count": 0}

            def fail_second_write(zf, name, data):
                calls["count"] += 1
                if calls["count"] == 2:
                    raise RuntimeError("synthetic write failure")
                return original_write(zf, name, data)

            with mock.patch.object(delta_module, "_zip_write", side_effect=fail_second_write):
                with self.assertRaisesRegex(RuntimeError, "synthetic"):
                    create_delta(base, target, destination_delta, force=True)
            self.assertEqual(b"old-delta", destination_delta.read_bytes())

            destination_package.write_bytes(b"old-package")
            calls["count"] = 0
            with mock.patch.object(delta_module, "_zip_write", side_effect=fail_second_write):
                with self.assertRaisesRegex(RuntimeError, "synthetic"):
                    apply_delta(base, good_delta, destination_package, force=True)
            self.assertEqual(b"old-package", destination_package.read_bytes())
            self.assertFalse(any(root.glob(".destination*.tmp")))

    def test_cli_create_inspect_apply(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project, _, _ = self.make_project(root, large_size=4096)
            base = root / "base.p2rln"
            target = root / "target.p2rln"
            delta = root / "update.delta"
            rebuilt = root / "rebuilt.p2rln"
            build_project(root, base)
            project["course"]["title"]["es"] = "Objetivo CLI"
            project["course"]["revision"] = 2
            save_project(root / PROJECT_FILE, project)
            build_project(root, target)

            self.assertEqual(0, delta_main(["create", str(base), str(target), str(delta)]))
            self.assertEqual(0, delta_main(["inspect", str(delta)]))
            self.assertEqual(0, delta_main(["apply", str(base), str(delta), str(rebuilt)]))
            self.assertEqual(validate_package(target)["contentRoot"], validate_package(rebuilt)["contentRoot"])


if __name__ == "__main__":
    unittest.main()
