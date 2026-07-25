#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$MONOREPO_DIR/src/cli/package.json','utf8')).version)")
ARCH="${1:-arm64}"
PLATFORM="darwin-${ARCH}"

echo "=== Building commandGarden installer v${VERSION} for macOS ${ARCH} ==="
echo ""

# Step 1: Build all packages
echo "--- Step 1: Building all packages ---"
cd "$MONOREPO_DIR"
npm run build
echo ""

# Step 2: Download Node binary
echo "--- Step 2: Downloading Node.js runtime ---"
cd "$SCRIPT_DIR"
./download-node.sh "$PLATFORM"
echo ""

# Step 3: Assemble .app bundle
echo "--- Step 3: Assembling .app bundle ---"
./assemble.sh
echo ""

# Step 3b: Verify bundle
echo "--- Step 3b: Verifying bundle ---"
./verify.sh
echo ""

# Step 4: Build .pkg
echo "--- Step 4: Building .pkg installer ---"
mkdir -p "$DIST_DIR/pkg"

pkgbuild \
  --root "$DIST_DIR/commandGarden.app" \
  --identifier "com.commandgarden.app" \
  --version "$VERSION" \
  --install-location "/Applications/commandGarden.app" \
  --scripts "$SCRIPT_DIR/macos/scripts" \
  "$DIST_DIR/pkg/commandGarden-component.pkg"

DIST_XML="$DIST_DIR/Distribution.xml"
sed "s/__HOST_ARCH__/$ARCH/" "$SCRIPT_DIR/macos/Distribution.xml" > "$DIST_XML"

productbuild \
  --distribution "$DIST_XML" \
  --package-path "$DIST_DIR/pkg" \
  --version "$VERSION" \
  "$DIST_DIR/commandGarden-${VERSION}-${ARCH}.pkg"

echo ""
echo "--- Step 5: Creating .dmg ---"
DMG_PATH="$DIST_DIR/commandGarden-${VERSION}-${ARCH}.dmg"
rm -f "$DMG_PATH"
hdiutil create \
  -volname "commandGarden ${VERSION}" \
  -srcfolder "$DIST_DIR/commandGarden-${VERSION}-${ARCH}.pkg" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

echo ""
echo "=== Build complete ==="
echo "Installer: $DIST_DIR/commandGarden-${VERSION}-${ARCH}.pkg"
echo "DMG:       $DMG_PATH"
ls -lh "$DIST_DIR/commandGarden-${VERSION}-${ARCH}".*
