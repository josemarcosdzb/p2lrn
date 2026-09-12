#!/usr/bin/env python3
"""Neutral P2RLN reader -> writer round-trip.

This tool intentionally does not know SCORM/H5P/cmi5/QTI internals. It proves that
a generic P2RLN implementation can read, reserialize, and preserve all inventoried
payloads while retaining the same logical contentRoot.
"""
from __future__ import annotations
import argparse
import importlib.util
import json
from pathlib import Path
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("p2validate", ROOT / "tools" / "validate.py")
v = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)


def repack(src: Path, dst: Path, *, new_package_id: bool = False):
    before = v.validate_package(src, strict_profiles=True)
    with zipfile.ZipFile(src) as zin:
        manifest = json.loads(zin.read("META-INF/manifest.json"))
        graph = json.loads(zin.read("content/graph.json"))
        payloads = {f["path"]: zin.read(f["path"]) for f in manifest["files"]}

    # Use compact JSON deliberately to make the physical ZIP/graph bytes differ.
    graph_bytes = (json.dumps(graph, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    manifest["graph"]["size"] = len(graph_bytes)
    manifest["graph"]["byteDigest"] = v.sha256(graph_bytes)
    manifest["graph"]["contentDigest"] = v.content_digest(graph_bytes, "application/json", "graph")
    if new_package_id:
        manifest["packageId"] = "urn:uuid:" + str(uuid.uuid4())
    # contentRoot is logical: reformatting graph JSON and packageId changes do not change it.
    manifest["integrity"]["contentRoot"] = v.compute_content_root(manifest)
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")

    dst.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as zout:
        zout.writestr("META-INF/manifest.json", manifest_bytes)
        zout.writestr("content/graph.json", graph_bytes)
        for path, data in sorted(payloads.items()):
            zi = zipfile.ZipInfo(path, date_time=(1980, 1, 1, 0, 0, 0))
            zi.external_attr = 0o100644 << 16
            # Preserved packages are already compressed; avoid recompressing them.
            zi.compress_type = zipfile.ZIP_STORED if path.startswith("packages/sha256/") else zipfile.ZIP_DEFLATED
            zout.writestr(zi, data)
    after = v.validate_package(dst, strict_profiles=True)
    if before["contentRoot"] != after["contentRoot"]:
        raise RuntimeError("logical contentRoot changed during neutral repack")
    return {"source": str(src), "output": str(dst), "before": before, "after": after, "sameContentRoot": True}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=Path)
    ap.add_argument("output", type=Path)
    ap.add_argument("--new-package-id", action="store_true")
    args = ap.parse_args()
    print(json.dumps(repack(args.source, args.output, new_package_id=args.new_package_id), ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
