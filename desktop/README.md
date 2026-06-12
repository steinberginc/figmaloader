# Desktop Patcher

Patches Figma desktop's Electron `app.asar` archive so the startup loading video is replaced by a simple CSS spinner.

From the repository root:

```bash
npm install
npm run status
sudo node desktop/patch-figma-loader.js patch
```

Restore:

```bash
sudo node desktop/patch-figma-loader.js restore
```

On Windows, run from an Administrator terminal and omit `sudo`.
