import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT))
from p2rln_ref import P2RLNReader, CapabilitySet

wrap_spec = importlib.util.spec_from_file_location("wrap", ROOT / "tools" / "wrap_external.py")
w = importlib.util.module_from_spec(wrap_spec); wrap_spec.loader.exec_module(w)
repack_spec = importlib.util.spec_from_file_location("repack", ROOT / "tools" / "repack.py")
rp = importlib.util.module_from_spec(repack_spec); repack_spec.loader.exec_module(rp)

CORPUS = Path(os.environ.get("P2RLN_REAL_CORPUS", "/mnt/data"))


def need(name):
    p = CORPUS / name
    if not p.exists():
        raise unittest.SkipTest(f"real-world corpus file missing: {p}")
    return p


class ReaderTransformationTests(unittest.TestCase):
    def caps(self):
        return CapabilitySet.from_path(ROOT / "examples" / "capabilities" / "reference-capabilities.json")

    def test_scorm_reader_resolves_package_member_without_extraction(self):
        with tempfile.TemporaryDirectory() as td:
            src = need("Scorm12(1).zip")
            out = Path(td) / "golf.p2rln"
            w.wrap(src, out)
            reader = P2RLNReader(out, strict_profiles=True, validate_profile_payloads=True)
            plan = reader.course_read_plan(self.caps(), mode="read")
            self.assertEqual({"total": 1, "ready": 1, "unsupported": 0}, plan["summary"])
            launch = plan["activities"][0]["plan"]
            self.assertEqual("package-member", launch["kind"])
            self.assertEqual("scorm", launch["runtime"])
            actual = reader.read_package_member(launch["packagePath"], launch["member"])
            with zipfile.ZipFile(src) as zf:
                expected = zf.read(launch["member"])
            self.assertEqual(expected, actual)

    def test_preserved_source_round_trip_is_bit_exact(self):
        with tempfile.TemporaryDirectory() as td:
            src = need("example-content-crossword-1209160.h5p")
            out = Path(td) / "h5p.p2rln"
            w.wrap(src, out)
            reader = P2RLNReader(out, strict_profiles=True, validate_profile_payloads=True)
            tr = reader.transformation_report()
            self.assertEqual("bit-exact", tr["source"]["preservation"])
            data = reader.read_embedded_file(tr["source"]["preservedPath"])
            self.assertEqual(src.read_bytes(), data)
            self.assertEqual(tr["source"]["preservedPackageDigest"], "sha256:" + hashlib.sha256(data).hexdigest())
            self.assertEqual([], tr["losses"])

    def test_neutral_repack_changes_bytes_not_logical_content(self):
        with tempfile.TemporaryDirectory() as td:
            src = need("Scorm12(1).zip")
            p1 = Path(td) / "a.p2rln"; p2 = Path(td) / "b.p2rln"
            w.wrap(src, p1)
            result = rp.repack(p1, p2, new_package_id=True)
            self.assertTrue(result["sameContentRoot"])
            self.assertNotEqual(p1.read_bytes(), p2.read_bytes())
            self.assertEqual(result["before"]["contentRoot"], result["after"]["contentRoot"])
            # The preserved source package must survive the neutral implementation unchanged.
            r1=P2RLNReader(p1); r2=P2RLNReader(p2)
            t1=r1.transformation_report(); t2=r2.transformation_report()
            self.assertEqual(r1.read_embedded_file(t1["source"]["preservedPath"]), r2.read_embedded_file(t2["source"]["preservedPath"]))

    def test_common_cartridge_full_inventory_qti_and_lti_projection(self):
        with tempfile.TemporaryDirectory() as td:
            src=need("topkit-export(spanish).imscc")
            out=Path(td)/"topkit.p2rln"
            report=w.wrap(src,out)
            self.assertEqual(536,report["entities"])
            reader=P2RLNReader(out,strict_profiles=True,validate_profile_payloads=True)
            resources=[e for e in reader.entities.values() if e["type"]=="resource"]
            self.assertEqual(419,len(resources))
            reps=[r for e in resources for r in e["representations"]]
            self.assertEqual(7,sum(r.get("profile")==w.PROFILE["qti"] for r in reps))
            self.assertEqual(3,sum(r.get("profile")==w.PROFILE["lti"] for r in reps))
            lti=next(r for r in reps if r.get("profile")==w.PROFILE["lti"])
            plan=reader.representation_plan(lti)
            self.assertEqual("external-tool",plan["kind"])
            self.assertTrue(plan["rebindRequired"])
            self.assertTrue(plan["targetLinkUri"].startswith("https://"))
            self.assertEqual([],reader.transformation_report()["losses"])
            # QTI has an explicit primary representation. The reference reader
            # only validates/preserves QTI, so read negotiation must not fall
            # back to the whole Common Cartridge and pretend QTI was understood.
            qti_resources={e["id"] for e in resources if any(r.get("profile")==w.PROFILE["qti"] for r in e["representations"])}
            qti_activity=next(e for e in reader.entities.values() if e["type"]=="activity" and e.get("resource") in qti_resources)
            qti_plan=reader.activity_plan(qti_activity["id"],self.caps(),mode="read")
            self.assertEqual("unsupported",qti_plan["status"])
            qti_import=reader.resource_import_plan(qti_activity["resource"],self.caps())
            self.assertEqual("preservable",qti_import["status"])

    def test_qti3_package_is_detected_projected_and_read_without_rewriting_items(self):
        manifest=b'''<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/qti/qtiv3p0/imscp_v1p1" identifier="qti-pkg">
  <metadata><schema>QTI Package</schema><schemaversion>3.0.0</schemaversion></metadata>
  <organizations/>
  <resources>
    <resource identifier="item-1" type="imsqti_item_xmlv3p0" href="items/item1.xml">
      <metadata><qtiMetadata xmlns="http://www.imsglobal.org/xsd/imsqti_metadata_v3p0"><interactionType>choiceInteraction</interactionType></qtiMetadata></metadata>
      <file href="items/item1.xml"/><dependency identifierref="media-1"/>
    </resource>
    <resource identifier="media-1" type="webcontent"><file href="media/image.png"/></resource>
  </resources>
</manifest>'''
        item=b'''<?xml version="1.0" encoding="UTF-8"?><qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="item-1" title="Example" adaptive="false" time-dependent="false"/>'''
        with tempfile.TemporaryDirectory() as td:
            src=Path(td)/"qti3.zip"; out=Path(td)/"qti3.p2rln"
            with zipfile.ZipFile(src,"w",zipfile.ZIP_DEFLATED) as zf:
                zf.writestr("imsmanifest.xml",manifest)
                zf.writestr("items/item1.xml",item)
                zf.writestr("media/image.png",b"PNG")
            report=w.wrap(src,out)
            self.assertEqual("qti",report["detectedFormat"])
            self.assertEqual(1,report["details"]["itemCount"])
            reader=P2RLNReader(out,strict_profiles=True,validate_profile_payloads=True)
            qti_caps=CapabilitySet({w.PROFILE["qti"]:frozenset({"read","preserve"}),"https://p2rln.org/profile/course":frozenset({"read","preserve"})})
            plan=reader.course_read_plan(qti_caps,mode="read")
            self.assertEqual({"total":1,"ready":1,"unsupported":0},plan["summary"])
            resolved=plan["activities"][0]["plan"]
            self.assertEqual("qti",resolved["runtime"])
            self.assertEqual("items/item1.xml",resolved["member"])
            self.assertEqual(item,reader.read_package_member(resolved["packagePath"],resolved["member"]))
            self.assertEqual(src.read_bytes(),reader.read_embedded_file(reader.transformation_report()["source"]["preservedPath"]))

    def test_import_plan_keeps_portable_ids_and_preserves_unknown_semantics(self):
        with tempfile.TemporaryDirectory() as td:
            src=need("example-content-crossword-1209160.h5p")
            out=Path(td)/"h5p.p2rln"
            w.wrap(src,out)
            reader=P2RLNReader(out,strict_profiles=True,validate_profile_payloads=True)
            caps=CapabilitySet({
                "https://p2rln.org/profile/course":frozenset({"read","preserve"}),
                w.PROFILE["h5p"]:frozenset({"preserve"}),
            })
            plan=reader.import_plan(caps)
            self.assertTrue(plan["portableIdMapRequired"])
            self.assertTrue(plan["transactionRecommended"])
            self.assertEqual(1,plan["summary"]["preservableOpaque"])
            self.assertEqual(0,plan["summary"]["unsupported"])
            self.assertEqual("preserve-opaque",plan["resources"][0]["handling"])
            self.assertTrue(plan["sourceRecovery"]["available"])


    def test_reader_never_fetches_remote_cmi5_during_plan(self):
        cmi5 = b'''<?xml version="1.0" encoding="UTF-8"?>
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">
  <course id="https://example.invalid/course"><title><langstring lang="en">Remote cmi5</langstring></title></course>
  <au id="https://example.invalid/course/au1" moveOn="Completed"><title><langstring lang="en">Remote AU</langstring></title><url>https://example.invalid/launch</url></au>
</courseStructure>'''
        with tempfile.TemporaryDirectory() as td:
            src=Path(td)/"remote.zip"; out=Path(td)/"remote.p2rln"
            with zipfile.ZipFile(src,"w",zipfile.ZIP_DEFLATED) as zf: zf.writestr("cmi5.xml",cmi5)
            w.wrap(src,out)
            reader=P2RLNReader(out,strict_profiles=True,validate_profile_payloads=True)
            plan=reader.course_read_plan(self.caps(),mode="read")
            self.assertEqual(1,plan["summary"]["ready"])
            target=plan["activities"][0]["plan"]
            self.assertEqual("remote",target["kind"])
            self.assertTrue(target["networkRequired"])
            self.assertEqual("https://example.invalid/launch",target["href"])


if __name__ == "__main__":
    unittest.main()
