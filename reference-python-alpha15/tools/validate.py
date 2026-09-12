#!/usr/bin/env python3
"""CLI wrapper around the installable P2RLN reference validator."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from p2rln_ref.validator import *  # re-export for legacy reference tools
from p2rln_ref.validator import ValidationFailure, validate_package


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("package", type=Path)
    ap.add_argument("--strict-profiles", action="store_true")
    ap.add_argument("--validate-profile-payloads", action="store_true")
    args = ap.parse_args()
    try:
        result = validate_package(
            args.package,
            strict_profiles=args.strict_profiles,
            validate_profile_payloads_flag=args.validate_profile_payloads,
        )
    except (ValidationFailure, zipfile.BadZipFile, OSError) as exc:
        print(f"INVALID: {exc}", file=sys.stderr)
        return 1
    print("VALID P2RLN")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
