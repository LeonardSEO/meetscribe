const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { clearNativeRebuildMarkers } = require("../../scripts/lib/native-rebuild-cache");
const { verifyNativeModulesLoad } = require("../../scripts/afterPack");

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "native-rebuild-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function marker(root, ...parts) {
  const dir = path.join(root, ...parts, "build", "Release");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".forge-meta"), "arm64--148");
  fs.writeFileSync(path.join(dir, "addon.node"), "");
  return path.join(dir, ".forge-meta");
}

test("removes the rebuild markers of plain and scoped packages, leaving the binaries", (t) => {
  const root = tempDir(t);
  const plain = marker(root, "better-sqlite3");
  const scoped = marker(root, "@napi-rs", "keyring");
  const removed = clearNativeRebuildMarkers(root);
  assert.deepEqual(removed.sort(), [plain, scoped].sort());
  assert.equal(fs.existsSync(plain), false);
  assert.equal(fs.existsSync(scoped), false);
  assert.equal(fs.existsSync(path.join(path.dirname(plain), "addon.node")), true);
});

test("a node_modules folder without markers, or none at all, removes nothing", (t) => {
  const root = tempDir(t);
  fs.mkdirSync(path.join(root, "left-pad"));
  assert.deepEqual(clearNativeRebuildMarkers(root), []);
  assert.deepEqual(clearNativeRebuildMarkers(path.join(root, "missing")), []);
});

test("passes when every native module loads in the packaged Electron", () => {
  const calls = [];
  const run = (file, args, options) => calls.push({ file, args, env: options.env });
  verifyNativeModulesLoad("/App/Meetscribe", ["/x/better_sqlite3.node"], run);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, "/App/Meetscribe");
  assert.equal(calls[0].env.ELECTRON_RUN_AS_NODE, "1");
  assert.match(calls[0].args.join(" "), /better_sqlite3\.node/);
});

test("fails the build when a native module was compiled for another runtime", () => {
  const run = () => {
    const error = new Error("Command failed");
    error.stderr = Buffer.from(
      "was compiled against a different Node.js version using NODE_MODULE_VERSION 137"
    );
    throw error;
  };
  assert.throws(
    () => verifyNativeModulesLoad("/App/Meetscribe", ["/x/better_sqlite3.node"], run),
    /better_sqlite3\.node does not load in the packaged Electron.*NODE_MODULE_VERSION 137/s
  );
});

test("a load killed without output is tried again before failing the build", () => {
  let calls = 0;
  const run = () => {
    calls += 1;
    if (calls === 1) {
      const error = new Error("spawnSync Meetscribe ETIMEDOUT");
      error.signal = "SIGTERM";
      error.stderr = Buffer.from("");
      throw error;
    }
  };
  verifyNativeModulesLoad("/App/Meetscribe", ["/x/better_sqlite3.node"], run);
  assert.equal(calls, 2);
});

test("a load that keeps getting killed names the signal in the build error", () => {
  const run = () => {
    const error = new Error("spawnSync Meetscribe ETIMEDOUT");
    error.signal = "SIGTERM";
    error.stderr = Buffer.from("");
    throw error;
  };
  assert.throws(
    () => verifyNativeModulesLoad("/App/Meetscribe", ["/x/better_sqlite3.node"], run),
    /signal SIGTERM/
  );
});
