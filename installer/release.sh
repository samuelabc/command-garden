#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
CLI_DIR="$MONOREPO_DIR/src/cli"

usage() {
  echo "Usage: ./release.sh <patch|minor|major>"
  echo ""
  echo "Performs a full release:"
  echo "  1. Bumps version in src/cli/package.json"
  echo "  2. Commits and tags"
  echo "  3. Builds all packages"
  echo "  4. Builds macOS installers (arm64 + x64)"
  echo "  5. Builds Windows installer (requires Docker)"
  echo "  6. Pushes commit + tag to origin"
  echo "  7. Creates GitHub Release with installer assets"
  echo ""
  echo "npm publish is done separately (requires browser MFA):"
  echo "  cd src/cli && npm publish --access public"
  exit 1
}

# --- Validation ---

BUMP="${1:-}"
if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  usage
fi

if [[ "$(uname)" != "Darwin" ]]; then
  echo "ERROR: This script must be run on macOS (needed for pkgbuild/hdiutil)."
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo "ERROR: GitHub CLI (gh) is required. Install via: brew install gh"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "ERROR: Not authenticated with GitHub CLI. Run: gh auth login"
  exit 1
fi

if ! command -v docker &>/dev/null; then
  echo "ERROR: Docker is required for the Windows installer build."
  echo "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  exit 1
fi

if ! docker info &>/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not running. Start Docker Desktop first."
  exit 1
fi

CURRENT_BRANCH=$(git -C "$MONOREPO_DIR" rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "ERROR: Must be on 'main' branch (currently on '$CURRENT_BRANCH')."
  exit 1
fi

if [[ -n "$(git -C "$MONOREPO_DIR" status --porcelain)" ]]; then
  echo "ERROR: Working tree is dirty. Commit or stash changes first."
  exit 1
fi

# --- Version Bump ---

echo "=== Bumping version ($BUMP) ==="
cd "$CLI_DIR"
npm version "$BUMP" --no-git-tag-version
NEW_VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('./package.json','utf8')).version)")
echo "New version: $NEW_VERSION"

cd "$MONOREPO_DIR"
git add src/cli/package.json
git commit -m "chore: bump @commandgarden/cli to v${NEW_VERSION}"
git tag "v${NEW_VERSION}"
echo ""

# --- Build ---

echo "=== Building all packages ==="
npm run build
echo ""

# --- Build Installers ---

echo "=== Building macOS installer (arm64) ==="
cd "$SCRIPT_DIR"
./build-macos.sh arm64
ARM64_DMG="$DIST_DIR/commandGarden-${NEW_VERSION}-arm64.dmg"
echo ""

echo "=== Building macOS installer (x64) ==="
./build-macos.sh x64
X64_DMG="$DIST_DIR/commandGarden-${NEW_VERSION}-x64.dmg"
echo ""

echo "=== Building Windows installer ==="
./build-windows.sh
WIN_EXE="$DIST_DIR/commandGarden-${NEW_VERSION}-x64-setup.exe"
echo ""

# --- Verify Assets ---

MISSING=()
[[ ! -f "$ARM64_DMG" ]] && MISSING+=("$ARM64_DMG")
[[ ! -f "$X64_DMG" ]] && MISSING+=("$X64_DMG")
[[ ! -f "$WIN_EXE" ]] && MISSING+=("$WIN_EXE")

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "ERROR: Expected assets not found:"
  printf '  %s\n' "${MISSING[@]}"
  echo ""
  echo "The version bump commit and tag are local-only. To undo:"
  echo "  git reset --hard HEAD~1 && git tag -d v${NEW_VERSION}"
  exit 1
fi

echo "--- All assets built successfully ---"
ls -lh "$ARM64_DMG" "$X64_DMG" "$WIN_EXE"
echo ""

# --- Generate Release Notes ---

PREV_TAG=$(git -C "$MONOREPO_DIR" describe --tags --abbrev=0 "v${NEW_VERSION}^" 2>/dev/null || echo "")
if [[ -n "$PREV_TAG" ]]; then
  RANGE="${PREV_TAG}..v${NEW_VERSION}"
else
  RANGE="v${NEW_VERSION}"
fi

RELEASE_NOTES=""
FEATS=$(git -C "$MONOREPO_DIR" log --oneline "$RANGE" --grep="^feat" --format="- %s" | sed 's/^- feat: /- /' | sed 's/^- feat(/- (/')
FIXES=$(git -C "$MONOREPO_DIR" log --oneline "$RANGE" --grep="^fix" --format="- %s" | sed 's/^- fix: /- /' | sed 's/^- fix(/- (/')
OTHERS=$(git -C "$MONOREPO_DIR" log --oneline "$RANGE" --invert-grep --grep="^feat" --grep="^fix" --grep="^chore: bump" --format="- %s")

if [[ -n "$FEATS" ]]; then
  RELEASE_NOTES+="## Features"$'\n'"${FEATS}"$'\n\n'
fi
if [[ -n "$FIXES" ]]; then
  RELEASE_NOTES+="## Fixes"$'\n'"${FIXES}"$'\n\n'
fi
if [[ -n "$OTHERS" ]]; then
  RELEASE_NOTES+="## Other Changes"$'\n'"${OTHERS}"$'\n\n'
fi

RELEASE_NOTES+="## Install"$'\n\n'
RELEASE_NOTES+="**npm (requires Node.js 20+):**"$'\n'
RELEASE_NOTES+="\`\`\`bash"$'\n'
RELEASE_NOTES+="npm install -g @commandgarden/cli"$'\n'
RELEASE_NOTES+="\`\`\`"$'\n\n'
RELEASE_NOTES+="**macOS:** Download the \`.dmg\` for your architecture below."$'\n'
RELEASE_NOTES+="**Windows:** Download the \`.exe\` installer below."$'\n'

# --- Confirmation ---

echo "============================================"
echo " Ready to release v${NEW_VERSION}"
echo "============================================"
echo ""
echo "  - git push origin main v${NEW_VERSION}"
echo "  - gh release create v${NEW_VERSION} with 3 assets:"
echo "      $(basename "$ARM64_DMG")"
echo "      $(basename "$X64_DMG")"
echo "      $(basename "$WIN_EXE")"
echo ""
read -r -p "Continue? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo ""
  echo "Aborted. The version bump commit and tag are local-only. To undo:"
  echo "  git reset --hard HEAD~1 && git tag -d v${NEW_VERSION}"
  exit 1
fi
echo ""

# --- Push to GitHub ---

echo "=== Pushing to origin ==="
cd "$MONOREPO_DIR"
git push origin main
git push origin "v${NEW_VERSION}"
echo ""

# --- Create GitHub Release ---

echo "=== Creating GitHub Release ==="
gh release create "v${NEW_VERSION}" \
  --title "v${NEW_VERSION}" \
  --notes "$RELEASE_NOTES" \
  "$ARM64_DMG" \
  "$X64_DMG" \
  "$WIN_EXE"

echo ""
echo "=== Release v${NEW_VERSION} complete ==="
echo ""
echo "  GitHub: $(gh release view "v${NEW_VERSION}" --json url -q .url)"
echo ""
echo "  Next step — publish to npm (requires browser MFA):"
echo "    cd src/cli && npm publish --access public"
