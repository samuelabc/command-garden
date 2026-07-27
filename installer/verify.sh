#!/bin/bash
set -euo pipefail

# Post-assemble smoke test — verifies the .app bundle structure is correct
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
APP="$DIST_DIR/commandGarden.app"
RES="$APP/Contents/Resources"
ERRORS=0

check() {
  if [ ! "$1" "$2" ]; then
    echo "FAIL: $3"
    ERRORS=$((ERRORS + 1))
  else
    echo "  OK: $3"
  fi
}

echo "=== Verifying commandGarden.app bundle ==="
echo ""

# Bundle structure
check -d "$APP/Contents/MacOS" "Contents/MacOS exists"
check -d "$RES" "Contents/Resources exists"
check -f "$APP/Contents/Info.plist" "Info.plist present"
check -x "$APP/Contents/MacOS/commandgarden" "Launcher is executable"

# Runtime node binary
check -x "$RES/runtime/node" "Runtime Node binary present and executable"

# Check node binary architecture
if [ -x "$RES/runtime/node" ]; then
  NODE_ARCH=$(file "$RES/runtime/node" | grep -o 'arm64\|x86_64' | head -1)
  if [ -n "$NODE_ARCH" ]; then
    echo "  OK: Node binary architecture: $NODE_ARCH"
  else
    echo "FAIL: Cannot determine Node binary architecture"
    ERRORS=$((ERRORS + 1))
  fi
fi

# CLI entry point
check -f "$RES/app/cli/dist/main.js" "CLI entry point exists"
check -f "$RES/app/cli/package.json" "CLI package.json exists"

# Daemon
check -f "$RES/app/daemon/dist/server.js" "Daemon entry point exists"
check -d "$RES/app/daemon/connectors" "Daemon connectors directory exists"

# App GUI
check -d "$RES/app/app/dist" "App dist directory exists"

# Shared package in node_modules
check -f "$RES/app/node_modules/@commandgarden/shared/package.json" "@commandgarden/shared installed"

# CLI wrapper
check -x "$RES/bin/cg" "CLI wrapper script is executable"

# Icon
check -f "$RES/AppIcon.icns" "App icon present"

# Uninstall script
check -x "$RES/uninstall.sh" "Uninstall script is executable"

# Windows-safe paths — enforced here too so this bundle stays a valid proxy
# for the Windows one (see installer/check-bundle-paths.sh)
if ! "$SCRIPT_DIR/check-bundle-paths.sh" "$RES"; then
  ERRORS=$((ERRORS + 1))
fi

# Info.plist version check (should not contain placeholder)
if grep -q "__VERSION__" "$APP/Contents/Info.plist" 2>/dev/null; then
  echo "FAIL: Info.plist still contains __VERSION__ placeholder"
  ERRORS=$((ERRORS + 1))
else
  echo "  OK: Info.plist version is populated"
fi

# Test cg --version if possible
if [ -x "$RES/runtime/node" ] && [ -f "$RES/app/cli/dist/main.js" ]; then
  CG_VERSION=$("$RES/runtime/node" "$RES/app/cli/dist/main.js" --version 2>/dev/null || echo "")
  if [ -n "$CG_VERSION" ]; then
    echo "  OK: cg --version = $CG_VERSION"
  else
    echo "WARN: cg --version returned empty (may need runtime deps)"
  fi
fi

echo ""
if [ $ERRORS -eq 0 ]; then
  echo "=== All checks passed ==="
else
  echo "=== $ERRORS check(s) FAILED ==="
  exit 1
fi
