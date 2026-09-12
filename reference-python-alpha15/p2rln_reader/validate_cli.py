from __future__ import annotations
import argparse, json
from pathlib import Path
from p2rln_ref.validator import ValidationFailure, validate_package


def main() -> None:
    ap=argparse.ArgumentParser(prog="p2rln-validate")
    ap.add_argument("package",type=Path)
    ap.add_argument("--profile-payloads",action="store_true")
    args=ap.parse_args()
    try:
        result=validate_package(args.package,strict_profiles=True,validate_profile_payloads_flag=args.profile_payloads)
    except ValidationFailure as exc:
        raise SystemExit(f"INVALID: {exc}")
    print(json.dumps(result,ensure_ascii=False,indent=2))
