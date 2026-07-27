#!/bin/bash
set -euo pipefail

# Strips test/fixture/doc cruft from a bundled node_modules tree.
#
# Why this exists: published npm tarballs ship their test suites, and some of
# those fixtures have filenames the Windows installer toolchain cannot handle.
# @fastify/send ships test/fixtures/"snow <U+2603>", which the Inno Setup compiler
# (run under Wine in Docker) mangles into an invalid Windows path, making Setup
# fail with "Error 123: The filename, directory name, or volume label syntax is
# incorrect". Pruning also cuts a few MB from every installer.
#
# Usage: ./prune-node-modules.sh <path-to-node_modules>
#
# The lists below are deliberately conservative — only directories and files
# that are never require()'d at runtime. Never add dist/, lib/, src/, build/,
# or any *.js / *.json / *.node / *.wasm pattern here.

NODE_MODULES="${1:-}"

if [ -z "$NODE_MODULES" ] || [ ! -d "$NODE_MODULES" ]; then
  echo "ERROR: prune-node-modules.sh requires a path to an existing node_modules directory"
  echo "Usage: $0 <path-to-node_modules>"
  exit 1
fi

PRUNE_DIRS=(
  test
  tests
  __tests__
  fixtures
  benchmark
  benchmarks
  example
  examples
  docs
  .github
)

PRUNE_FILES=(
  '*.md'
  '*.markdown'
  '*.map'
  '*.tgz'
  '.editorconfig'
  '.eslintrc'
  '.eslintrc.*'
  '.npmignore'
  '.travis.yml'
  '.jshintrc'
  'AUTHORS'
  'CHANGELOG'
)

BEFORE_KB=$(du -sk "$NODE_MODULES" | awk '{print $1}')

for DIR in "${PRUNE_DIRS[@]}"; do
  find "$NODE_MODULES" -type d -name "$DIR" -prune -exec rm -rf {} +
done

FIND_ARGS=()
for PATTERN in "${PRUNE_FILES[@]}"; do
  if [ ${#FIND_ARGS[@]} -gt 0 ]; then
    FIND_ARGS+=(-o)
  fi
  FIND_ARGS+=(-name "$PATTERN")
done
# LICENSE files must survive — we redistribute these packages.
find "$NODE_MODULES" -type f \( "${FIND_ARGS[@]}" \) \
  ! -iname 'LICENSE*' ! -iname 'COPYING*' -delete

AFTER_KB=$(du -sk "$NODE_MODULES" | awk '{print $1}')
SAVED_KB=$((BEFORE_KB - AFTER_KB))

echo "Pruned node_modules: $((BEFORE_KB / 1024))M -> $((AFTER_KB / 1024))M (saved $((SAVED_KB / 1024))M)"
