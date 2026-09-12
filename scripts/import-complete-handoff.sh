#!/usr/bin/env bash
set -euo pipefail

# Run this from the directory containing:
# P2RLN-0.6.1-Alpha15-H5P-COMPLETE-2026-09-12.zip
# Requires: git, git-lfs, unzip.

ZIP="${1:-P2RLN-0.6.1-Alpha15-H5P-COMPLETE-2026-09-12.zip}"
REPO="${2:-https://github.com/josemarcosfrodo/p2lrn.git}"
WORK="${TMPDIR:-/tmp}/p2lrn-full-import"

command -v git >/dev/null
command -v git-lfs >/dev/null || command -v git-lfs >/dev/null 2>&1
command -v unzip >/dev/null
[ -f "$ZIP" ] || { echo "Missing handoff ZIP: $ZIP" >&2; exit 2; }

rm -rf "$WORK"
git clone "$REPO" "$WORK"
cd "$WORK"
git lfs install --local

TMP_EXTRACT="${TMPDIR:-/tmp}/p2lrn-handoff-extract"
rm -rf "$TMP_EXTRACT"
mkdir -p "$TMP_EXTRACT"
unzip -q "$(cd "$(dirname "$ZIP")" && pwd)/$(basename "$ZIP")" -d "$TMP_EXTRACT"
ROOT="$TMP_EXTRACT/P2RLN-0.6.1-Alpha15-H5P-COMPLETE-2026-09-12"
[ -d "$ROOT" ] || { echo "Unexpected ZIP layout" >&2; exit 3; }
SRC="$ROOT/source/p2rln-0.6.1-alpha15-h5p-hardened"
[ -d "$SRC" ] || { echo "Missing hardened source tree" >&2; exit 4; }

# Canonical project source goes at repository root. Keep Git metadata and the
# upload helper/report already committed in this repository.
find . -mindepth 1 -maxdepth 1 ! -name .git ! -name .gitattributes ! -name scripts ! -name docs ! -name README.md -exec rm -rf {} +
cp -a "$SRC"/. .

mkdir -p release/patches release/evidence release/provenance release/corpus/original-h5p release/artifacts
cp -a "$ROOT/patches"/. release/patches/ 2>/dev/null || true
cp -a "$ROOT/evidence"/. release/evidence/ 2>/dev/null || true
cp -a "$ROOT/provenance"/. release/provenance/ 2>/dev/null || true
cp -a "$ROOT/corpus/original-h5p"/. release/corpus/original-h5p/ 2>/dev/null || true
cp -a "$ROOT/artifacts"/. release/artifacts/ 2>/dev/null || true
cp -a "$ROOT/corpus/p2rln-alpha15-h5p-real-corpus.zip" release/corpus/ 2>/dev/null || true
cp -a "$ROOT/P2RLN-ALPHA15-H5P-FINAL-REPORT.md" docs/ 2>/dev/null || true
cp -a "$ROOT/README-FINAL.md" docs/README-HANDOFF.md 2>/dev/null || true
cp -a "$ROOT/SHA256SUMS.txt" release/ 2>/dev/null || true

# Do not copy a second nested copy of the source ZIP into the repository unless
# explicitly wanted. Git already contains the canonical expanded source.
rm -f release/artifacts/p2rln-0.6.1-alpha15-h5p-hardened-source.zip

git lfs track '*.h5p' '*.p2rln' '*.zip' '*.whl' '*.tgz'
git add .gitattributes .
git status --short
git commit -m 'Import complete P2RLN Alpha15 H5P hardened handoff'
git push origin main

echo "Full P2RLN handoff pushed to $REPO"
