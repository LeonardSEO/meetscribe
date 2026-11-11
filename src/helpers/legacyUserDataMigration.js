// Moves the user data folder of the pre-rename app (OpenWhispr) to the folder
// Meetscribe uses, once, before anything reads userData. Never overwrites or
// merges into an existing folder, and never throws: a failure leaves the old
// folder where it was and the app starts with an empty one.
// No Electron import, so it runs in plain node tests.
const nodeFs = require("fs");
const path = require("path");

// Chromium's single-instance lock: a symlink on macOS/Linux, a file on Windows.
const LOCK_NAMES = ["SingletonLock", "lockfile"];

function defaultIsProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return error?.code === "EPERM";
  }
}

// A lock left behind by a crash must not block the migration forever. On
// macOS/Linux the lock is a symlink to "<host>-<pid>"; it only counts while that
// process runs. Anything unreadable (the Windows lockfile, an odd target) counts.
function legacyInstanceRunning(fs, legacy, isProcessAlive) {
  for (const name of LOCK_NAMES) {
    const lockPath = path.join(legacy, name);
    if (!entryExists(fs, lockPath)) continue;
    let pid = NaN;
    try {
      pid = Number(/-(\d+)$/.exec(fs.readlinkSync(lockPath))?.[1]);
    } catch {
      // Not a symlink.
    }
    if (!Number.isInteger(pid) || pid <= 0 || isProcessAlive(pid)) return true;
  }
  return false;
}

function entryExists(fs, filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{ appDataDir: string, targetName: string, legacyName: string,
 *   fs?: typeof import("fs"), log?: (message: string, meta?: object) => void,
 *   isProcessAlive?: (pid: number) => boolean }} options
 * @returns {"migrated" | "copied" | "skipped-target-exists" | "skipped-no-legacy" |
 *   "skipped-legacy-running" | "failed"}
 */
function migrateLegacyUserData({
  appDataDir,
  targetName,
  legacyName,
  fs = nodeFs,
  log,
  isProcessAlive = defaultIsProcessAlive,
}) {
  const target = path.join(appDataDir, targetName);
  const legacy = path.join(appDataDir, legacyName);

  if (entryExists(fs, target)) return "skipped-target-exists";
  if (!entryExists(fs, legacy)) return "skipped-no-legacy";
  if (legacyInstanceRunning(fs, legacy, isProcessAlive)) return "skipped-legacy-running";

  try {
    fs.renameSync(legacy, target);
    return "migrated";
  } catch (renameError) {
    log?.("legacy user data rename failed, copying instead", { code: renameError?.code });
  }

  try {
    fs.cpSync(legacy, target, { recursive: true, errorOnExist: true, force: false });
    return "copied";
  } catch (copyError) {
    log?.("legacy user data copy failed", { code: copyError?.code });
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch {
      // Nothing more to do; the app starts with whatever is there.
    }
    return "failed";
  }
}

module.exports = { migrateLegacyUserData };
