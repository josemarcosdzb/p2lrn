#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "p2rln_reader" / "web"
SDK = ROOT / "web_sdk"
EXCLUDED = {"app.js", "index.html", "style.css"}
LOCAL_REF = re.compile(r"(?:from\s+|import\()(['\"])(\.{1,2}/[^'\"]+)\1|new URL\((['\"])(\.{1,2}/[^'\"]+)\3")


def sri_sha384(data: bytes) -> str:
    return "sha384-" + base64.b64encode(hashlib.sha384(data).digest()).decode("ascii")


def copy_runtime(dist: Path) -> None:
    for source in sorted(WEB.rglob("*")):
        if not source.is_file():
            continue
        rel = source.relative_to(WEB)
        if rel.parts[0] in EXCLUDED or (len(rel.parts) == 1 and rel.name in EXCLUDED):
            continue
        allowed = source.suffix in {".js", ".css"} or (rel.parts and rel.parts[0] == "runtime-host" and source.suffix == ".html")
        if not allowed:
            continue
        target = dist / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    shutil.copyfile(SDK / "src" / "p2rln.js", dist / "p2rln.js")
    shutil.copyfile(SDK / "src" / "p2rln.esm.js", dist / "p2rln.esm.js")


def validate_local_refs(dist: Path) -> None:
    missing: list[str] = []
    for source in sorted(dist.rglob("*.js")):
        text = source.read_text(encoding="utf-8")
        for match in LOCAL_REF.finditer(text):
            raw = match.group(2) or match.group(4)
            if not raw:
                continue
            path = raw.split("?", 1)[0].split("#", 1)[0]
            target = (source.parent / path).resolve()
            try:
                target.relative_to(dist.resolve())
            except ValueError:
                missing.append(f"{source.relative_to(dist)} -> unsafe {raw}")
                continue
            if not target.is_file():
                missing.append(f"{source.relative_to(dist)} -> missing {raw}")
    if missing:
        raise SystemExit("Web SDK has unresolved local references:\n" + "\n".join(missing))


def write_release(dist: Path) -> None:
    files = []
    for path in sorted(p for p in dist.rglob("*") if p.is_file() and p.name != "release.json"):
        data = path.read_bytes()
        files.append({
            "path": path.relative_to(dist).as_posix(),
            "bytes": len(data),
            "sha256": "sha256:" + hashlib.sha256(data).hexdigest(),
            "sri": sri_sha384(data),
        })
    release = {
        "schema": "https://p2rln.org/schema/web-sdk-release/1",
        "version": "1",
        "webSdkVersion": "0.4.0-alpha.15",
        "toolkitVersion": "0.4.0a15",
        "coreVersion": "0.4.0",
        "entrypoints": {
            "classic": "p2rln.js",
            "module": "p2rln.esm.js",
            "serviceWorker": "p2rln-sw.js",
        },
        "files": files,
    }
    (dist / "release.json").write_text(json.dumps(release, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build(output: Path) -> None:
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    copy_runtime(output)
    validate_local_refs(output)
    write_release(output)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the @p2rln/player Web SDK distribution without rebundling the tested runtime modules.")
    parser.add_argument("--output", type=Path, default=SDK / "dist")
    args = parser.parse_args()
    build(args.output.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
