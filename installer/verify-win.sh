#!/bin/bash
set -euo pipefail

# Post-assemble smoke test — verifies the Windows directory layout is correct
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
WIN_DIR="$DIST_DIR/win-x64/commandGarden"
ERRORS=0

check() {
  if [ ! "$1" "$2" ]; then
    echo "FAIL: $3"
    ERRORS=$((ERRORS + 1))
  else
    echo "  OK: $3"
  fi
}

echo "=== Verifying Windows assembly ==="
echo ""

# Runtime
check -f "$WIN_DIR/runtime/node.exe" "Runtime node.exe present"

# CLI
check -f "$WIN_DIR/app/cli/dist/main.js" "CLI entry point exists"
check -f "$WIN_DIR/app/cli/package.json" "CLI package.json exists"

# Daemon
check -f "$WIN_DIR/app/daemon/dist/server.js" "Daemon entry point exists"
check -d "$WIN_DIR/app/daemon/connectors" "Daemon connectors directory exists"

# App GUI
check -d "$WIN_DIR/app/app/dist" "App dist directory exists"

# Shared package in node_modules
check -f "$WIN_DIR/app/node_modules/@commandgarden/shared/package.json" "@commandgarden/shared installed"

# CLI wrapper
check -f "$WIN_DIR/bin/cg.cmd" "CLI wrapper cg.cmd present"

# PowerShell launcher
check -f "$WIN_DIR/launcher/commandgarden.ps1" "PowerShell launcher present"

# Windows-safe paths — a single bad filename aborts Setup with Error 123
if ! "$SCRIPT_DIR/check-bundle-paths.sh" "$WIN_DIR"; then
  ERRORS=$((ERRORS + 1))
fi

echo ""
if [ $ERRORS -eq 0 ]; then
  echo "=== All checks passed ==="
else
  echo "=== $ERRORS check(s) FAILED ==="
  exit 1
fi
