const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");
const { useLocalOnly } = require("../setup/localOnly.js");

useLocalOnly();

// Stored non-Foundry values and no BYOK keys: only Foundry can answer.
async function load(t, storage, electronAPI = {}) {
  installBrowserGlobals(t, {
    initialStorage: { cleanupMode: "providers", cleanupProvider: "openai", ...storage },
    window: { electronAPI: { hasFoundryApiKey: async () => true, ...electronAPI } },
  });
  const vite = await createRendererServer(t, {
    cachePrefix: "openwhispr-foundry-availability-test-",
    resolveAlias: { "@": path.resolve(__dirname, "../../src") },
  });
  await vite.ssrLoadModule("/models/ModelRegistry.ts");
  const mod = await vite.ssrLoadModule("/services/ReasoningService.ts");
  // The service starts a 60 s cache-cleanup interval that would keep the process alive.
  t.after(() => mod.default.destroy());
  return mod.default;
}

test("reasoning is available with a Foundry model and its key", async (t) => {
  const service = await load(t, { foundryModel: "gpt-x" });
  assert.equal(await service.isAvailable(), true);
});

test("reasoning is unavailable without a Foundry model", async (t) => {
  const service = await load(t, { foundryModel: "" });
  assert.equal(await service.isAvailable(), false);
});

test("reasoning is unavailable while main holds no Foundry key", async (t) => {
  const service = await load(t, { foundryModel: "gpt-x" }, { hasFoundryApiKey: async () => false });
  assert.equal(await service.isAvailable(), false);
});
