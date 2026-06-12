# Figma Loader

Replace Figma's colorful loading animation with a simple generic loader.

This repo includes two options:

- `desktop/`: patches the Figma desktop app startup loader.
- `extension/`: unpacked Chrome/Edge extension for `figma.com`.

Default loader color: Figma blue, `#0d99ff`.

## Important

This is unofficial and is not a Figma plugin. Figma plugins can edit the current file after a user runs them, but they cannot continuously restyle Figma's desktop app chrome or startup loader.

The desktop patcher modifies Figma's local Electron `app.asar` file, keeps a backup, and can restore the original. Figma updates may overwrite the patch, so run `status` after updates.

## Desktop App

Install dependencies:

```bash
git clone https://github.com/steinberginc/figmaloader.git
cd figmaloader
npm install
```

Check whether Figma is detected and patched:

```bash
npm run status
```

### Recommended macOS Install

Recent macOS versions may block writes inside the root-owned `/Applications/Figma.app` bundle even when a command is run with `sudo`. The easiest route is to patch a user-owned copy:

```bash
mkdir -p "$HOME/Applications"
ditto /Applications/Figma.app "$HOME/Applications/Figma Blue Loader.app"
node desktop/patch-figma-loader.js patch --app "$HOME/Applications/Figma Blue Loader.app"
open "$HOME/Applications/Figma Blue Loader.app"
```

To restore the copied app:

```bash
node desktop/patch-figma-loader.js restore --app "$HOME/Applications/Figma Blue Loader.app"
```

Or remove the copied app and keep using the original Figma app.

### Patch In Place

If your system allows modifying the installed app bundle, patch with the default blue loader:

```bash
sudo node desktop/patch-figma-loader.js patch
```

Patch with a neutral gray loader:

```bash
sudo node desktop/patch-figma-loader.js patch --color '#8a8f98'
```

Restore Figma's original loader:

```bash
sudo node desktop/patch-figma-loader.js restore
```

Close Figma before running `patch` or `restore`.

### Windows

Run the same commands from an Administrator terminal, but omit `sudo`:

```powershell
node desktop/patch-figma-loader.js patch
node desktop/patch-figma-loader.js restore
```

The patcher tries to find the newest `%LOCALAPPDATA%\Figma\app-*` install automatically.

### Custom App Path

If Figma is installed somewhere else, pass a Figma app folder, a `resources` folder, or `app.asar` directly:

```bash
node desktop/patch-figma-loader.js status --app /path/to/app.asar
sudo node desktop/patch-figma-loader.js patch --app /path/to/Figma.app
```

You can also set:

```bash
export FIGMA_APP_PATH=/path/to/Figma.app
```

## Browser Extension

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable developer mode.
3. Click "Load unpacked".
4. Select the `extension` folder from this repo.
5. Open or refresh `https://www.figma.com`.

Use the extension popup to choose Figma blue, neutral gray, or a custom color.

## Development

Run checks:

```bash
npm run check
```

The desktop patcher was designed to be reversible:

- It creates `app.asar.figma-blue-loader.backup` next to Figma's `app.asar`.
- On macOS, it refreshes the outer app signature after patching.
- `restore` copies the backup back into place.
