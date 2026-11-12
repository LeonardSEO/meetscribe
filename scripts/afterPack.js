// electron-builder afterPack hook
//
// Runs after electron-builder assembles the output directory but before the
// final installer (DMG/NSIS/AppImage) is created. Operates only on the output
// directory — never touches source node_modules/.
//
// 1. Strips non-target platform/arch binaries from onnxruntime-node
//    (saves 150–180 MB per build).
// 2. Wraps the Linux binary in a shell script that forces XWayland, reads
//    user flags from ~/.config/open-whispr-flags.conf, and falls back to
//    --no-sandbox where the Chromium sandbox cannot work (AppImage/tar.gz
//    on distros that restrict unprivileged user namespaces).
// 3. Fails the build if required binaries (ffmpeg-static, ps-list vendor exe,
//    onnx worker script) are missing from app.asar.unpacked/.
// 4. Fails the build if better-sqlite3 does not load in the packaged Electron
//    (a Node build left behind by `npm rebuild`).

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { Arch } = require("app-builder-lib");
const { buildLinuxWrapperScript } = require("./lib/linux-launcher");
const {
  WINDOWS_ONNXRUNTIME_PRIVATE_NAME,
  WINDOWS_ONNXRUNTIME_UPSTREAM_NAME,
} = require("./download-sherpa-onnx");

// ---------------------------------------------------------------------------
// macOS resource binary signing
// ---------------------------------------------------------------------------

function resolveAppPath(context) {
  if (context.electronPlatformName !== "darwin") {
    return context.appOutDir;
  }

  if (context.appOutDir.endsWith(".app")) {
    return context.appOutDir;
  }

  return path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
}

function resolveResourcesDir(context) {
  return context.electronPlatformName === "darwin"
    ? path.join(resolveAppPath(context), "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
}

function collectFiles(rootDir, skipDirs = new Set()) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const files = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (skipDirs.has(fullPath)) continue;
        queue.push(fullPath);
        continue;
      }

      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function collectFrameworks(rootDir) {
  if (!fs.existsSync(rootDir)) return [];

  const out = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.name.endsWith(".framework")) {
        out.push(fullPath);
        // Don't descend into a framework — the bundle is signed as a unit.
        continue;
      }
      queue.push(fullPath);
    }
  }

  return out;
}

function isMachOBinary(filePath) {
  try {
    const description = execFileSync("file", ["-b", filePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return description.includes("Mach-O");
  } catch {
    return false;
  }
}

function registerMacResourceBinariesForSigning(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const resourcesDir = resolveResourcesDir(context);
  const frameworks = collectFrameworks(resourcesDir);
  const skipDirs = new Set(frameworks);
  const machOFiles = collectFiles(resourcesDir, skipDirs).filter(isMachOBinary);
  const toRegister = [...frameworks, ...machOFiles];

  if (toRegister.length === 0) {
    return;
  }

  const macConfig = context.packager.platformSpecificBuildOptions;
  const existingBinaries = Array.isArray(macConfig.binaries) ? macConfig.binaries : [];

  macConfig.binaries = [...new Set([...existingBinaries, ...toRegister])];

  console.log(
    `  afterPack: registered ${frameworks.length} framework(s) and ${machOFiles.length} loose Mach-O file(s) under Contents/Resources for signing`
  );
}

// ---------------------------------------------------------------------------
// onnxruntime-node binary stripping
// ---------------------------------------------------------------------------

function stripOnnxruntimeBinaries(context) {
  const platform = context.electronPlatformName; // darwin | linux | win32
  const archName = Arch[context.arch]; // x64 | arm64 | ia32 | universal

  // Resolve the resources directory inside the packed output
  const resourcesDir = resolveResourcesDir(context);

  const onnxBinDir = path.join(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
    "onnxruntime-node",
    "bin",
    "napi-v6"
  );

  if (!fs.existsSync(onnxBinDir)) return;

  // For universal macOS builds keep both arm64 and x64 under darwin/
  const keepArchs = archName === "universal" ? ["arm64", "x64"] : [archName];

  const platformDirs = fs.readdirSync(onnxBinDir);
  let totalRemoved = 0;

  for (const dir of platformDirs) {
    const fullPath = path.join(onnxBinDir, dir);
    if (!fs.statSync(fullPath).isDirectory()) continue;

    if (dir !== platform) {
      // Wrong platform — remove entirely
      fs.rmSync(fullPath, { recursive: true, force: true });
      totalRemoved++;
      continue;
    }

    // Right platform — strip non-target architectures
    const archDirs = fs.readdirSync(fullPath);
    for (const arch of archDirs) {
      const archPath = path.join(fullPath, arch);
      if (!fs.statSync(archPath).isDirectory()) continue;
      if (!keepArchs.includes(arch)) {
        fs.rmSync(archPath, { recursive: true, force: true });
        totalRemoved++;
      }
    }
  }

  if (totalRemoved > 0) {
    console.log(
      `  afterPack: stripped ${totalRemoved} non-target onnxruntime-node directories (keeping ${platform}/${keepArchs.join(",")})`
    );
  }
}

// ---------------------------------------------------------------------------
// Linux XWayland wrapper
// ---------------------------------------------------------------------------

function wrapLinuxBinary(context) {
  if (context.electronPlatformName !== "linux") return;

  const appDir = context.appOutDir;
  const binaryName = context.packager.executableName;
  const binaryPath = path.join(appDir, binaryName);
  const realBinaryPath = path.join(appDir, binaryName + "-app");

  fs.renameSync(binaryPath, realBinaryPath);

  fs.writeFileSync(binaryPath, buildLinuxWrapperScript(binaryName), { mode: 0o755 });
}

function verifyMeetingAecHelper(context) {
  const platform = context.electronPlatformName;
  const archName = Arch[context.arch];

  if (!["darwin", "linux", "win32"].includes(platform)) {
    return;
  }

  const binaryName = `meeting-aec-helper-${platform}-${archName}${platform === "win32" ? ".exe" : ""}`;
  const resourcesDir = resolveResourcesDir(context);
  const binaryPath = path.join(resourcesDir, "bin", binaryName);

  if (!fs.existsSync(binaryPath)) {
    console.warn(`  afterPack: missing optional meeting AEC helper (${binaryName})`);
    return;
  }

  if (platform !== "win32") {
    fs.chmodSync(binaryPath, 0o755);
  }
}

// download-sherpa-onnx.js renames the bundled ONNX Runtime so the Windows
// loader can never resolve it to C:\Windows\System32\onnxruntime.dll (#2054).
// A stray onnxruntime.dll or a missing private DLL means that step was skipped
// (stale cache, older marker) and Parakeet would die at startup for the user.
function verifyWindowsOnnxRuntimePrivatized(binDir) {
  const strayPath = path.join(binDir, WINDOWS_ONNXRUNTIME_UPSTREAM_NAME);
  if (fs.existsSync(strayPath)) {
    throw new Error(
      `afterPack: ${WINDOWS_ONNXRUNTIME_UPSTREAM_NAME} must not ship (${strayPath}) — download-sherpa-onnx.js renames it to ${WINDOWS_ONNXRUNTIME_PRIVATE_NAME}; re-run the sherpa download with --force`
    );
  }
  const privatePath = path.join(binDir, WINDOWS_ONNXRUNTIME_PRIVATE_NAME);
  if (!fs.existsSync(privatePath)) {
    throw new Error(
      `afterPack: missing ${privatePath} — the bundled ONNX Runtime was not extracted and renamed; Parakeet would die at startup on Windows`
    );
  }
}

// compile:winkeys and download:windows-key-listener only warn when they can't
// produce the key listener, so without this check a build ships where Hold and
// modifier-only hotkeys (the default Control+Super) never fire (#2005).
function verifyWindowsKeyListener(binDir) {
  const listenerPath = path.join(binDir, "windows-key-listener.exe");
  if (!fs.existsSync(listenerPath)) {
    throw new Error(
      `afterPack: missing ${listenerPath} — run npm run compile:winkeys on Windows (compiles with MSVC, MinGW or Clang, or downloads the prebuilt binary); Push-to-Talk and modifier-only hotkeys would never fire on Windows`
    );
  }
}

function verifyUnpackedBinaries(context) {
  const unpackedDir = path.join(resolveResourcesDir(context), "app.asar.unpacked");
  const unpackedModulesDir = path.join(unpackedDir, "node_modules");

  const isWindows = context.electronPlatformName === "win32";

  const ffmpegPath = path.join(
    unpackedModulesDir,
    "ffmpeg-static",
    isWindows ? "ffmpeg.exe" : "ffmpeg"
  );
  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(
      `afterPack: missing ${ffmpegPath} — ffmpeg-static was not unpacked from app.asar (asarUnpack/packaging failure); the packed app cannot spawn FFmpeg`
    );
  }

  const onnxWorkerPath = path.join(unpackedDir, "src", "workers", "onnxWorker.js");
  if (!fs.existsSync(onnxWorkerPath)) {
    throw new Error(
      `afterPack: missing ${onnxWorkerPath} — src/workers was not unpacked from app.asar (asarUnpack/packaging failure); the ONNX utility process would crash-loop in the packed app`
    );
  }

  // electron-builder strips *.exe from node_modules on non-Windows targets,
  // so the ps-list vendor executable only exists in Windows builds.
  if (isWindows) {
    const psListVendorDir = path.join(unpackedModulesDir, "ps-list", "vendor");
    const hasFastlist =
      fs.existsSync(psListVendorDir) &&
      fs.readdirSync(psListVendorDir).some((name) => /^fastlist-.*\.exe$/.test(name));
    if (!hasFastlist) {
      throw new Error(
        `afterPack: no fastlist-*.exe in ${psListVendorDir} — ps-list vendor executable was not unpacked from app.asar (asarUnpack/packaging failure); Windows process detection would break`
      );
    }
    const binDir = path.join(resolveResourcesDir(context), "bin");
    verifyWindowsOnnxRuntimePrivatized(binDir);
    verifyWindowsKeyListener(binDir);
  }

  console.log("  afterPack: verified unpacked bundled binaries");
}

// ---------------------------------------------------------------------------
// Native modules must load in the packaged Electron
// ---------------------------------------------------------------------------

// A native module built for Node instead of Electron (a stale @electron/rebuild
// marker after `npm rebuild`) packages fine and only fails at launch, so load each
// one with the packaged executable in Node mode (RunAsNode fuse) and fail the build.
function verifyNativeModulesLoad(executable, modulePaths, run = execFileSync) {
  for (const modulePath of modulePaths) {
    try {
      run(executable, ["-e", `require(${JSON.stringify(modulePath)})`], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
      });
    } catch (error) {
      // Electron prints its minified bootstrap before the error; keep only the cause.
      const output = String(error.stderr || error.message || "");
      const cause = output
        .split("\n")
        .filter((line) => /Error|NODE_MODULE_VERSION|compiled against/.test(line) && line.length < 400);
      const detail = (cause.length ? cause.join("\n") : output.slice(-400)).trim();
      throw new Error(
        `afterPack: ${path.basename(modulePath)} does not load in the packaged Electron. ` +
          `Run \`node scripts/clear-native-rebuild-cache.js\` and build again.\n${detail}`
      );
    }
  }
}

function verifyPackagedNativeModules(context) {
  // The packaged executable can only run on its own platform and architecture.
  const hostArch = process.arch === "arm64" ? Arch.arm64 : process.arch === "x64" ? Arch.x64 : null;
  if (context.electronPlatformName !== process.platform || context.arch !== hostArch) return;
  if (!["darwin", "win32"].includes(process.platform)) return;

  const productFilename = context.packager.appInfo.productFilename;
  const executable =
    process.platform === "darwin"
      ? path.join(resolveAppPath(context), "Contents", "MacOS", productFilename)
      : path.join(context.appOutDir, `${productFilename}.exe`);
  const unpacked = path.join(resolveResourcesDir(context), "app.asar.unpacked", "node_modules");
  const modules = [path.join(unpacked, "better-sqlite3", "build", "Release", "better_sqlite3.node")];

  verifyNativeModulesLoad(executable, modules);
  console.log("  afterPack: native modules load in the packaged Electron");
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

exports.default = async function (context) {
  stripOnnxruntimeBinaries(context);
  wrapLinuxBinary(context);
  verifyMeetingAecHelper(context);
  verifyUnpackedBinaries(context);
  verifyPackagedNativeModules(context);
  registerMacResourceBinariesForSigning(context);
};

exports.verifyWindowsOnnxRuntimePrivatized = verifyWindowsOnnxRuntimePrivatized;
exports.verifyWindowsKeyListener = verifyWindowsKeyListener;
exports.verifyNativeModulesLoad = verifyNativeModulesLoad;
