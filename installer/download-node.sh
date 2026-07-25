#!/bin/bash
set -euo pipefail

NODE_VERSION="22.16.0"
PLATFORM="${1:-darwin-arm64}"

DIST_DIR="$(cd "$(dirname "$0")" && pwd)/dist"
mkdir -p "$DIST_DIR/runtime"

case "$PLATFORM" in
  darwin-arm64)
    ARCHIVE="node-v${NODE_VERSION}-darwin-arm64.tar.gz"
    URL="https://nodejs.org/dist/v${NODE_VERSION}/${ARCHIVE}"
    ;;
  darwin-x64)
    ARCHIVE="node-v${NODE_VERSION}-darwin-x64.tar.gz"
    URL="https://nodejs.org/dist/v${NODE_VERSION}/${ARCHIVE}"
    ;;
  win-x64)
    ARCHIVE="node-v${NODE_VERSION}-win-x64.zip"
    URL="https://nodejs.org/dist/v${NODE_VERSION}/${ARCHIVE}"
    ;;
  *)
    echo "Unsupported platform: $PLATFORM"
    echo "Usage: $0 [darwin-arm64|darwin-x64|win-x64]"
    exit 1
    ;;
esac

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "Downloading Node.js v${NODE_VERSION} for ${PLATFORM}..."
curl -fsSL "$URL" -o "$TMPDIR/$ARCHIVE"

if [[ "$PLATFORM" == win-* ]]; then
  unzip -q "$TMPDIR/$ARCHIVE" -d "$TMPDIR"
  cp "$TMPDIR/node-v${NODE_VERSION}-${PLATFORM}/node.exe" "$DIST_DIR/runtime/node.exe"
else
  tar -xzf "$TMPDIR/$ARCHIVE" -C "$TMPDIR"
  cp "$TMPDIR/node-v${NODE_VERSION}-${PLATFORM}/bin/node" "$DIST_DIR/runtime/node"
  chmod +x "$DIST_DIR/runtime/node"
fi

echo "Node.js v${NODE_VERSION} extracted to $DIST_DIR/runtime/"
ls -lh "$DIST_DIR/runtime/"
