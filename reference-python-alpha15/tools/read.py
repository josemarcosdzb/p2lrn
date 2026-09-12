#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from p2rln_ref import P2RLNReader, CapabilitySet, ReadError


def print_tree(node, prefix=""):
    print(f"{prefix}{node['type']}: {node['title']} [{node['id']}]")
    for child in node.get("children", []):
        print_tree(child, prefix + "  ")


def main():
    ap = argparse.ArgumentParser(description="Read/inspect a P2RLN package without executing content or fetching remote URLs")
    ap.add_argument("package", type=Path)
    ap.add_argument("--capabilities", type=Path, default=ROOT / "examples" / "capabilities" / "reference-capabilities.json")
    ap.add_argument("--summary", action="store_true")
    ap.add_argument("--tree", action="store_true")
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--transformation", action="store_true")
    ap.add_argument("--import-plan", action="store_true", help="Emit a target-neutral LMS import plan")
    ap.add_argument("--mode", choices=["deliver", "read", "preserve"], default="deliver")
    ap.add_argument("--validate-profile-payloads", action="store_true")
    args = ap.parse_args()
    try:
        reader = P2RLNReader(args.package, strict_profiles=True, validate_profile_payloads=args.validate_profile_payloads)
        caps = CapabilitySet.from_path(args.capabilities)
        if not any((args.summary, args.tree, args.plan, args.transformation, args.import_plan)):
            args.summary = args.tree = args.plan = True
        if args.summary:
            print(json.dumps(reader.summary(), ensure_ascii=False, indent=2))
        if args.tree:
            print_tree(reader.tree())
        if args.plan:
            print(json.dumps(reader.course_read_plan(caps, mode=args.mode), ensure_ascii=False, indent=2))
        if args.transformation:
            print(json.dumps(reader.transformation_report(), ensure_ascii=False, indent=2))
        if args.import_plan:
            print(json.dumps(reader.import_plan(caps), ensure_ascii=False, indent=2))
    except ReadError as exc:
        raise SystemExit(f"ERROR: {exc}")

if __name__ == "__main__":
    main()
