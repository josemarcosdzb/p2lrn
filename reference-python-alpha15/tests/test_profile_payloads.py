import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("wrap", ROOT / "tools" / "wrap_external.py")
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


class ProfilePayloadNegativeTests(unittest.TestCase):
    def test_scorm_missing_relative_launch_is_rejected(self):
        manifest = b'''<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="m1" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="o1"><organization identifier="o1"><title>Broken SCORM</title><item identifier="i1" identifierref="r1"><title>Launch</title></item></organization></organizations>
  <resources><resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="missing.html"/></resources>
</manifest>'''
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "broken-scorm.zip"
            out = Path(td) / "broken-scorm.p2rln"
            with zipfile.ZipFile(src, "w", zipfile.ZIP_DEFLATED) as z:
                z.writestr("imsmanifest.xml", manifest)
            with self.assertRaisesRegex(w.v.ValidationFailure, "relative launch target missing"):
                w.wrap(src, out)

    def test_h5p_missing_content_json_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "broken.h5p"
            out = Path(td) / "broken.p2rln"
            h5p = {
                "title": "Broken H5P",
                "mainLibrary": "H5P.Example",
                "language": "en",
                "embedTypes": ["iframe"],
            }
            with zipfile.ZipFile(src, "w", zipfile.ZIP_DEFLATED) as z:
                z.writestr("h5p.json", json.dumps(h5p))
            with self.assertRaisesRegex(w.v.ValidationFailure, "requires h5p.json and content/content.json"):
                w.wrap(src, out)

    def test_cmi5_remote_au_is_not_dereferenced_during_validation(self):
        cmi5 = b'''<?xml version="1.0" encoding="UTF-8"?>
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">
  <course id="https://example.invalid/course"><title><langstring lang="en">Remote cmi5</langstring></title></course>
  <au id="https://example.invalid/course/au1" moveOn="Completed"><title><langstring lang="en">Remote AU</langstring></title><url>https://example.invalid/launch</url></au>
</courseStructure>'''
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "remote-cmi5.zip"
            out = Path(td) / "remote-cmi5.p2rln"
            with zipfile.ZipFile(src, "w", zipfile.ZIP_DEFLATED) as z:
                z.writestr("cmi5.xml", cmi5)
            report = w.wrap(src, out)
            self.assertEqual("cmi5", report["detectedFormat"])
            self.assertEqual("0.4.0", report["validation"]["formatVersion"])

    def test_qti_missing_declared_item_is_rejected(self):
        manifest = b'''<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/qti/qtiv3p0/imscp_v1p1" identifier="qti-broken">
  <metadata><schema>QTI Package</schema><schemaversion>3.0.0</schemaversion></metadata>
  <organizations/><resources><resource identifier="item-1" type="imsqti_item_xmlv3p0" href="items/missing.xml"/></resources>
</manifest>'''
        with tempfile.TemporaryDirectory() as td:
            src=Path(td)/"broken-qti.zip"; out=Path(td)/"broken-qti.p2rln"
            with zipfile.ZipFile(src,"w",zipfile.ZIP_DEFLATED) as z:
                z.writestr("imsmanifest.xml",manifest)
            with self.assertRaisesRegex(w.v.ValidationFailure, "relative launch target missing"):
                w.wrap(src,out)


if __name__ == "__main__":
    unittest.main()
