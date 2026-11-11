const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const mainPath = path.resolve(__dirname, "../../main.js");
const mainSource = fs.readFileSync(mainPath, "utf8");

const realMigration = require("../../src/helpers/legacyUserDataMigration");

function runStartup({ lockAvailable, hidden, migrationResult = "skipped-target-exists" }) {
  const events = [];
  const paths = { appData: "/fixture/app-data", userData: "/fixture/user-data" };
  const exited = Symbol("app.exit");
  const continued = Symbol("post-lock startup");
  const app = {
    commandLine: { appendSwitch() {} },
    getPath: (name) => paths[name] ?? "/fixture/other",
    setPath: (name, value) => {
      events.push(["setPath", name, value]);
      paths[name] = value;
    },
    setDesktopName() {},
    requestSingleInstanceLock: () => {
      events.push(["lock"]);
      return lockAvailable;
    },
    exit: (code) => {
      events.push(["exit", code]);
      // Model app.exit's immediate termination rather than continuing a mock process.
      throw exited;
    },
  };
  const mocks = {
    electron: {
      app,
      dialog: {
        showErrorBox: (title, message) => events.push(["errorBox", title, message]),
      },
    },
    path,
    http: {},
    tls: { getCACertificates: () => [] },
    dotenv: {
      config: (options) => {
        if (options?.path?.startsWith("/fixture/app-data")) events.push(["dotenv"]);
        return {};
      },
    },
    // Loaded before the lock; it must stay dependency-free (see the test below).
    "./src/config/localOnly": { isLocalOnly: () => true },
    // Moves the pre-rename user data folder before anything reads userData.
    "./src/helpers/legacyUserDataMigration": {
      ...realMigration,
      migrateLegacyUserData: (options) => {
        events.push(["migrate", options]);
        return migrationResult;
      },
    },
    "./src/helpers/xwayland": {
      XWAYLAND_FLAG: "--ozone-platform=x11",
      shouldForceXWayland: () => false,
    },
    "./src/helpers/hotkeyRepeatGate": { createHotkeyRepeatGate() {} },
    "./src/helpers/linuxGpuCompositing": { shouldDisableGpuCompositing: () => false },
    "./src/helpers/linuxUrlSchemeHandler": {
      registerLinuxUrlSchemeHandler: () => ({ registered: true }),
    },
  };
  const context = {
    require: (name) => {
      if (name === "./src/helpers/environment") {
        events.push(["continue"]);
        throw continued;
      }
      assert.ok(Object.hasOwn(mocks, name), `Unexpected startup dependency: ${name}`);
      return mocks[name];
    },
    __dirname: path.dirname(mainPath),
    __filename: mainPath,
    process: {
      platform: "linux",
      execPath: "/fixture/open-whispr",
      argv: ["/fixture/open-whispr", ...(hidden ? ["--hidden"] : []), "fixture-private-arg"],
      env: { OPENWHISPR_CHANNEL: "production" },
      on() {},
    },
    console: {
      warn: (...args) => events.push(["warn", ...args]),
      error: (...args) => events.push(["error", ...args]),
    },
  };
  assert.throws(
    () => vm.runInNewContext(mainSource, context, { filename: mainPath }),
    (error) =>
      error ===
      (lockAvailable && !realMigration.BLOCKING_MIGRATION_RESULTS.has(migrationResult)
        ? continued
        : exited)
  );
  return events;
}

for (const hidden of [false, true]) {
  test(`failed single-instance lock logs before exiting (hidden=${hidden})`, () => {
    const events = runStartup({ lockAvailable: false, hidden });
    assert.deepEqual(
      events.map(([event]) => event),
      ["setPath", "migrate", "dotenv", "lock", "warn", "exit"]
    );
    assert.match(events[4][1], /single-instance lock/i);
    assert.match(events[4][1], /another.*instance.*may/i);
    assert.equal(events[5][1], 0);
    assert.ok(!JSON.stringify(events).includes("fixture-private-arg"));
    assert.ok(!JSON.stringify(events).includes("/fixture/user-data"));
  });
}

test("successful single-instance lock continues startup without failure logging", () => {
  assert.deepEqual(
    runStartup({ lockAvailable: true, hidden: true }).map(([event]) => event),
    ["setPath", "migrate", "dotenv", "lock", "continue"]
  );
});

test("production keeps user data in Meetscribe and migrates into it before reading it", () => {
  const events = runStartup({ lockAvailable: true, hidden: false });
  assert.deepEqual(events[0], [
    "setPath",
    "userData",
    path.join("/fixture/app-data", "Meetscribe"),
  ]);
  const [, options] = events[1];
  assert.equal(options.appDataDir, "/fixture/app-data");
  assert.equal(options.targetName, "Meetscribe");
  assert.deepEqual(options.legacyNames, ["open-whispr", "OpenWhispr"]);
});

for (const migrationResult of ["skipped-legacy-running", "failed"]) {
  test(`a ${migrationResult} migration explains and quits before Meetscribe creates its folder`, () => {
    const events = runStartup({ lockAvailable: true, hidden: false, migrationResult });
    assert.deepEqual(
      events.map(([event]) => event),
      ["setPath", "migrate", "errorBox", "exit"]
    );
    assert.match(events[2][2], migrationResult === "failed" ? /couldn't move/ : /close OpenWhispr/);
    assert.notEqual(events[3][1], 0);
  });
}

test("the user data migration stays light enough to load before the single-instance lock", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../src/helpers/legacyUserDataMigration.js"),
    "utf8"
  );
  const required = [...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
  assert.deepEqual(required.sort(), ["fs", "path"]);
});

test("the localOnly switch stays light enough to load before the single-instance lock", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../src/config/localOnly.js"), "utf8");
  const code = source.replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\brequire\s*\(|^\s*import\s/m);
});
