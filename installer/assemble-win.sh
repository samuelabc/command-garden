#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
WIN_DIR="$DIST_DIR/win-x64/commandGarden"

echo "=== Assembling commandGarden for Windows x64 ==="

rm -rf "$DIST_DIR/win-x64"
mkdir -p "$WIN_DIR/app/cli/dist"
mkdir -p "$WIN_DIR/app/daemon/dist"
mkdir -p "$WIN_DIR/app/daemon/connectors"
mkdir -p "$WIN_DIR/app/app/dist"
mkdir -p "$WIN_DIR/runtime"
mkdir -p "$WIN_DIR/bin"

# 1. Copy runtime node.exe
if [ ! -f "$DIST_DIR/runtime/node.exe" ]; then
  echo "ERROR: node.exe not found at $DIST_DIR/runtime/node.exe"
  echo "Run ./download-node.sh win-x64 first"
  exit 1
fi
cp "$DIST_DIR/runtime/node.exe" "$WIN_DIR/runtime/node.exe"

# 2. Copy CLI dist
cp -r "$MONOREPO_DIR/src/cli/dist/"* "$WIN_DIR/app/cli/dist/"
cp "$MONOREPO_DIR/src/cli/package.json" "$WIN_DIR/app/cli/"

# 3. Copy daemon dist + connectors
cp -r "$MONOREPO_DIR/src/daemon/dist/"* "$WIN_DIR/app/daemon/dist/"
if compgen -G "$MONOREPO_DIR/src/daemon/connectors/*" > /dev/null; then
  cp -r "$MONOREPO_DIR/src/daemon/connectors/"* "$WIN_DIR/app/daemon/connectors/"
fi
cp "$MONOREPO_DIR/src/daemon/package.json" "$WIN_DIR/app/daemon/"

# 4. Copy app dist
cp -r "$MONOREPO_DIR/src/app/dist/"* "$WIN_DIR/app/app/dist/"
cp "$MONOREPO_DIR/src/app/package.json" "$WIN_DIR/app/app/"

# 5. Install production node_modules
echo "Installing production dependencies..."
cp "$SCRIPT_DIR/package.json" "$WIN_DIR/app/"
NPM_LOG="$DIST_DIR/npm-install-win.log"
cd "$WIN_DIR/app"
if npm install --production --ignore-scripts > "$NPM_LOG" 2>&1; then
  tail -3 "$NPM_LOG"
else
  echo "ERROR: npm install failed. Full output:"
  cat "$NPM_LOG"
  exit 1
fi
rm -f package.json package-lock.json
cd "$SCRIPT_DIR"

# 5b. Copy workspace packages (not on npm, needed at runtime by daemon)
mkdir -p "$WIN_DIR/app/node_modules/@commandgarden/shared"
cp -r "$MONOREPO_DIR/src/shared/dist" "$WIN_DIR/app/node_modules/@commandgarden/shared/dist"
cp "$MONOREPO_DIR/src/shared/package.json" "$WIN_DIR/app/node_modules/@commandgarden/shared/package.json"

# 5c. Copy skills
if [ -d "$MONOREPO_DIR/skills" ]; then
  cp -r "$MONOREPO_DIR/skills" "$WIN_DIR/app/app/skills"
  echo "Bundled skills/"
fi

# 6. Copy CLI wrapper
cp "$SCRIPT_DIR/scripts/cg.cmd" "$WIN_DIR/bin/cg.cmd"

# 7. Copy PowerShell launcher
mkdir -p "$WIN_DIR/launcher"
cp "$SCRIPT_DIR/windows/commandgarden.ps1" "$WIN_DIR/launcher/commandgarden.ps1"

# 8. Generate .ico from SVG for installer icon
ICON_SVG="$MONOREPO_DIR/src/chrome/src/assets/icon.svg"
ICO_DIR="$DIST_DIR/win-icon"
rm -rf "$ICO_DIR"
mkdir -p "$ICO_DIR"

if command -v rsvg-convert &>/dev/null && command -v magick &>/dev/null; then
  for SIZE in 16 32 48 64 128 256; do
    rsvg-convert -w $SIZE -h $SIZE "$ICON_SVG" -o "$ICO_DIR/icon_${SIZE}.png"
  done
  magick "$ICO_DIR/icon_16.png" "$ICO_DIR/icon_32.png" "$ICO_DIR/icon_48.png" \
         "$ICO_DIR/icon_64.png" "$ICO_DIR/icon_128.png" "$ICO_DIR/icon_256.png" \
         "$WIN_DIR/commandgarden.ico"
  echo "Generated commandgarden.ico"
elif command -v rsvg-convert &>/dev/null && command -v convert &>/dev/null; then
  for SIZE in 16 32 48 64 128 256; do
    rsvg-convert -w $SIZE -h $SIZE "$ICON_SVG" -o "$ICO_DIR/icon_${SIZE}.png"
  done
  convert "$ICO_DIR/icon_16.png" "$ICO_DIR/icon_32.png" "$ICO_DIR/icon_48.png" \
          "$ICO_DIR/icon_64.png" "$ICO_DIR/icon_128.png" "$ICO_DIR/icon_256.png" \
          "$WIN_DIR/commandgarden.ico"
  echo "Generated commandgarden.ico"
else
  echo "WARNING: rsvg-convert or ImageMagick not found. Skipping .ico generation."
  echo "  Install: brew install librsvg imagemagick"
  echo "  The installer will use a default icon."
fi
rm -rf "$ICO_DIR"

echo ""
echo "=== Windows assembly complete ==="
echo "Output: $WIN_DIR"
du -sh "$WIN_DIR"
