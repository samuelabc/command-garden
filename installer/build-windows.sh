#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$MONOREPO_DIR/src/cli/package.json','utf8')).version)")

echo "=== Building commandGarden Windows installer v${VERSION} ==="
echo ""

# Step 1: Build all packages
echo "--- Step 1: Building all packages ---"
cd "$MONOREPO_DIR"
npm run build
echo ""

# Step 2: Download Node.js for Windows
echo "--- Step 2: Downloading Node.js runtime (win-x64) ---"
cd "$SCRIPT_DIR"
./download-node.sh win-x64
echo ""

# Step 3: Assemble Windows directory
echo "--- Step 3: Assembling Windows directory ---"
./assemble-win.sh
echo ""

# Step 4: Verify assembly
echo "--- Step 4: Verifying assembly ---"
./verify-win.sh
echo ""

# Step 5: Compile installer with Inno Setup via Docker
echo "--- Step 5: Compiling Inno Setup installer ---"

if ! command -v docker &>/dev/null; then
  echo "ERROR: Docker is required to cross-compile the Inno Setup installer on macOS."
  echo "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  echo ""
  echo "The assembled Windows directory is ready at: $DIST_DIR/win-x64/commandGarden/"
  echo "You can compile the .iss script manually on a Windows machine with Inno Setup."
  exit 1
fi

docker run --rm \
  -v "$SCRIPT_DIR:/work" \
  -e CG_VERSION="$VERSION" \
  amake/innosetup \
  /work/windows/commandgarden.iss

SETUP_EXE="$DIST_DIR/commandGarden-${VERSION}-x64-setup.exe"
if [ -f "$SETUP_EXE" ]; then
  echo ""
  echo "=== Build complete ==="
  echo "Installer: $SETUP_EXE"
  ls -lh "$SETUP_EXE"
else
  echo ""
  echo "ERROR: Expected output not found at $SETUP_EXE"
  echo "Check the Inno Setup output above for errors."
  exit 1
fi
