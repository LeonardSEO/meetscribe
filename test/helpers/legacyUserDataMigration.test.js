const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  migrateLegacyUserData,
  userDataLocation,
  BLOCKING_MIGRATION_RESULTS,
} = require("../../src/helpers/legacyUserDataMigration");
const packageJson = require("../../package.json");

function writeTree(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
}

// folders: { "<folder name>": { "<file>": "<content>" } } under a fresh appData.
function setup(t, folders = {}) {
  const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "userdata-migration-"));
  t.after(() => fs.rmSync(appDataDir, { recursive: true, force: true }));
  for (const [folder, files] of Object.entries(folders)) {
    writeTree(path.join(appDataDir, folder), files);
  }
  return { appDataDir, dir: (name) => path.join(appDataDir, name) };
}

const names = { targetName: "Meetscribe", legacyNames: ["open-whispr", "OpenWhispr"] };
const noWait = { sleep: () => {} };

test("production keeps data in Meetscribe and migrates from the folders packaged builds used", () => {
  const { targetName, legacyNames } = userDataLocation("production");
  assert.equal(targetName, "Meetscribe");
  // Packaged builds take their app name from package.json's name (electron-builder
  // does not copy productName into the packaged package.json), so that folder is
  // where an existing install's data is.
  assert.equal(legacyNames[0], packageJson.name);
  assert.deepEqual(legacyNames, ["open-whispr", "OpenWhispr"]);
});

test("other channels keep their own folders", () => {
  assert.deepEqual(userDataLocation("development"), {
    targetName: "Meetscribe-development",
    legacyNames: ["OpenWhispr-development"],
  });
  assert.deepEqual(userDataLocation("staging"), {
    targetName: "Meetscribe-staging",
    legacyNames: ["OpenWhispr-staging"],
  });
});

test("only a running old app or a failed move stops startup", () => {
  assert.deepEqual([...BLOCKING_MIGRATION_RESULTS].sort(), ["failed", "skipped-legacy-running"]);
});

test("moves the legacy folder when the target is missing", (t) => {
  const { appDataDir, dir } = setup(t, {
    "open-whispr": { "transcriptions.db": "db", "Local Storage/leveldb/000003.log": "ls" },
  });
  assert.equal(migrateLegacyUserData({ appDataDir, ...names, ...noWait }), "migrated");
  assert.equal(fs.readFileSync(path.join(dir("Meetscribe"), "transcriptions.db"), "utf8"), "db");
  assert.equal(
    fs.readFileSync(path.join(dir("Meetscribe"), "Local Storage/leveldb/000003.log"), "utf8"),
    "ls"
  );
  assert.equal(fs.existsSync(dir("open-whispr")), false);
});

test("prefers the first legacy folder that exists", (t) => {
  const { appDataDir, dir } = setup(t, {
    "open-whispr": { "transcriptions.db": "current" },
    OpenWhispr: { "transcriptions.db": "older" },
  });
  assert.equal(migrateLegacyUserData({ appDataDir, ...names, ...noWait }), "migrated");
  assert.equal(
    fs.readFileSync(path.join(dir("Meetscribe"), "transcriptions.db"), "utf8"),
    "current"
  );
  assert.equal(fs.existsSync(dir("OpenWhispr")), true);
});

test("falls back to a later legacy folder", (t) => {
  const { appDataDir, dir } = setup(t, { OpenWhispr: { "transcriptions.db": "older" } });
  assert.equal(migrateLegacyUserData({ appDataDir, ...names, ...noWait }), "migrated");
  assert.equal(fs.readFileSync(path.join(dir("Meetscribe"), "transcriptions.db"), "utf8"), "older");
});

test("skips when the target exists", (t) => {
  const { appDataDir, dir } = setup(t, {
    "open-whispr": { "transcriptions.db": "old" },
    Meetscribe: { "transcriptions.db": "new" },
  });
  assert.equal(migrateLegacyUserData({ appDataDir, ...names, ...noWait }), "skipped-target-exists");
  assert.equal(fs.readFileSync(path.join(dir("open-whispr"), "transcriptions.db"), "utf8"), "old");
  assert.equal(fs.readFileSync(path.join(dir("Meetscribe"), "transcriptions.db"), "utf8"), "new");
});

test("skips when there is no legacy folder", (t) => {
  const { appDataDir, dir } = setup(t);
  assert.equal(migrateLegacyUserData({ appDataDir, ...names, ...noWait }), "skipped-no-legacy");
  assert.equal(fs.existsSync(dir("Meetscribe")), false);
});

for (const lockName of ["SingletonLock", "lockfile"]) {
  test(`skips while the old app holds ${lockName}`, (t) => {
    const { appDataDir, dir } = setup(t, {
      "open-whispr": { "transcriptions.db": "db", [lockName]: "" },
    });
    assert.equal(
      migrateLegacyUserData({ appDataDir, ...names, ...noWait }),
      "skipped-legacy-running"
    );
    assert.equal(fs.existsSync(path.join(dir("open-whispr"), "transcriptions.db")), true);
    assert.equal(fs.existsSync(dir("Meetscribe")), false);
  });
}

test("skips while a SingletonLock symlink points at a live process", (t) => {
  // Chromium's lock on macOS/Linux is a symlink to "<host>-<pid>" that resolves to
  // nothing; existsSync follows it and would report false.
  const { appDataDir, dir } = setup(t, { "open-whispr": { "transcriptions.db": "db" } });
  fs.symlinkSync("somehost-12345", path.join(dir("open-whispr"), "SingletonLock"));
  const result = migrateLegacyUserData({
    appDataDir,
    ...names,
    ...noWait,
    isProcessAlive: (pid) => pid === 12345,
  });
  assert.equal(result, "skipped-legacy-running");
  assert.equal(fs.existsSync(dir("Meetscribe")), false);
});

test("migrates past a stale SingletonLock left by a crash", (t) => {
  const { appDataDir, dir } = setup(t, { "open-whispr": { "transcriptions.db": "db" } });
  fs.symlinkSync("somehost-12345", path.join(dir("open-whispr"), "SingletonLock"));
  const result = migrateLegacyUserData({
    appDataDir,
    ...names,
    ...noWait,
    isProcessAlive: () => false,
  });
  assert.equal(result, "migrated");
  assert.equal(fs.readFileSync(path.join(dir("Meetscribe"), "transcriptions.db"), "utf8"), "db");
});

test("retries a rename a scanner briefly holds up", (t) => {
  const { appDataDir, dir } = setup(t, { "open-whispr": { "transcriptions.db": "db" } });
  let attempts = 0;
  const fsStub = {
    ...fs,
    renameSync(from, to) {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error("resource busy");
        error.code = "EBUSY";
        throw error;
      }
      return fs.renameSync(from, to);
    },
  };
  assert.equal(migrateLegacyUserData({ appDataDir, ...names, ...noWait, fs: fsStub }), "migrated");
  assert.equal(attempts, 3);
  assert.equal(fs.readFileSync(path.join(dir("Meetscribe"), "transcriptions.db"), "utf8"), "db");
});

test("a rename that keeps failing reports failed, copies nothing and never throws", (t) => {
  const { appDataDir, dir } = setup(t, { "open-whispr": { "transcriptions.db": "db" } });
  const fsStub = {
    ...fs,
    renameSync() {
      const error = new Error("operation not permitted");
      error.code = "EPERM";
      throw error;
    },
    cpSync() {
      throw new Error("must not copy a possibly open profile");
    },
  };
  const logged = [];
  const result = migrateLegacyUserData({
    appDataDir,
    ...names,
    ...noWait,
    fs: fsStub,
    log: (message, meta) => logged.push({ message, meta }),
  });
  assert.equal(result, "failed");
  assert.equal(fs.existsSync(dir("Meetscribe")), false);
  assert.equal(fs.existsSync(path.join(dir("open-whispr"), "transcriptions.db")), true);
  assert.ok(logged.length > 0);
});
