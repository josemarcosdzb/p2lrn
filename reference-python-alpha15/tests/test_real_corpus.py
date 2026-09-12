import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("wrap", ROOT / "tools" / "wrap_external.py")
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)

CORPUS = Path(os.environ.get("P2RLN_REAL_CORPUS", "/mnt/data"))


def need(name):
    p = CORPUS / name
    if not p.exists():
        raise unittest.SkipTest(f"real-world corpus file missing: {p}")
    return p


class SuppliedRealWorldCorpusTests(unittest.TestCase):
    def test_h5p_dependency_shapes(self):
        expected = {
            "example-content-crossword-1209160.h5p": "external",
            "example-content-arts-of-europe-443085.h5p": "external",
            "boardgame.h5p": "bundled",
        }
        for name, mode in expected.items():
            src = need(name)
            _, package, files, _ = w.load_source(src, None)
            self.assertEqual("h5p", w.detect(files))
            path, _ = w.package_path(package)
            _, _, details = w.h5p_graph("seed", files, path, name)
            self.assertEqual(mode, details["dependencyMode"], name)

    def test_scorm_versions_and_inference(self):
        expected = {
            "ScormBilanMoodle.zip": "1.2-inferred",
            "Scorm12(1).zip": "1.2",
            "SCORM20043rdEdition(1).zip": "2004 3rd Edition",
            "scorm(1).zip": "1.2",
            "scorm2004(1).zip": "2004 3rd Edition",
        }
        for name, version in expected.items():
            src = need(name)
            _, package, files, _ = w.load_source(src, None)
            self.assertEqual("scorm", w.detect(files))
            path, _ = w.package_path(package)
            _, _, details = w.scorm_or_cc_graph("scorm", package.hex()[:64], files, path, name)
            self.assertEqual(version, details["version"], name)

    def test_common_cartridge_legacy_projection(self):
        src = need("topkit-export(spanish).imscc")
        _, package, files, _ = w.load_source(src, None)
        self.assertEqual("common-cartridge", w.detect(files))
        path, _ = w.package_path(package)
        entities, _, details = w.scorm_or_cc_graph("common-cartridge", "cc", files, path, src.name)
        self.assertEqual("TOPkit", details["title"])
        self.assertEqual("1.1.0", details["version"])
        self.assertEqual(419, details["resourceCount"])
        self.assertEqual(536, len(entities))
        course = next(e for e in entities if e["type"] == "course")
        counts = course["extensions"][w.PROFILE["common-cartridge"]]["resourceTypeCounts"]
        self.assertEqual(7, counts["imsqti_xmlv1p2/imscc_xmlv1p1/assessment"])
        self.assertEqual(3, counts["imsbasiclti_xmlv1p0"])
        self.assertEqual(32, counts["imsdt_xmlv1p1"])
        reps = [rep for e in entities if e["type"] == "resource" for rep in e["representations"]]
        profiles = [rep.get("profile") for rep in reps]
        self.assertEqual(304, profiles.count(w.PROFILE["web-content"]))
        self.assertEqual(7, profiles.count(w.PROFILE["qti"]))
        self.assertEqual(3, profiles.count(w.PROFILE["lti"]))
        web_link = next(rep for rep in reps if rep.get("profile") == w.PROFILE["web-content"] and rep.get("location", {}).get("type") == "remote")
        self.assertEqual("https://vimeo.com/176461158", web_link["location"]["href"])
        discussions = [e for e in entities if e["type"] == "resource" and (e.get("extensions") or {}).get(w.PROFILE["common-cartridge"], {}).get("resourceType") == "imsdt_xmlv1p1"]
        self.assertEqual(32, len(discussions))
        self.assertTrue(any((rep.get("extensions") or {}).get(w.PROFILE["common-cartridge"], {}).get("discussionTopic", {}).get("text") for e in discussions for rep in e["representations"]))
        self.assertGreaterEqual(sum(1 for rep in reps if rep["location"]["type"] == "package-member"), 300)

    def test_catapult_cmi5_hierarchy(self):
        src = need("CATAPULT-main.zip")
        _, package, files, _ = w.load_source(src, "CATAPULT-main/course_examples/pre_post_test_framed")
        self.assertEqual("cmi5", w.detect(files))
        path, _ = w.package_path(package)
        entities, _, details = w.cmi5_graph("cmi5", files, path, "pre_post_test_framed.zip")
        self.assertEqual(6, details["auCount"])
        self.assertEqual(2, details["blockCount"])
        self.assertEqual(15, len(entities))

    def test_legacy_tincan_is_not_mislabeled_as_xapi_package(self):
        src = need("xapi-package-main.zip")
        _, package, files, _ = w.load_source(src, "xapi-package-main")
        self.assertEqual("tincan-package", w.detect(files))
        path, _ = w.package_path(package)
        _, _, details = w.tincan_graph("tincan", files, path, "xapi-package-main.zip")
        self.assertEqual("[YOUR_HOST]/xapi_course_file", details["sourceActivityId"])
        self.assertEqual("index.html", details["launch"])

    def test_full_wrapping_selected_real_packages(self):
        cases = [
            ("example-content-crossword-1209160.h5p", None, "h5p"),
            ("Scorm12(1).zip", None, "scorm"),
            ("SCORM20043rdEdition(1).zip", None, "scorm"),
            ("xapi-package-main.zip", "xapi-package-main", "tincan-package"),
        ]
        with tempfile.TemporaryDirectory() as td:
            for idx, (name, subroot, kind) in enumerate(cases):
                out = Path(td) / f"case-{idx}.p2rln"
                report = w.wrap(need(name), out, subroot)
                self.assertEqual(kind, report["detectedFormat"])
                self.assertEqual("0.4.0", report["validation"]["formatVersion"])

    def test_full_wrapping_large_common_cartridge(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "topkit.p2rln"
            report = w.wrap(need("topkit-export(spanish).imscc"), out)
            self.assertEqual("common-cartridge", report["detectedFormat"])
            self.assertEqual(536, report["entities"])
            self.assertTrue(report["preservedBitForBit"])


if __name__ == "__main__":
    unittest.main()
