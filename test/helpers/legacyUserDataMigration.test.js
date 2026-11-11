const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { migrateLegacyUserData } = require("../../src/helpers/legacyUserDataMigration");

function setup(t, { legacy = {}, target = null } = {}) {
  const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "userdata-migration-"));
  t.after(() => fs.rmSync(appDataDir, { recursive: true, force: true }));
  const legacyDir = path.join(appDataDir, "OpenWhispr");
  const targetDir = path.join(appDataDir, "Meetscribe");
  if (legacy) {
    for (const [name, content] of Object.entries(legacy)) {
      fs.mkdirSync(path.dirname(path.join(legacyDir, name)), { recursive: true });
      fs.writeFileSync(path.join(legacyDir, name), content);
    }
  }
  if (target) {
    for (const [name, content] of Object.entries(target)) {
      fs.mkdirSync(path.dirname(path.join(targetDir, name)), { recursive: true });
      fs.writeFileSync(path.join(targetDir, name), content);
    }
  }
  return { appDataDir, legacyDir, targetDir };
}

const names = { targetName: "Meetscribe", legacyName: "OpenWhispr" };

test("moves legacy dir when target is missing", (t) => {
  const { appDataDir, legacyDir, targetDir } = setup(t, {
    legacy: { "notes.db": "db", "Local Storage/leveldb/000003.log": "ls" },
  });
  assert.equal(migrateLegacyUserData({ appDataDir, ...names }), "migrated");
  assert.equal(fs.readFileSync(path.join(targetDir, "notes.db"), "utf8"), "db");
  assert.equal(
    fs.readFileSync(path.join(targetDir, "Local Storage/leveldb/000003.log"), "utf8"),
    "ls"
  );
  assert.equal(fs.existsSync(legacyDir), false);
});

test("skips when target exists", (t) => {
  const { appDataDir, legacyDir, targetDir } = setup(t, {
    legacy: { "notes.db": "old" },
    target: { "notes.db": "new" },
  });
  assert.equal(migrateLegacyUserData({ appDataDir, ...names }), "skipped-target-exists");
  assert.equal(fs.readFileSync(path.join(legacyDir, "notes.db"), "utf8"), "old");
  assert.equal(fs.readFileSync(path.join(targetDir, "notes.db"), "utf8"), "new");
});

test("skips when there is no legacy dir", (t) => {
  const { appDataDir, targetDir } = setup(t, { legacy: null });
  assert.equal(migrateLegacyUserData({ appDataDir, ...names }), "skipped-no-legacy");
  assert.equal(fs.existsSync(targetDir), false);
});

for (const lockName of ["SingletonLock", "lockfile"]) {
  test(`skips while legacy instance holds ${lockName}`, (t) => {
    const { appDataDir, legacyDir, targetDir } = setup(t, {
      legacy: { "notes.db": "db", [lockName]: "" },
    });
    assert.equal(migrateLegacyUserData({ appDataDir, ...names }), "skipped-legacy-running");
    assert.equal(fs.existsSync(path.join(legacyDir, "notes.db")), true);
    assert.equal(fs.existsSync(targetDir), false);
  });
}

test("skips while a SingletonLock symlink points at a live process", (t) => {
  // Chromium's lock on macOS/Linux is a symlink to "<host>-<pid>" that resolves to
  // nothing; existsSync follows it and would report false.
  const { appDataDir, targetDir } = setup(t, { legacy: { "notes.db": "db" } });
  fs.symlinkSync("somehost-12345", path.join(appDataDir, "OpenWhispr", "SingletonLock"));
  const result = migrateLegacyUserData({
    appDataDir,
    ...names,
    isProcessAlive: (pid) => pid === 12345,
  });
  assert.equal(result, "skipped-legacy-running");
  assert.equal(fs.existsSync(targetDir), false);
});

test("migrates past a stale SingletonLock left by a crash", (t) => {
  const { appDataDir, targetDir } = setup(t, { legacy: { "notes.db": "db" } });
  fs.symlinkSync("somehost-12345", path.join(appDataDir, "OpenWhispr", "SingletonLock"));
  const result = migrateLegacyUserData({ appDataDir, ...names, isProcessAlive: () => false });
  assert.equal(result, "migrated");
  assert.equal(fs.readFileSync(path.join(targetDir, "notes.db"), "utf8"), "db");
});

test("copies when rename fails", (t) => {
  const { appDataDir, legacyDir, targetDir } = setup(t, { legacy: { "notes.db": "db" } });
  const fsStub = {
    ...fs,
    renameSync() {
      const error = new Error("cross-device link not permitted");
      error.code = "EXDEV";
      throw error;
    },
  };
  assert.equal(migrateLegacyUserData({ appDataDir, ...names, fs: fsStub }), "copied");
  assert.equal(fs.readFileSync(path.join(targetDir, "notes.db"), "utf8"), "db");
  assert.equal(fs.existsSync(path.join(legacyDir, "notes.db")), true);
});

test("never throws and removes a half-copied target", (t) => {
  const { appDataDir, targetDir } = setup(t, { legacy: { "notes.db": "db" } });
  const fsStub = {
    ...fs,
    renameSync() {
      throw new Error("rename failed");
    },
    cpSync(from, to) {
      fs.mkdirSync(to, { recursive: true });
      fs.writeFileSync(path.join(to, "partial"), "x");
      throw new Error("disk full");
    },
  };
  const logged = [];
  const result = migrateLegacyUserData({
    appDataDir,
    ...names,
    fs: fsStub,
    log: (message, meta) => logged.push({ message, meta }),
  });
  assert.equal(result, "failed");
  assert.equal(fs.existsSync(targetDir), false);
  assert.ok(logged.length > 0);
});
