#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
APP_DIR="$DIST_DIR/commandGarden.app/Contents/Resources"
VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$MONOREPO_DIR/src/cli/package.json','utf8')).version)")

echo "=== Assembling commandGarden.app bundle ==="

# Clean previous assembly
rm -rf "$DIST_DIR/commandGarden.app"
mkdir -p "$APP_DIR/app/cli/dist"
mkdir -p "$APP_DIR/app/daemon/dist"
mkdir -p "$APP_DIR/app/daemon/connectors"
mkdir -p "$APP_DIR/app/app/dist"
mkdir -p "$APP_DIR/runtime"
mkdir -p "$APP_DIR/bin"
mkdir -p "$DIST_DIR/commandGarden.app/Contents/MacOS"

# 1. Copy runtime node binary
if [ ! -f "$DIST_DIR/runtime/node" ]; then
  echo "ERROR: Node binary not found at $DIST_DIR/runtime/node"
  echo "Run ./download-node.sh first"
  exit 1
fi
cp "$DIST_DIR/runtime/node" "$APP_DIR/runtime/node"
chmod +x "$APP_DIR/runtime/node"

# 2. Copy CLI dist
cp -r "$MONOREPO_DIR/src/cli/dist/"* "$APP_DIR/app/cli/dist/"
cp "$MONOREPO_DIR/src/cli/package.json" "$APP_DIR/app/cli/"

# 3. Copy daemon dist + connectors
cp -r "$MONOREPO_DIR/src/daemon/dist/"* "$APP_DIR/app/daemon/dist/"
cp -r "$MONOREPO_DIR/src/daemon/connectors/"* "$APP_DIR/app/daemon/connectors/"
cp "$MONOREPO_DIR/src/daemon/package.json" "$APP_DIR/app/daemon/"

# 4. Copy app dist
cp -r "$MONOREPO_DIR/src/app/dist/"* "$APP_DIR/app/app/dist/"
cp "$MONOREPO_DIR/src/app/package.json" "$APP_DIR/app/app/"

# 5. Install production node_modules
echo "Installing production dependencies..."
cp "$SCRIPT_DIR/package.json" "$APP_DIR/app/"
NPM_LOG="$DIST_DIR/npm-install.log"
cd "$APP_DIR/app"
if npm install --production --ignore-scripts > "$NPM_LOG" 2>&1; then
  tail -3 "$NPM_LOG"
else
  echo "ERROR: npm install failed. Full output:"
  cat "$NPM_LOG"
  exit 1
fi
rm -f package.json package-lock.json
cd "$SCRIPT_DIR"

# 5b. Copy workspace packages into node_modules (not on npm, needed at runtime by daemon)
mkdir -p "$APP_DIR/app/node_modules/@commandgarden/shared"
cp -r "$MONOREPO_DIR/src/shared/dist" "$APP_DIR/app/node_modules/@commandgarden/shared/dist"
cp "$MONOREPO_DIR/src/shared/package.json" "$APP_DIR/app/node_modules/@commandgarden/shared/package.json"

# 5c. Copy skills into app so the GUI server can serve them
if [ -d "$MONOREPO_DIR/skills" ]; then
  cp -r "$MONOREPO_DIR/skills" "$APP_DIR/app/app/skills"
  echo "Bundled skills/"
fi

# 6. Copy wrapper scripts
cp "$SCRIPT_DIR/scripts/cg" "$APP_DIR/bin/cg"
chmod +x "$APP_DIR/bin/cg"

# 7. Copy launcher
cp "$SCRIPT_DIR/macos/commandgarden-launcher" "$DIST_DIR/commandGarden.app/Contents/MacOS/commandgarden"
chmod +x "$DIST_DIR/commandGarden.app/Contents/MacOS/commandgarden"

# 8. Generate .icns from SVG
ICON_SVG="$MONOREPO_DIR/src/chrome/src/assets/icon.svg"
ICONSET_DIR="$DIST_DIR/AppIcon.iconset"
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

if command -v rsvg-convert &>/dev/null; then
  for SIZE in 16 32 64 128 256 512; do
    rsvg-convert -w $SIZE -h $SIZE "$ICON_SVG" -o "$ICONSET_DIR/icon_${SIZE}x${SIZE}.png"
  done
  for SIZE in 16 32 64 128 256 512; do
    DOUBLE=$((SIZE * 2))
    HALF=$SIZE
    rsvg-convert -w $DOUBLE -h $DOUBLE "$ICON_SVG" -o "$ICONSET_DIR/icon_${HALF}x${HALF}@2x.png"
  done
  rsvg-convert -w 1024 -h 1024 "$ICON_SVG" -o "$ICONSET_DIR/icon_512x512@2x.png"
else
  echo "WARNING: rsvg-convert not found. Using sips fallback (lower quality)."
  TMP_PNG="$DIST_DIR/icon_base.png"
  sips -s format png --resampleWidth 1024 "$ICON_SVG" --out "$TMP_PNG" 2>/dev/null || {
    echo "ERROR: Cannot convert icon SVG. Install librsvg: brew install librsvg"
    exit 1
  }
  for SIZE in 16 32 64 128 256 512; do
    sips -z $SIZE $SIZE "$TMP_PNG" --out "$ICONSET_DIR/icon_${SIZE}x${SIZE}.png" >/dev/null
  done
  for SIZE in 16 32 64 128 256 512; do
    DOUBLE=$((SIZE * 2))
    sips -z $DOUBLE $DOUBLE "$TMP_PNG" --out "$ICONSET_DIR/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
  done
  cp "$TMP_PNG" "$ICONSET_DIR/icon_512x512@2x.png"
  rm -f "$TMP_PNG"
fi

iconutil --convert icns --output "$APP_DIR/AppIcon.icns" "$ICONSET_DIR"
rm -rf "$ICONSET_DIR"
echo "Generated AppIcon.icns"

# 9. Generate Info.plist with version
sed "s/__VERSION__/$VERSION/g" "$SCRIPT_DIR/macos/Info.plist" > "$DIST_DIR/commandGarden.app/Contents/Info.plist"

# 10. Copy uninstall script
cp "$SCRIPT_DIR/scripts/uninstall.sh" "$APP_DIR/uninstall.sh"
chmod +x "$APP_DIR/uninstall.sh"

echo ""
echo "=== Assembly complete ==="
echo "App bundle: $DIST_DIR/commandGarden.app"
du -sh "$DIST_DIR/commandGarden.app"
