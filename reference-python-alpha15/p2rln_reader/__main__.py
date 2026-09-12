from __future__ import annotations

import argparse
import json
from pathlib import Path

from .app import P2RLNReadingSystem, ReaderServer, ReaderError


def main() -> None:
    ap = argparse.ArgumentParser(prog="p2rln-reader", description="Open and read a .p2rln package")
    ap.add_argument("package", type=Path)
    ap.add_argument("--summary", action="store_true", help="Print package/reader summary and exit")
    ap.add_argument("--tree", action="store_true", help="Print the portable learning tree and exit")
    ap.add_argument("--read-plan", action="store_true", help="Print a side-effect-free read plan and exit")
    ap.add_argument("--import-plan", action="store_true", help="Print a neutral LMS import plan and exit")
    ap.add_argument("--no-browser", action="store_true", help="Serve the reader UI without opening a browser")
    ap.add_argument("--port", type=int, default=0, help="Local port (0 chooses a free port)")
    ap.add_argument("--no-profile-payload-validation", action="store_true")
    args = ap.parse_args()

    try:
        system = P2RLNReadingSystem(
            args.package,
            validate_profile_payloads=not args.no_profile_payload_validation,
        )
        printed = False
        if args.summary:
            print(json.dumps(system.summary(), ensure_ascii=False, indent=2)); printed = True
        if args.tree:
            print(json.dumps(system.tree(), ensure_ascii=False, indent=2)); printed = True
        if args.read_plan:
            print(json.dumps(system.read_plan(), ensure_ascii=False, indent=2)); printed = True
        if args.import_plan:
            print(json.dumps(system.import_plan(), ensure_ascii=False, indent=2)); printed = True
        if printed:
            return
        server = ReaderServer(system, port=args.port, verbose=False)
        url = server.start()
        print(f"P2RLN Reader: {url}")
        if not args.no_browser:
            server.open_browser()
        try:
            assert server.thread is not None
            server.thread.join()
        except KeyboardInterrupt:
            pass
        finally:
            server.stop()
    except ReaderError as exc:
        raise SystemExit(f"ERROR: {exc}")


if __name__ == "__main__":
    main()
