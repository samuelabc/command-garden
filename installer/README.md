# commandGarden Installer (macOS)

Produces a `.pkg` installer wrapped in a `.dmg` that installs commandGarden as a native macOS application. Bundles a Node.js runtime so end users never need to install Node themselves.

## Prerequisites (build machine only)

- macOS 12+
- Node.js 20+ and npm (for building the workspace packages)
- `rsvg-convert` (from librsvg) — for icon generation. Install via `brew install librsvg`
- Xcode Command Line Tools (`xcode-select --install`)

## Building the Installer

```bash
cd installer

# Full build (builds packages, downloads Node, assembles, creates .pkg + .dmg)
./build-macos.sh          # arm64 (Apple Silicon)
./build-macos.sh x64      # Intel

# Or run steps individually:
./download-node.sh darwin-arm64
./assemble.sh
```

Output lands in `installer/dist/`:
- `commandGarden.app` — assembled app bundle
- `commandGarden-<version>-<arch>.pkg` — standalone installer package
- `commandGarden-<version>-<arch>.dmg` — disk image containing the .pkg

## User Happy Path

What end users experience after receiving the `.dmg`:

1. Double-click `commandGarden-x.x.x-arm64.dmg`
2. Double-click the `.pkg` file inside the mounted volume
3. Follow the macOS installer wizard (Continue → Install)
4. Enter admin password when prompted
5. `commandGarden.app` appears in `/Applications`
6. Double-click `commandGarden.app`
7. Browser opens to http://127.0.0.1:9092 (the GUI dashboard)
8. If startup fails, a dialog appears with the error and an "Open Log" button
9. From terminal, `cg` is available at `/usr/local/bin/cg`

## Validation Checklist

After building and installing, verify:

- [ ] `/Applications/commandGarden.app` exists
- [ ] `/usr/local/bin/cg` symlink exists and runs (`cg --version`)
- [ ] Double-clicking app opens browser to the GUI
- [ ] If daemon fails to start, an AppleScript dialog appears with error details
- [ ] App has the correct icon in Finder and Launchpad (green "cG" on black circle)
- [ ] `cg daemon status` shows running after app launch
- [ ] `cg down` stops all services cleanly

## Uninstalling

### Option A: Run the bundled uninstall script

```bash
/Applications/commandGarden.app/Contents/Resources/uninstall.sh
```

This will interactively remove the app and optionally clean user data.

### Option B: Manual steps

```bash
# Stop services
cg down

# Remove app and CLI symlink
sudo rm -rf /Applications/commandGarden.app
sudo rm -f /usr/local/bin/cg

# Clean installer receipt (so macOS doesn't track it anymore)
sudo pkgutil --forget com.commandgarden.app

# (Optional) Remove user data and logs
rm -rf ~/.commandgarden
```

The Chrome extension must be removed separately from `chrome://extensions`.

## Troubleshooting

### App opens but browser doesn't launch

The daemon or GUI server may have failed silently. Check the log:

```bash
cat ~/.commandgarden/daemon.log
```

Or run manually to see live output:

```bash
cg up
```

### "commandGarden failed to start" dialog appears

Click "Open Log" to see the full error. Common causes:
- Port 9091 or 9092 already in use (another instance running?)
- Connector configuration error (check `~/.commandgarden/config.yaml`)

### `cg` command not found

The `/usr/local/bin/cg` symlink may not have been created. Reinstall the .pkg or create it manually:

```bash
sudo ln -sf /Applications/commandGarden.app/Contents/Resources/bin/cg /usr/local/bin/cg
```

### Icon not showing

If the app shows a generic icon after install, touch the app to reset the icon cache:

```bash
touch /Applications/commandGarden.app
killall Finder
```

### "unidentified developer" or app won't open (Gatekeeper)

Since the installer is not code-signed, macOS will quarantine the `.dmg` and `.pkg` when downloaded. Users will see warnings like "can't be opened because Apple cannot check it for malicious software."

**Option A — Right-click Open (simplest):**
1. Right-click (or Control-click) the `.pkg` file
2. Select "Open" from the context menu
3. Click "Open" in the confirmation dialog

**Option B — System Settings:**
1. Try to open the `.pkg` normally (it will be blocked)
2. Open System Settings → Privacy & Security
3. Scroll down — a message about the blocked installer appears
4. Click "Open Anyway"

**Option C — Remove quarantine attribute (advanced):**

```bash
xattr -cr ~/Downloads/commandGarden-*.dmg
```

Or after mounting the DMG:

```bash
xattr -cr /Volumes/commandGarden*/commandGarden-*.pkg
```

> Note: Future releases will include code signing and notarization to eliminate this friction.

### Build fails at icon generation

If `rsvg-convert` is not installed:

```bash
brew install librsvg
```
