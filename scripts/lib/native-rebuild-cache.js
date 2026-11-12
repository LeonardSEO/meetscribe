// @electron/rebuild skips a native module whose build/Release/.forge-meta names the
// target Electron ABI. `npm rebuild` or `npm test` (which needs a Node build of
// better-sqlite3) replace the binary but leave that marker, so a later package would
// ship a Node build that Electron cannot load. Removing the markers before packaging
// makes electron-builder rebuild every native module for Electron.

const fs = require("fs");
const path = require("path");

const MARKER = path.join("build", "Release", ".forge-meta");

function packageDirs(nodeModulesDir) {
  if (!fs.existsSync(nodeModulesDir)) return [];
  const dirs = [];
  for (const entry of fs.readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const full = path.join(nodeModulesDir, entry.name);
    if (entry.name.startsWith("@")) {
      for (const scoped of fs.readdirSync(full, { withFileTypes: true })) {
        if (scoped.isDirectory()) dirs.push(path.join(full, scoped.name));
      }
    } else {
      dirs.push(full);
    }
  }
  return dirs;
}

function clearNativeRebuildMarkers(nodeModulesDir) {
  const removed = [];
  for (const dir of packageDirs(nodeModulesDir)) {
    const marker = path.join(dir, MARKER);
    if (fs.existsSync(marker)) {
      fs.rmSync(marker, { force: true });
      removed.push(marker);
    }
  }
  return removed;
}

module.exports = { clearNativeRebuildMarkers };
