#!/bin/bash
set -euo pipefail

# Fails if any path in an assembled bundle is one the Windows installer
# toolchain cannot handle. This is the guard that stops a repeat of the
# @fastify/send "snow <U+2603>" fixture shipping in 3.3.0 and breaking Setup with
# "Error 123: The filename, directory name, or volume label syntax is
# incorrect".
#
# Runs against both bundles on purpose: the macOS assembly is the cheap proxy
# for the Windows one, so it has to enforce the same invariant.
#
# Usage: ./check-bundle-paths.sh <bundle-root> [max-relative-path-length]

ROOT="${1:-}"
MAX_LEN="${2:-160}"

if [ -z "$ROOT" ] || [ ! -d "$ROOT" ]; then
  echo "ERROR: check-bundle-paths.sh requires a path to an existing bundle directory"
  echo "Usage: $0 <bundle-root> [max-relative-path-length]"
  exit 1
fi

FAILURES=0

cd "$ROOT"

# Relative paths with the leading "./" stripped, so the checks below see the
# same string Windows will (the leading dot would trip the trailing-dot check).
PATHS=$(find . -mindepth 1 | sed 's|^\./||')

# Print offending paths one per line without word-splitting on spaces.
report() {
  while IFS= read -r LINE; do
    [ -n "$LINE" ] && echo "        $LINE"
  done <<< "$1"
}

# 1. Non-ASCII bytes. The Inno Setup compiler runs under Wine in Docker and
#    reads these through an ANSI codepage, producing a mangled, invalid name.
NON_ASCII=$(LC_ALL=C grep '[^ -~]' <<< "$PATHS" || true)
if [ -n "$NON_ASCII" ]; then
  echo "FAIL: bundle contains non-ASCII path(s):"
  report "$NON_ASCII"
  FAILURES=$((FAILURES + 1))
fi

# 2. Characters Windows reserves outright.
ILLEGAL=$(LC_ALL=C grep '[<>:"|?*\\]' <<< "$PATHS" || true)
if [ -n "$ILLEGAL" ]; then
  echo "FAIL: bundle contains path(s) with Windows-illegal characters (<>:\"|?*\\):"
  report "$ILLEGAL"
  FAILURES=$((FAILURES + 1))
fi

# 3. Trailing dots or spaces — legal to create on macOS, unusable on Windows.
TRAILING=$(LC_ALL=C grep -E '[. ](/|$)' <<< "$PATHS" || true)
if [ -n "$TRAILING" ]; then
  echo "FAIL: bundle contains path component(s) ending in a dot or space:"
  report "$TRAILING"
  FAILURES=$((FAILURES + 1))
fi

# 4. Overlong relative paths. Installs go under {localappdata}\commandGarden,
#    so the install root eats roughly 40-60 chars of the 260-char MAX_PATH.
LONG=$(awk -v max="$MAX_LEN" 'length($0) > max' <<< "$PATHS")
if [ -n "$LONG" ]; then
  echo "FAIL: bundle contains path(s) longer than $MAX_LEN chars (MAX_PATH risk):"
  report "$LONG"
  FAILURES=$((FAILURES + 1))
fi

if [ $FAILURES -eq 0 ]; then
  echo "  OK: all bundle paths are Windows-safe"
  exit 0
fi

echo ""
echo "Fix by extending the prune lists in installer/prune-node-modules.sh."
exit 1
