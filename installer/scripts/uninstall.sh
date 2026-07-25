#!/bin/bash
# Uninstall commandGarden
# Run directly: /Applications/commandGarden.app/Contents/Resources/uninstall.sh
set -euo pipefail

echo "Uninstalling commandGarden..."

# Stop running services (tolerate failure if not running)
if [ -L /usr/local/bin/cg ]; then
  /usr/local/bin/cg down 2>/dev/null || true
elif [ -x "/Applications/commandGarden.app/Contents/Resources/bin/cg" ]; then
  /Applications/commandGarden.app/Contents/Resources/bin/cg down 2>/dev/null || true
fi

# Remove symlink
if [ -L /usr/local/bin/cg ]; then
  sudo rm -f /usr/local/bin/cg
  echo "  Removed /usr/local/bin/cg symlink"
fi

# Remove application
if [ -d "/Applications/commandGarden.app" ]; then
  sudo rm -rf "/Applications/commandGarden.app"
  echo "  Removed /Applications/commandGarden.app"
fi

# Forget installer receipt
sudo pkgutil --forget com.commandgarden.app 2>/dev/null && echo "  Removed installer receipt" || true

echo ""
read -p "Remove user data (~/.commandgarden)? [y/N] " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  rm -rf "$HOME/.commandgarden"
  echo "  Removed ~/.commandgarden"
fi

echo ""
echo "commandGarden has been uninstalled."
echo "Note: The Chrome extension must be removed separately from chrome://extensions"
