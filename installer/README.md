# commandGarden Installer

Native installers for macOS and Windows. Bundles a Node.js runtime so end users never need to install Node themselves.

---

## macOS

Produces a `.pkg` installer wrapped in a `.dmg` that installs commandGarden as a native macOS application.

### Prerequisites (build machine only)

- macOS 12+
- Node.js 20+ and npm (for building the workspace packages)
- `rsvg-convert` (from librsvg) — for icon generation. Install via `brew install librsvg`
- Xcode Command Line Tools (`xcode-select --install`)

### Building the Installer

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

### User Happy Path

What end users experience after receiving the `.dmg`:

1. Double-click `commandGarden-x.x.x-arm64.dmg`
2. Double-click the `.pkg` file inside the mounted volume
   - If macOS blocks it ("Apple could not verify ... is free of malware"), see [Gatekeeper](#apple-could-not-verify--is-free-of-malware--unidentified-developer-gatekeeper) below
3. Follow the macOS installer wizard (Continue → Install)
4. Enter admin password when prompted
5. `commandGarden.app` appears in `/Applications`
6. Double-click `commandGarden.app`
7. Browser opens to http://127.0.0.1:9092 (the GUI dashboard)
8. If startup fails, a dialog appears with the error and an "Open Log" button
9. From terminal, `cg` is available at `/usr/local/bin/cg`

### Validation Checklist

After building and installing, verify:

- [ ] `/Applications/commandGarden.app` exists
- [ ] `/usr/local/bin/cg` symlink exists and runs (`cg --version`)
- [ ] Double-clicking app opens browser to the GUI
- [ ] If daemon fails to start, an AppleScript dialog appears with error details
- [ ] App has the correct icon in Finder and Launchpad (green "cG" on black circle)
- [ ] `cg daemon status` shows running after app launch
- [ ] `cg down` stops all services cleanly

### Uninstalling

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

### Troubleshooting

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

### "Apple could not verify ... is free of malware" / "unidentified developer" (Gatekeeper)

Since the installer is not code-signed or notarized, macOS quarantines the `.dmg` and `.pkg` when downloaded. Depending on the macOS version the dialog reads either "Apple could not verify `commandGarden-x.x.x-arm64.pkg` is free of malware that may harm your Mac or compromise your privacy" (macOS 15 Sequoia and later) or "can't be opened because Apple cannot check it for malicious software" (earlier versions).

> On macOS 15+, right-click → Open no longer bypasses this for `.pkg` files. Use one of the options below.

**Option A — System Settings (no terminal):**
1. Double-click the `.pkg`, let it be blocked, and click "Done"
2. Open System Settings → Privacy & Security
3. Scroll to the Security section — a message about the blocked installer appears
4. Click "Open Anyway" and authenticate

**Option B — Remove the quarantine attribute:**

Do this on the `.dmg` *before* mounting it — a mounted DMG volume is read-only, so `xattr` on the `.pkg` inside will fail:

```bash
xattr -d com.apple.quarantine ~/Downloads/commandGarden-*.dmg
open ~/Downloads/commandGarden-*.dmg
```

If you only have the `.pkg` (or already mounted the DMG), copy it out of the volume first:

```bash
cp /Volumes/commandGarden*/commandGarden-*.pkg ~/Downloads/
xattr -cr ~/Downloads/commandGarden-*.pkg
open ~/Downloads/commandGarden-*.pkg
```

**Option C — Install from the command line (bypasses the Gatekeeper UI):**

```bash
sudo installer -pkg ~/Downloads/commandGarden-*.pkg -target /
```

Then verify:

```bash
cg --version
open /Applications/commandGarden.app   # GUI at http://127.0.0.1:9092
```

> Note: Future releases will include code signing and notarization to eliminate this friction.

### Build fails at icon generation

If `rsvg-convert` is not installed:

```bash
brew install librsvg
```

---

## Windows

Produces a per-user `.exe` installer via Inno Setup. Installs to `%LOCALAPPDATA%\commandGarden`, adds `cg` to the user PATH, and creates a Start Menu shortcut.

### Prerequisites (build machine only)

- macOS or Linux (cross-compiles via Docker)
- Node.js 20+ and npm
- Docker Desktop (for running `amake/innosetup` to compile the `.iss` script)
- `rsvg-convert` + ImageMagick (for `.ico` generation). Install via `brew install librsvg imagemagick`

### Building the Installer

```bash
cd installer

# Full build (builds packages, downloads Node for win-x64, assembles, compiles .exe)
./build-windows.sh

# Or run steps individually:
./download-node.sh win-x64
./assemble-win.sh
# Then compile .iss on Windows with Inno Setup, or via Docker:
VERSION=$(node -e "console.log(require('./package.json').version)" --prefix ../src/cli)
docker run --rm -v "$PWD:/work" -e CG_VERSION="$VERSION" amake/innosetup /work/windows/commandgarden.iss
```

Output lands in `installer/dist/`:
- `win-x64/commandGarden/` — assembled directory
- `commandGarden-<version>-x64-setup.exe` — installer executable

### User Happy Path

What end users experience after receiving the `.exe`:

1. Double-click `commandGarden-x.x.x-x64-setup.exe`
2. Follow the installer wizard (Next -> Install)
3. Installer finishes; optionally launches commandGarden
4. Open "commandGarden" from the Start Menu
5. Browser opens to http://127.0.0.1:9092 (the GUI dashboard)
6. If startup fails, a dialog box appears with the error and option to view the log
7. From cmd or PowerShell, `cg` is available on PATH

### Validation Checklist

After building and installing on a Windows machine, verify:

- [ ] `%LOCALAPPDATA%\commandGarden\` exists with runtime, app, bin directories
- [ ] `cg --version` works from a new cmd/PowerShell window
- [ ] Start Menu shortcut launches the app and opens browser
- [ ] If daemon fails, a message box appears with error details
- [ ] `cg daemon status` shows running after app launch
- [ ] `cg down` stops all services cleanly
- [ ] Uninstalling via Add/Remove Programs removes the app and cleans PATH

### Uninstalling

Use Windows **Settings -> Apps -> Installed apps** (or Control Panel -> Add/Remove Programs):
1. Search for "commandGarden"
2. Click Uninstall
3. The uninstaller stops services (`cg down`) and removes the installation directory

The uninstaller also removes `{app}\bin` from the user PATH.

To remove user data (optional):
```cmd
rmdir /s /q "%USERPROFILE%\.commandgarden"
```

The Chrome extension must be removed separately from `chrome://extensions`.

### Troubleshooting

#### `cg` command not found after install

Open a **new** cmd or PowerShell window (existing windows don't pick up PATH changes). If still missing, check that `%LOCALAPPDATA%\commandGarden\bin` is in your user PATH:

```cmd
echo %PATH%
```

#### "commandGarden failed to start" dialog

Click "OK" to open the log file. Common causes:
- Port 9091 or 9092 already in use
- Connector configuration error (check `%USERPROFILE%\.commandgarden\config.yaml`)

#### "Windows protected your PC" (SmartScreen)

Since the installer is not code-signed, Windows SmartScreen may block the `.exe` when first downloaded. Users will see a "Windows protected your PC" dialog.

**To proceed:**
1. Click "More info" in the SmartScreen dialog
2. Click "Run anyway"

> Note: Future releases will include code signing to eliminate this friction.

#### Setup fails with "Error 123: The filename, directory name, or volume label syntax is incorrect"

A file in the bundle has a name the Inno Setup compiler cannot represent. The compiler runs under Wine in Docker, so a UTF-8 filename in a bundled npm package (for example `@fastify/send/test/fixtures/snow ☃`, which broke 3.3.0) is read through an ANSI codepage and baked into the setup as an invalid Windows path. Setup then aborts partway through "Creating directories...".

Two guards exist for this:

- `prune-node-modules.sh` strips `test/`, `fixtures/`, `docs/`, `.github/` and similar from the bundled `node_modules` during both assemblies. This removes the offending files and cuts roughly 20 MB per installer.
- `check-bundle-paths.sh` runs from both `verify.sh` and `verify-win.sh` and fails the build if any bundled path contains a non-ASCII byte, a Windows-reserved character, a trailing dot or space, or is long enough to risk `MAX_PATH`.

If the guard fires, extend the prune lists in `prune-node-modules.sh` rather than removing the check.

#### PowerShell execution policy blocks the launcher

The Start Menu shortcut uses `-ExecutionPolicy Bypass` for the launcher script. If your organization enforces stricter policies via Group Policy, run from cmd instead:

```cmd
cg up
```

---

## Releasing

A unified release script handles the full pipeline — version bump, npm publish, building both platform installers, and creating a GitHub Release with the assets attached:

```bash
cd installer
./release.sh patch   # or minor, or major
```

The script must be run on macOS (for `pkgbuild`/`hdiutil`) with Docker running (for the Windows Inno Setup cross-compilation).

For the full release process documentation, prerequisites, error recovery, and architecture notes, see [`docs/PUBLISHING.md`](../docs/PUBLISHING.md).
