from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

from p2rln_ref.component_authoring import (
    ComponentAuthoringError,
    reference_component_catalog,
    resolve_reference_document,
)

ROOT = Path(__file__).resolve().parents[1]
CALL_OUT_V1 = ROOT / "examples" / "native-component-callout.json"
CALL_OUT_V2 = ROOT / "examples" / "native-component-callout-authoring-v2.json"
TIMELINE = ROOT / "examples" / "native-component-timeline.json"
COMPONENT_ID = "https://p2rln.org/component/callout"
TIMELINE_ID = "https://p2rln.org/component/timeline"


class ComponentAuthoringCatalogTests(unittest.TestCase):
    def test_reference_catalog_resolves_data_and_editor_documents_by_uri(self):
        catalog = reference_component_catalog()
        docs = catalog.authoring_documents(COMPONENT_ID, "1")
        self.assertEqual("2", docs["dataVersion"])
        self.assertEqual("https://p2rln.org/component/callout/schema/data/2", docs["dataSchema"]["$id"])
        self.assertEqual("https://p2rln.org/component/callout/editor/2", docs["editorSchema"]["id"])
        self.assertEqual(docs["dataSchema"]["$id"], docs["editorSchema"]["dataSchema"])

        timeline = catalog.authoring_documents(TIMELINE_ID, "1")
        self.assertEqual("1", timeline["dataVersion"])
        self.assertEqual("https://p2rln.org/component/timeline/schema/data/1", timeline["dataSchema"]["$id"])
        self.assertEqual("https://p2rln.org/component/timeline/editor/1", timeline["editorSchema"]["id"])
        collection = timeline["editorSchema"]["fields"][0]
        self.assertEqual("collection", collection["control"])
        self.assertEqual(["/id", "/date", "/title", "/body"], [field["path"] for field in collection["fields"]])

    def test_editor_document_is_declarative_and_data_schema_remains_authority(self):
        meta = resolve_reference_document("https://p2rln.org/schema/component-editor/0.1")
        editor = resolve_reference_document("https://p2rln.org/component/callout/editor/2")
        Draft202012Validator(meta, format_checker=FormatChecker()).validate(editor)
        self.assertEqual(["/heading", "/body", "/tone"], [field["path"] for field in editor["fields"]])
        self.assertNotIn("javascript", json.dumps(editor).lower())
        self.assertNotIn("module", json.dumps(editor).lower())

    def test_catalog_validates_legacy_and_authoring_data_versions(self):
        catalog = reference_component_catalog()
        v1 = json.loads(CALL_OUT_V1.read_text(encoding="utf-8"))
        v2 = json.loads(CALL_OUT_V2.read_text(encoding="utf-8"))
        self.assertTrue(catalog.validate_instance_data(v1)["known"])
        self.assertTrue(catalog.validate_instance_data(v2)["known"])
        v2["data"].pop("body")
        with self.assertRaises(ComponentAuthoringError):
            catalog.validate_instance_data(v2)

        timeline = json.loads(TIMELINE.read_text(encoding="utf-8"))
        self.assertTrue(catalog.validate_instance_data(timeline)["known"])
        timeline["data"]["items"] = []
        with self.assertRaises(ComponentAuthoringError):
            catalog.validate_instance_data(timeline)

    def test_instance_declared_data_schema_must_match_catalog_when_authoring_validated(self):
        catalog = reference_component_catalog()
        payload = json.loads(CALL_OUT_V2.read_text(encoding="utf-8"))
        payload["schemas"]["data"] = "urn:wrong:data-schema"
        with self.assertRaises(ComponentAuthoringError):
            catalog.validate_instance_data(payload)

    def test_unknown_component_can_be_structurally_allowed_but_not_claimed_known(self):
        catalog = reference_component_catalog()
        payload = json.loads(CALL_OUT_V2.read_text(encoding="utf-8"))
        payload["component"]["id"] = "urn:example:unknown"
        payload.pop("schemas", None)
        result = catalog.validate_instance_data(payload, require_known=False)
        self.assertFalse(result["known"])
        with self.assertRaises(ComponentAuthoringError):
            catalog.validate_instance_data(payload, require_known=True)

    def test_component_capabilities_expose_authoring_schema_identifiers_without_core_change(self):
        core_schema = json.loads((ROOT / "schemas" / "capabilities.schema.json").read_text(encoding="utf-8"))
        core_doc = json.loads((ROOT / "p2rln_reader" / "capabilities.json").read_text(encoding="utf-8"))
        Draft202012Validator(core_schema, format_checker=FormatChecker()).validate(core_doc)
        self.assertNotIn("components", core_doc)
        component_doc = json.loads((ROOT / "p2rln_reader" / "component-capabilities.json").read_text(encoding="utf-8"))
        item = next(item for item in component_doc["components"] if item["id"] == COMPONENT_ID)
        self.assertEqual("2", item["authoringDataVersion"])
        self.assertIn("2", item["dataSchemas"])
        self.assertIn("2", item["editorSchemas"])
        timeline = next(item for item in component_doc["components"] if item["id"] == TIMELINE_ID)
        self.assertEqual("1", timeline["authoringDataVersion"])
        self.assertEqual("https://p2rln.org/component/timeline/schema/data/1", timeline["dataSchemas"]["1"])

    def test_creator_catalog_and_authoring_validation_cli(self):
        commands = [
            ["python", "-m", "p2rln_creator.cli", "component-catalog", "--component", COMPONENT_ID, "--component-version", "1", "--authoring-documents"],
            ["python", "-m", "p2rln_creator.cli", "validate-component-authoring", str(CALL_OUT_V2)],
            ["python", "-m", "p2rln_creator.cli", "component-catalog", "--component", TIMELINE_ID, "--component-version", "1", "--authoring-documents"],
            ["python", "-m", "p2rln_creator.cli", "validate-component-authoring", str(TIMELINE)],
        ]
        for command in commands:
            completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
            self.assertEqual(0, completed.returncode, completed.stderr or completed.stdout)
            payload = json.loads(completed.stdout)
            self.assertIsInstance(payload, dict)

    def test_creator_authoring_validation_rejects_invalid_known_data(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "bad.json"
            payload = json.loads(CALL_OUT_V2.read_text(encoding="utf-8"))
            payload["data"]["tone"] = "arbitrary-css-class"
            path.write_text(json.dumps(payload), encoding="utf-8")
            completed = subprocess.run(
                ["python", "-m", "p2rln_creator.cli", "validate-component-authoring", str(path)],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertNotEqual(0, completed.returncode)
            self.assertIn("invalid data", completed.stderr + completed.stdout)


@unittest.skipUnless(shutil.which("node"), "Node.js required for component registry authoring metadata test")
class ComponentAuthoringJavascriptTests(unittest.TestCase):
    def test_default_component_registry_exposes_schema_ids_but_no_editor_code(self):
        script = r'''
import {createDefaultComponentRegistry,CALLOUT_COMPONENT} from './p2rln_reader/web/component-registry.js';
const d=createDefaultComponentRegistry().get(CALLOUT_COMPONENT,'1');
if(d.authoringDataVersion!=='2')process.exit(2);
if(d.dataSchemas['2']!=='https://p2rln.org/component/callout/schema/data/2')process.exit(3);
if(d.editorSchemas['2']!=='https://p2rln.org/component/callout/editor/2')process.exit(4);
if('editor' in d || 'editorCode' in d || 'moduleUrl' in d)process.exit(5);
'''
        completed = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(0, completed.returncode, completed.stderr)

    def test_default_component_registry_exposes_timeline_without_editor_code(self):
        script = r'''
import {createDefaultComponentRegistry,TIMELINE_COMPONENT} from './p2rln_reader/web/component-registry.js';
const d=createDefaultComponentRegistry().get(TIMELINE_COMPONENT,'1');
if(d.authoringDataVersion!=='1'||d.targetDataVersion!=='1')process.exit(2);
if(d.dataSchemas['1']!=='https://p2rln.org/component/timeline/schema/data/1')process.exit(3);
if(d.editorSchemas['1']!=='https://p2rln.org/component/timeline/editor/1')process.exit(4);
if('editor' in d || 'editorCode' in d || 'moduleUrl' in d)process.exit(5);
'''
        completed = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(0, completed.returncode, completed.stderr)


if __name__ == "__main__":
    unittest.main()
