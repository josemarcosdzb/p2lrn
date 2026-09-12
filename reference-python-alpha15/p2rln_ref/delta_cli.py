from __future__ import annotations

import argparse
import json
from pathlib import Path

from .delta import DeltaError, apply_delta, create_delta, inspect_delta


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="p2rln-delta", description="Create and apply detached P2RLN content deltas")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("create", help="create a detached delta from base -> target")
    s.add_argument("base", type=Path)
    s.add_argument("target", type=Path)
    s.add_argument("output", type=Path)
    s.add_argument("--force", action="store_true")
    s.set_defaults(func=lambda a: create_delta(a.base, a.target, a.output, force=a.force))

    s = sub.add_parser("apply", help="reconstruct the target package from base + delta")
    s.add_argument("base", type=Path)
    s.add_argument("delta", type=Path)
    s.add_argument("output", type=Path)
    s.add_argument("--force", action="store_true")
    s.set_defaults(func=lambda a: apply_delta(a.base, a.delta, a.output, force=a.force))

    s = sub.add_parser("inspect", help="validate and display a detached delta manifest")
    s.add_argument("delta", type=Path)
    s.set_defaults(func=lambda a: inspect_delta(a.delta))
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        result = args.func(args)
    except DeltaError as exc:
        raise SystemExit(f"P2RLN Delta error: {exc}") from exc
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
