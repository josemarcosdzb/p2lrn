from __future__ import annotations

import argparse
import json
from pathlib import Path

from .external import wrap


def main():
    p = argparse.ArgumentParser(prog="p2rln-convert", description="Convert an existing learning package to P2RLN")
    p.add_argument("source", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--package-root")
    args = p.parse_args()
    print(json.dumps(wrap(args.source, args.output, args.package_root), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
