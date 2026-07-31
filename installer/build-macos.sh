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
PKG_PATH="$DIST_DIR/commandGarden-${VERSION}-${ARCH}.pkg"
DMG_PATH="$DIST_DIR/commandGarden-${VERSION}-${ARCH}.dmg"
DMG_STAGE="$DIST_DIR/dmg-stage-${ARCH}"
TMP_DMG="$DIST_DIR/.tmp-${ARCH}.dmg"
MIN_DMG_BYTES=10485760

# A timed-out or interrupted hdiutil run can leave a disk image attached, whose
# lingering volume name then stalls later runs. Detach any strays under dist/.
detach_stale_dist_images() {
  local dev
  while read -r dev; do
    [[ -z "$dev" ]] && continue
    echo "  Detaching leaked disk image device: $dev"
    hdiutil detach "$dev" -force >/dev/null 2>&1 || true
  done < <(hdiutil info | awk -v dir="$DIST_DIR/" '
    /^image-path/ {
      path = substr($0, index($0, ":") + 2)
      in_dist = (index(path, dir) == 1)
      next
    }
    in_dist && $1 ~ /^\/dev\/disk[0-9]+$/ { print $1; in_dist = 0 }
  ')
}

cleanup_dmg_temps() {
  rm -rf "$DMG_STAGE"
  rm -f "$TMP_DMG"
}
trap cleanup_dmg_temps EXIT

detach_stale_dist_images
cleanup_dmg_temps
rm -f "$DMG_PATH"

# makehybrid builds the HFS+ filesystem without ever attaching a volume, and
# convert is a pure file-to-file operation. Unlike `hdiutil create -srcfolder`,
# neither goes through diskarbitrationd, which is what times out when Spotlight
# holds the temporary volume (dist/ lives under an indexed home directory).
mkdir -p "$DMG_STAGE"
cp "$PKG_PATH" "$DMG_STAGE/"

hdiutil makehybrid \
  -hfs \
  -hfs-volume-name "commandGarden ${VERSION}" \
  -o "$TMP_DMG" \
  "$DMG_STAGE"

hdiutil convert "$TMP_DMG" -format UDZO -ov -o "$DMG_PATH"

cleanup_dmg_temps
trap - EXIT

# A truncated image still reports as a valid UDIF via `hdiutil imageinfo`, so
# check the size too — that is what actually catches a half-written .dmg.
hdiutil verify "$DMG_PATH"
DMG_BYTES=$(stat -f%z "$DMG_PATH")
if [[ "$DMG_BYTES" -lt "$MIN_DMG_BYTES" ]]; then
  echo "ERROR: $DMG_PATH is only ${DMG_BYTES} bytes (expected >= ${MIN_DMG_BYTES})."
  echo "The image is truncated. Remove it and re-run this script."
  exit 1
fi

echo ""
echo "=== Build complete ==="
echo "Installer: $DIST_DIR/commandGarden-${VERSION}-${ARCH}.pkg"
echo "DMG:       $DMG_PATH"
ls -lh "$DIST_DIR/commandGarden-${VERSION}-${ARCH}".*
