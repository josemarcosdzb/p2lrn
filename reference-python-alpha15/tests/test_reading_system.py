from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from p2rln_reader import P2RLNReadingSystem, ReaderServer


class ReadingSystemTests(unittest.TestCase):
    def setUp(self):
        self.web = ROOT / "examples" / "web-course.p2rln"
        self.scorm = ROOT / "examples" / "external" / "scorm12-real.p2rln"

    def test_reader_opens_extension_and_builds_course_tree(self):
        system = P2RLNReadingSystem(self.web)
        summary = system.summary()
        tree = system.tree()
        self.assertEqual("P2RLN", summary["format"])
        self.assertEqual("0.4.0", summary["formatVersion"])
        self.assertEqual("course", tree["type"])
        self.assertEqual("Física mínima", tree["title"])

    def test_native_web_resource_is_deliverable_by_reader(self):
        system = P2RLNReadingSystem(self.web)
        resource = next(e for e in system.reader.entities.values() if e["type"] == "resource")
        target = system.view_target(resource["id"], "token")
        self.assertEqual("ready", target.status)
        self.assertEqual("embedded-file", target.kind)
        self.assertTrue(target.url.startswith("/content/outer/"))

    def test_scorm_is_not_falsely_claimed_as_deliverable_without_runtime(self):
        system = P2RLNReadingSystem(self.scorm)
        activity = next(e for e in system.reader.entities.values() if e["type"] == "activity")
        target = system.view_target(activity["id"], "token")
        self.assertEqual("runtime-required", target.status)
        self.assertTrue(target.metadata["preservable"])

    def test_local_http_reader_requires_session_token_and_serves_native_content(self):
        system = P2RLNReadingSystem(self.web)
        server = ReaderServer(system)
        server.start()
        try:
            base = f"http://127.0.0.1:{server.port}"
            with self.assertRaises(HTTPError) as ctx:
                urlopen(base + "/api/summary", timeout=3)
            self.assertEqual(403, ctx.exception.code)

            root = urlopen(server.url, timeout=3)
            cookie = root.headers.get("Set-Cookie").split(";", 1)[0]
            self.assertIn("P2RLN Reader", root.read().decode("utf-8"))

            req = Request(base + "/api/summary", headers={"Cookie": cookie})
            summary = json.loads(urlopen(req, timeout=3).read())
            self.assertEqual("P2RLN Reading System", summary["reader"]["name"])

            resource = next(e for e in system.reader.entities.values() if e["type"] == "resource")
            req = Request(base + "/api/view?id=" + quote(resource["id"]), headers={"Cookie": cookie})
            target = json.loads(urlopen(req, timeout=3).read())
            self.assertEqual("ready", target["status"])
            req = Request(base + target["url"], headers={"Cookie": cookie})
            html = urlopen(req, timeout=3).read().decode("utf-8")
            self.assertIn("Segunda ley de Newton", html)
        finally:
            server.stop()


if __name__ == "__main__":
    unittest.main()
