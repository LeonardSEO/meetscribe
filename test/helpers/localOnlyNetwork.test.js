const test = require("node:test");
const { afterEach, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { useLocalOnly } = require("../setup/localOnly");
const { isBlockedUrl } = require("../../src/helpers/blockedHosts");
const { createRegistryLoader } = require("../../src/helpers/registryLoader");
const seed = require("../../src/models/modelRegistryData.json");

useLocalOnly();

process.env.NODE_ENV = "test";

test("isBlockedUrl blocks OpenWhispr and Gizmo hosts and OpenWhispr GitHub paths", () => {
  for (const url of [
    "https://auth.openwhispr.com/x",
    "https://openwhispr.com/",
    "wss://orukeet.gizmovoice.ai/",
    "https://gizmovoice.ai/",
    "https://raw.githubusercontent.com/OpenWhispr/model-registry/x",
    "https://raw.githubusercontent.com/openwhispr/model-registry/x",
    "https://api.github.com/repos/OpenWhispr/openwhispr/releases",
    "https://github.com/OpenWhispr/openwhispr/issues",
    "https://AUTH.OpenWhispr.com./x",
  ]) {
    assert.equal(isBlockedUrl(url), true, url);
  }
});

test("isBlockedUrl allows Hugging Face, user endpoints, look-alikes and invalid input", () => {
  for (const url of [
    "https://huggingface.co/oruk/orukeet",
    "https://x.openai.azure.com/openai/v1",
    "https://notopenwhispr.com/",
    "https://openwhispr.com.evil.example/",
    "https://api.github.com/repos/ggml-org/llama.cpp/releases",
    "https://github.com/OpenWhisprX/foo",
    "https://raw.githubusercontent.com/other/OpenWhispr/x",
    "not a url",
    "",
  ]) {
    assert.equal(isBlockedUrl(url), false, url);
  }
});

test("isBlockedUrl allows everything outside local-only", () => {
  const saved = globalThis.__OW_UPSTREAM_MODE;
  globalThis.__OW_UPSTREAM_MODE = true;
  try {
    assert.equal(isBlockedUrl("https://auth.openwhispr.com/x"), false);
  } finally {
    if (saved === undefined) delete globalThis.__OW_UPSTREAM_MODE;
    else globalThis.__OW_UPSTREAM_MODE = saved;
  }
});

test("the registry loader stays bundled and never fetches in local-only", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ow-local-registry-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const requests = [];
  const delete_ = process.env.OPENWHISPR_MODEL_REGISTRY_MODE;
  delete process.env.OPENWHISPR_MODEL_REGISTRY_MODE;
  t.after(() => {
    if (delete_ !== undefined) process.env.OPENWHISPR_MODEL_REGISTRY_MODE = delete_;
  });
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const loader = createRegistryLoader({
    cachePath: path.join(dir, "model-registry.json"),
    bundledSnapshot: { data: seed, manifestVersion: 1 },
    clientContract: "c".repeat(64),
    trustedKeys: {},
    appVersion: "1.0.0",
    applySnapshot: () => {},
    fetch: async (url) => {
      requests.push(url);
      return new Response("{}");
    },
  });
  t.after(() => loader.stop());
  await loader.start();
  t.mock.timers.tick(60 * 60 * 1000);
  await loader.refresh();
  assert.deepEqual(requests, []);
});

const updaterModulePath = require.resolve("../../src/updater.js");
const originalLoad = Module._load;
const originalPlatform = process.platform;

function loadUpdater(autoUpdater) {
  delete require.cache[updaterModulePath];
  Module._load = function loadWithMocks(request, parent, isMain) {
    if (request === "electron-updater") return { autoUpdater };
    if (request === "electron") return { autoUpdater: { on() {}, removeListener() {} } };
    return originalLoad.call(this, request, parent, isMain);
  };
  const UpdateManager = require(updaterModulePath);
  return new UpdateManager();
}

beforeEach((t) => {
  t.mock.method(console, "log", () => {});
  Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
});
afterEach(() => {
  Module._load = originalLoad;
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
});

test("local-only never sets the update feed and never checks for updates", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const calls = { feed: 0, check: 0 };
  const autoUpdater = {
    setFeedURL() {
      calls.feed += 1;
    },
    on() {},
    removeListener() {},
    checkForUpdates() {
      calls.check += 1;
      return Promise.resolve({ isUpdateAvailable: false });
    },
  };
  const manager = loadUpdater(autoUpdater);
  manager.checkForUpdatesOnStartup();
  t.mock.timers.tick(5 * 60 * 60 * 1000);
  const result = await manager.checkForUpdates();
  manager.cleanup?.();
  assert.equal(calls.feed, 0);
  assert.equal(calls.check, 0);
  assert.equal(result.updateAvailable, false);
});

test("blockDisabledHosts cancels blocked requests on a session and passes others", () => {
  const { blockDisabledHosts } = require("../../src/helpers/blockedHosts");
  let listener;
  const logged = [];
  const fakeSession = {
    webRequest: {
      onBeforeRequest(filter, fn) {
        assert.deepEqual(filter, { urls: ["<all_urls>"] });
        listener = fn;
      },
    },
  };
  blockDisabledHosts(fakeSession, (host) => logged.push(host));
  const run = (url) => {
    let result;
    listener({ url }, (r) => (result = r));
    return result;
  };
  assert.deepEqual(run("https://api.openwhispr.com/v1/x?token=secret"), { cancel: true });
  assert.deepEqual(run("https://huggingface.co/oruk/orukeet"), {});
  assert.deepEqual(logged, ["api.openwhispr.com"]);
});
