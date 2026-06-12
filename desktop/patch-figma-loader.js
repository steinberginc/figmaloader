#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const DEFAULT_COLOR = "#0d99ff";
const PATCH_MARKER = "figma-blue-loader";
const UNPACK_PATTERN = "{**/*.node,**/cursor-dropper-ui3*.png}";

function printUsage() {
  console.log(`Figma Desktop Blue Loader

Usage:
  node patch-figma-loader.js status [--app /path/to/Figma.app-or-app.asar]
  node patch-figma-loader.js patch [--color #0d99ff] [--app /path/to/Figma.app-or-app.asar] [--skip-sign]
  node patch-figma-loader.js restore [--app /path/to/Figma.app-or-app.asar] [--skip-sign]

Notes:
  - Close Figma before running patch or restore.
  - /Applications/Figma.app is usually root-owned, so patch/restore may need sudo.
  - On Windows, run from an Administrator terminal if writing to the Figma install fails.
  - Figma updates can replace app.asar; run status after updates.
`);
}

function parseArgs(argv) {
  const args = {
    appPath: process.env.FIGMA_APP_PATH || "",
    color: DEFAULT_COLOR,
    command: argv[2] || "status",
    skipSign: false
  };

  for (let index = 3; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--app") {
      args.appPath = argv[++index];
    } else if (value === "--color") {
      args.color = argv[++index];
    } else if (value === "--skip-sign") {
      args.skipSign = true;
    } else if (value === "--help" || value === "-h") {
      args.command = "help";
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }

  return args;
}

function assertHexColor(color) {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error(`Expected --color to be a 6-digit hex value like #0d99ff. Received: ${color}`);
  }
}

function findNewestWindowsFigmaInstall() {
  const localAppData = process.env.LOCALAPPDATA;

  if (!localAppData) {
    return "";
  }

  const figmaDir = path.join(localAppData, "Figma");

  if (!fs.existsSync(figmaDir)) {
    return "";
  }

  return fs
    .readdirSync(figmaDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("app-"))
    .map((entry) => path.join(figmaDir, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, "resources", "app.asar")))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    [0] || "";
}

function getDefaultAppPath() {
  if (process.platform === "darwin") {
    return "/Applications/Figma.app";
  }

  if (process.platform === "win32") {
    return findNewestWindowsFigmaInstall();
  }

  return "";
}

function resolveAsarPath(appPath) {
  const input = appPath || getDefaultAppPath();

  if (!input) {
    throw new Error("Could not auto-detect Figma. Pass --app /path/to/app.asar.");
  }

  const resolvedInput = path.resolve(input);

  const candidates = [
    resolvedInput,
    path.join(resolvedInput, "Contents", "Resources", "app.asar"),
    path.join(resolvedInput, "resources", "app.asar"),
    path.join(resolvedInput, "app.asar")
  ];

  const asarPath = candidates.find(
    (candidate) => path.basename(candidate) === "app.asar" && fs.existsSync(candidate)
  );

  if (!asarPath) {
    throw new Error(`Could not find app.asar from ${resolvedInput}`);
  }

  return asarPath;
}

function getAppRoot(asarPath) {
  const resourcesDir = path.dirname(asarPath);

  if (path.basename(resourcesDir) === "Resources" && path.basename(path.dirname(resourcesDir)) === "Contents") {
    return path.dirname(path.dirname(resourcesDir));
  }

  if (path.basename(resourcesDir) === "resources") {
    return path.dirname(resourcesDir);
  }

  return resourcesDir;
}

function getBackupRoot() {
  if (process.env.FIGMA_LOADER_BACKUP_DIR) {
    return path.resolve(process.env.FIGMA_LOADER_BACKUP_DIR);
  }

  const sudoUserHome =
    process.env.SUDO_USER && process.env.SUDO_USER !== "root"
      ? path.join("/Users", process.env.SUDO_USER)
      : "";
  const userHome = sudoUserHome && fs.existsSync(sudoUserHome) ? sudoUserHome : os.homedir();

  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA || userHome,
      "FigmaLoader",
      "backups"
    );
  }

  return path.join(userHome, "Library", "Application Support", "FigmaLoader", "backups");
}

function getPaths(appPath) {
  const asarPath = resolveAsarPath(appPath);
  const resourcesDir = path.dirname(asarPath);
  const appRoot = getAppRoot(asarPath);
  const contentsDir =
    path.basename(resourcesDir) === "Resources" && path.basename(path.dirname(resourcesDir)) === "Contents"
      ? path.dirname(resourcesDir)
      : "";
  const backupSlug = crypto.createHash("sha1").update(asarPath).digest("hex").slice(0, 12);
  const backupRoot = getBackupRoot();

  return {
    appPath: appRoot,
    asarPath,
    asarBackupPath: path.join(resourcesDir, "app.asar.figma-blue-loader.backup"),
    externalAsarBackupPath: path.join(backupRoot, `${backupSlug}-app.asar.backup`),
    codeResourcesPath: contentsDir ? path.join(contentsDir, "_CodeSignature", "CodeResources") : "",
    codeResourcesBackupPath: contentsDir
      ? path.join(contentsDir, "_CodeSignature", "CodeResources.figma-blue-loader.backup")
      : "",
    externalCodeResourcesBackupPath: path.join(backupRoot, `${backupSlug}-CodeResources.backup`),
    infoPlistPath: contentsDir ? path.join(contentsDir, "Info.plist") : ""
  };
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
    ...options
  });
}

function runAsar(args, options = {}) {
  const localAsarBin = path.resolve(
    __dirname,
    "..",
    "node_modules",
    ".bin",
    process.platform === "win32" ? "asar.cmd" : "asar"
  );

  if (fs.existsSync(localAsarBin)) {
    return run(localAsarBin, args, options);
  }

  return run("npx", ["--yes", "@electron/asar", ...args], options);
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "figma-blue-loader-"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertFigmaApp(paths) {
  if (!fs.existsSync(paths.appPath)) {
    throw new Error(`Figma app was not found at ${paths.appPath}`);
  }

  if (!fs.existsSync(paths.asarPath)) {
    throw new Error(`Figma app.asar was not found at ${paths.asarPath}`);
  }
}

function extractLoadingScreen(paths) {
  const tempDir = createTempDir();

  try {
    runAsar(["extract-file", paths.asarPath, "loading_screen.html"], { cwd: tempDir });
    return fs.readFileSync(path.join(tempDir, "loading_screen.html"), "utf8");
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

function isPatched(paths) {
  return extractLoadingScreen(paths).includes(PATCH_MARKER);
}

function copyFileWithFallback(sourcePath, preferredPath, fallbackPath, label) {
  if (preferredPath && fs.existsSync(preferredPath)) {
    return preferredPath;
  }

  if (fallbackPath && fs.existsSync(fallbackPath)) {
    return fallbackPath;
  }

  if (preferredPath) {
    try {
      fs.copyFileSync(sourcePath, preferredPath);
      console.log(`Backed up ${label} to ${preferredPath}`);
      return preferredPath;
    } catch (error) {
      if (!["EACCES", "EPERM", "EROFS"].includes(error.code)) {
        throw error;
      }

      console.log(`Could not back up ${label} inside the app bundle (${error.code}); using user backup folder.`);
    }
  }

  if (!fallbackPath) {
    throw new Error(`No fallback backup path configured for ${label}`);
  }

  fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
  fs.copyFileSync(sourcePath, fallbackPath);
  console.log(`Backed up ${label} to ${fallbackPath}`);
  return fallbackPath;
}

function findBackupPath(preferredPath, fallbackPath) {
  if (preferredPath && fs.existsSync(preferredPath)) {
    return preferredPath;
  }

  if (fallbackPath && fs.existsSync(fallbackPath)) {
    return fallbackPath;
  }

  return "";
}

function backupOriginals(paths) {
  copyFileWithFallback(
    paths.asarPath,
    paths.asarBackupPath,
    paths.externalAsarBackupPath,
    "app.asar"
  );

  if (fs.existsSync(paths.codeResourcesPath)) {
    copyFileWithFallback(
      paths.codeResourcesPath,
      paths.codeResourcesBackupPath,
      paths.externalCodeResourcesBackupPath,
      "CodeResources"
    );
  }
}

function stripExistingPatch(html) {
  return html
    .replace(
      /\n?  <style id="figma-blue-loader-style">[\s\S]*?<\/style>\n?/g,
      "\n"
    )
    .replace(
      /\n?  <script id="figma-blue-loader-script">[\s\S]*?<\/script>\n?/g,
      "\n"
    )
    .replace(
      /\n?\s*<div id="figma-blue-loader"[\s\S]*?<\/div>\n?/g,
      "\n"
    );
}

function buildPatchStyle(color) {
  return `  <style id="figma-blue-loader-style">
    :root {
      --figma-blue-loader-color: ${color};
    }

    #video {
      display: none !important;
    }

    #figma-blue-loader {
      width: 48px;
      height: 48px;
      border: 4px solid rgba(13, 153, 255, 0.2);
      border-top-color: var(--figma-blue-loader-color);
      border-radius: 50%;
      animation: figma-blue-loader-spin 800ms linear infinite;
      box-sizing: border-box;
    }

    .dark #figma-blue-loader {
      border-color: rgba(255, 255, 255, 0.18);
      border-top-color: var(--figma-blue-loader-color);
    }

    @keyframes figma-blue-loader-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      #figma-blue-loader {
        animation: none;
        border-color: var(--figma-blue-loader-color);
        opacity: 0.88;
      }
    }
  </style>`;
}

function buildPatchScript() {
  return `  <script id="figma-blue-loader-script">
    (() => {
      function getLoader() {
        return document.getElementById('figma-blue-loader');
      }

      function getVideo() {
        return document.getElementById('video');
      }

      function hideVideo() {
        const video = getVideo();

        if (!video) {
          return;
        }

        video.style.display = 'none';

        if (typeof video.pause === 'function') {
          Promise.resolve(video.pause()).catch(() => {});
        }
      }

      function showLoader() {
        const loader = getLoader();

        if (loader) {
          loader.style.display = 'block';
        }

        hideVideo();
      }

      function hideLoader() {
        const loader = getLoader();

        if (loader) {
          loader.style.display = 'none';
        }
      }

      window.showError = function() {
        document.getElementById('error').style.display = 'block';
        hideLoader();
        hideVideo();
      };

      window.hideError = function() {
        document.getElementById('error').style.display = 'none';
        showLoader();
      };

      window.setTheme = function(theme) {
        const SUPPORTED_THEMES = ['dark'];

        if (SUPPORTED_THEMES.includes(theme)) {
          document.body.classList.add(theme);
        }

        showLoader();
      };

      window.endAnimation = function() {
        hideLoader();
        hideVideo();

        if (window.loadingScreenAPI && typeof loadingScreenAPI.loadingAnimationEnded === 'function') {
          loadingScreenAPI.loadingAnimationEnded();
        }
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showLoader, { once: true });
      } else {
        showLoader();
      }
    })();
  </script>`;
}

function patchHtml(html, color) {
  const cleanHtml = stripExistingPatch(html);
  const style = buildPatchStyle(color);
  const script = buildPatchScript();
  const loaderNode =
    '  <div id="figma-blue-loader" role="progressbar" aria-label="Loading"></div>';

  if (!cleanHtml.includes("</head>")) {
    throw new Error("Could not find </head> in loading_screen.html");
  }

  if (!cleanHtml.includes("</video>")) {
    throw new Error("Could not find </video> in loading_screen.html");
  }

  if (!cleanHtml.includes("</body>")) {
    throw new Error("Could not find </body> in loading_screen.html");
  }

  return cleanHtml
    .replace("</head>", `${style}\n</head>`)
    .replace("</video>", `</video>\n\n${loaderNode}`)
    .replace("</body>", `${script}\n</body>`);
}

function maybeUpdateAsarIntegrity(paths, oldHash, newHash) {
  if (process.platform !== "darwin" || !fs.existsSync(paths.infoPlistPath)) {
    return;
  }

  const candidateKeys = ["Resources/app.asar", "Resources/default_app.asar"];
  let updated = false;

  for (const key of candidateKeys) {
    let currentHash = "";

    try {
      currentHash = run("/usr/libexec/PlistBuddy", [
        "-c",
        `Print :ElectronAsarIntegrity:${key}:hash`,
        paths.infoPlistPath
      ]).trim();
    } catch {
      continue;
    }

    if (currentHash !== oldHash) {
      continue;
    }

    run("/usr/libexec/PlistBuddy", [
      "-c",
      `Set :ElectronAsarIntegrity:${key}:hash ${newHash}`,
      paths.infoPlistPath
    ]);
    console.log(`Updated ElectronAsarIntegrity for ${key}`);
    updated = true;
  }

  if (!updated) {
    console.log("No matching ElectronAsarIntegrity app.asar hash needed updating.");
  }
}

function signApp(paths, skipSign) {
  if (skipSign || process.platform !== "darwin" || path.extname(paths.appPath) !== ".app") {
    return;
  }

  console.log("Refreshing the outer macOS app signature...");
  run("codesign", ["--force", "--sign", "-", paths.appPath], { stdio: "inherit" });
}

function patch(paths, color, skipSign) {
  assertHexColor(color);
  assertFigmaApp(paths);

  const tempDir = createTempDir();
  const extractDir = path.join(tempDir, "app");
  const patchedAsarPath = path.join(tempDir, "app.asar");
  const oldHash = sha256(paths.asarPath);

  try {
    backupOriginals(paths);
    console.log("Extracting app.asar...");
    runAsar(["extract", paths.asarPath, extractDir], { stdio: "inherit" });

    const loadingScreenPath = path.join(extractDir, "loading_screen.html");
    const html = fs.readFileSync(loadingScreenPath, "utf8");
    fs.writeFileSync(loadingScreenPath, patchHtml(html, color));

    console.log("Packing patched app.asar...");
    runAsar(["pack", "--unpack", UNPACK_PATTERN, extractDir, patchedAsarPath], {
      stdio: "inherit"
    });
    fs.copyFileSync(patchedAsarPath, paths.asarPath);

    const newHash = sha256(paths.asarPath);
    maybeUpdateAsarIntegrity(paths, oldHash, newHash);
    signApp(paths, skipSign);

    console.log("Patched Figma desktop loader.");
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

function restore(paths, skipSign) {
  assertFigmaApp(paths);
  const asarBackupPath = findBackupPath(paths.asarBackupPath, paths.externalAsarBackupPath);
  const codeResourcesBackupPath = findBackupPath(
    paths.codeResourcesBackupPath,
    paths.externalCodeResourcesBackupPath
  );

  if (!asarBackupPath) {
    throw new Error(
      `No backup found at ${paths.asarBackupPath} or ${paths.externalAsarBackupPath}`
    );
  }

  fs.copyFileSync(asarBackupPath, paths.asarPath);
  console.log("Restored original app.asar backup.");

  if (codeResourcesBackupPath && paths.codeResourcesPath) {
    fs.copyFileSync(codeResourcesBackupPath, paths.codeResourcesPath);
    console.log("Restored original CodeResources backup.");
  } else {
    signApp(paths, skipSign);
  }
}

function status(paths) {
  assertFigmaApp(paths);

  console.log(`Figma app: ${paths.appPath}`);
  console.log(`app.asar: ${paths.asarPath}`);
  console.log(`Backup: ${findBackupPath(paths.asarBackupPath, paths.externalAsarBackupPath) ? "yes" : "no"}`);
  console.log(`Patched: ${isPatched(paths) ? "yes" : "no"}`);

  if (process.platform === "darwin" && path.extname(paths.appPath) === ".app") {
    try {
      run("codesign", ["--verify", "--strict", paths.appPath]);
      console.log("macOS signature: valid");
    } catch {
      console.log("macOS signature: invalid or modified");
    }
  }
}

function main() {
  const args = parseArgs(process.argv);

  if (args.command === "help") {
    printUsage();
    return;
  }

  const paths = getPaths(args.appPath);

  if (args.command === "status") {
    status(paths);
  } else if (args.command === "patch") {
    patch(paths, args.color, args.skipSign);
  } else if (args.command === "restore") {
    restore(paths, args.skipSign);
  } else {
    printUsage();
    throw new Error(`Unknown command: ${args.command}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
}
