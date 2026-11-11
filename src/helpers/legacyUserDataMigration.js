// Moves the user data folder of the pre-rename app (OpenWhispr) to the folder
// Meetscribe uses, once, before anything reads userData. Never overwrites or
// merges into an existing folder, never copies (a copy could snapshot a profile
// the old app still has open), and never throws.
// Loaded before the single-instance lock: no Electron import, nothing but fs and path.
const nodeFs = require("fs");
const path = require("path");

// Chromium's single-instance lock: a symlink on macOS/Linux, a file on Windows.
const LOCK_NAMES = ["SingletonLock", "lockfile"];
// A virus scanner or indexer can hold a folder for a moment on Windows.
const RENAME_ATTEMPTS = 5;
const RENAME_RETRY_MS = 100;

// Results after which Meetscribe must not start: its own folder would be
// created empty and every later start would skip the move.
const BLOCKING_MIGRATION_RESULTS = new Set(["skipped-legacy-running", "failed"]);

/**
 * Where a channel keeps its user data, and the pre-rename folders to move from.
 * Packaged OpenWhispr builds took their app name from package.json's `name`
 * ("open-whispr"), since electron-builder does not copy `productName` into the
 * packaged package.json; "OpenWhispr" covers builds that did set the name.
 * @param {string} channel
 * @returns {{ targetName: string, legacyNames: string[] }}
 */
function userDataLocation(channel) {
  if (channel === "production") {
    return { targetName: "Meetscribe", legacyNames: ["open-whispr", "OpenWhispr"] };
  }
  return { targetName: `Meetscribe-${channel}`, legacyNames: [`OpenWhispr-${channel}`] };
}

function defaultIsProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return error?.code === "EPERM";
  }
}

function defaultSleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function entryExists(fs, filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
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

/**
 * @param {{ appDataDir: string, targetName: string, legacyNames: string[],
 *   fs?: typeof import("fs"), log?: (message: string, meta?: object) => void,
 *   isProcessAlive?: (pid: number) => boolean, sleep?: (ms: number) => void }} options
 * @returns {"migrated" | "skipped-target-exists" | "skipped-no-legacy" |
 *   "skipped-legacy-running" | "failed"}
 */
function migrateLegacyUserData({
  appDataDir,
  targetName,
  legacyNames,
  fs = nodeFs,
  log,
  isProcessAlive = defaultIsProcessAlive,
  sleep = defaultSleep,
}) {
  const target = path.join(appDataDir, targetName);
  if (entryExists(fs, target)) return "skipped-target-exists";

  const legacy = legacyNames
    .map((name) => path.join(appDataDir, name))
    .find((candidate) => entryExists(fs, candidate));
  if (!legacy) return "skipped-no-legacy";
  if (legacyInstanceRunning(fs, legacy, isProcessAlive)) return "skipped-legacy-running";

  let lastError = null;
  for (let attempt = 1; attempt <= RENAME_ATTEMPTS; attempt += 1) {
    try {
      fs.renameSync(legacy, target);
      return "migrated";
    } catch (error) {
      lastError = error;
      if (attempt < RENAME_ATTEMPTS) sleep(RENAME_RETRY_MS);
    }
  }
  log?.("legacy user data could not be moved", { code: lastError?.code });
  return "failed";
}

module.exports = { migrateLegacyUserData, userDataLocation, BLOCKING_MIGRATION_RESULTS };
