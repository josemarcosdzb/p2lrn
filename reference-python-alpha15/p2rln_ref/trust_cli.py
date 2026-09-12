from __future__ import annotations

import argparse
import json
from pathlib import Path

from .detached_signature import (
    DetachedSignatureError,
    generate_keypair,
    load_signature,
    sign_package,
    verify_package_signature,
)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="p2rln-trust", description="Detached P2RLN Ed25519 signatures and trust checks")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("keygen", help="generate an Ed25519 signing keypair")
    s.add_argument("private_key", type=Path)
    s.add_argument("public_key", type=Path)
    s.add_argument("--force", action="store_true")
    s.set_defaults(func=lambda a: generate_keypair(a.private_key, a.public_key, force=a.force))

    s = sub.add_parser("sign", help="write a detached .p2rln.sig without modifying the package")
    s.add_argument("package", type=Path)
    s.add_argument("private_key", type=Path)
    s.add_argument("--output", type=Path)
    s.add_argument("--scope", choices=["content", "package"], default="content")
    s.add_argument("--force", action="store_true")
    s.set_defaults(func=lambda a: sign_package(a.package, a.private_key, a.output, scope=a.scope, force=a.force))

    s = sub.add_parser("verify", help="verify package integrity, detached signature and optional trust")
    s.add_argument("package", type=Path)
    s.add_argument("signature", type=Path)
    s.add_argument("--trust-key", type=Path, action="append", default=[])
    s.add_argument("--require-trusted", action="store_true")
    s.set_defaults(func=lambda a: verify_package_signature(
        a.package, a.signature, trusted_public_keys=a.trust_key, require_trusted=a.require_trusted
    ))

    s = sub.add_parser("inspect", help="validate and display a detached signature envelope")
    s.add_argument("signature", type=Path)
    s.set_defaults(func=lambda a: load_signature(a.signature))
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        result = args.func(args)
    except DetachedSignatureError as exc:
        raise SystemExit(f"P2RLN Trust error: {exc}") from exc
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
