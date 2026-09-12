#!/usr/bin/env python3
"""Recover the preserved authoritative source package from a transformed P2RLN."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from p2rln_ref import P2RLNReader, ReadError


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("package",type=Path)
    ap.add_argument("output",type=Path)
    args=ap.parse_args()
    r=P2RLNReader(args.package,strict_profiles=True)
    report=r.transformation_report()
    if not report:
        raise SystemExit("ERROR: package has no transformation report")
    source=report["source"]
    path=source.get("preservedPath")
    if not path:
        raise SystemExit("ERROR: transformation report has no preservedPath")
    data=r.read_embedded_file(path,max_bytes=2*1024*1024*1024)
    digest="sha256:"+hashlib.sha256(data).hexdigest()
    if digest!=source["preservedPackageDigest"]:
        raise SystemExit("ERROR: preserved source digest mismatch")
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_bytes(data)
    print(json.dumps({"output":str(args.output),"digest":digest,"preservation":source["preservation"]},indent=2))

if __name__=="__main__": main()
