const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");
const { useLocalOnly } = require("../setup/localOnly.js");

useLocalOnly();

const SCOPES = ["dictationCleanup", "dictationAgent", "noteFormatting", "chatIntelligence"];

async function load(t, initialStorage = {}) {
  installBrowserGlobals(t, { initialStorage });
  const vite = await createRendererServer(t, {
    cachePrefix: "openwhispr-foundry-routing-test-",
    resolveAlias: { "@": path.resolve(__dirname, "../../src") },
  });
  await vite.ssrLoadModule("/models/ModelRegistry.ts");
  const store = await vite.ssrLoadModule("/stores/settingsStore.ts");
  return { vite, ...store };
}

test("setFoundryConfig routes every LLM scope to enterprise/foundry", async (t) => {
  const { useSettingsStore, selectResolvedLLMConfig } = await load(t);
  useSettingsStore.getState().setFoundryConfig({ foundryModel: "gpt-x" });
  const state = useSettingsStore.getState();
  for (const scope of SCOPES) {
    const config = selectResolvedLLMConfig(state, scope);
    assert.equal(config.mode, "enterprise", scope);
    assert.equal(config.provider, "foundry", scope);
    assert.equal(config.model, "gpt-x", scope);
  }
  assert.equal(state.foundryWireApi, "responses");
  assert.equal(state.foundryMaxInputTokens, 100000);
  assert.equal(state.foundryMaxOutputTokens, 8000);
});

test("local-only resolves every scope to foundry before anything is saved", async (t) => {
  const { useSettingsStore, selectResolvedLLMConfig } = await load(t, {
    cleanupMode: "providers",
    chatAgentMode: "openwhispr",
    dictationAgentMode: "local",
  });
  const state = useSettingsStore.getState();
  for (const scope of SCOPES) {
    const config = selectResolvedLLMConfig(state, scope);
    assert.equal(config.mode, "enterprise", scope);
    assert.equal(config.provider, "foundry", scope);
    assert.equal(config.model, "", "an empty model yields the existing no-model errors");
  }
});

test("foundry call settings carry no key and no endpoint from the renderer", async (t) => {
  const { vite, useSettingsStore } = await load(t);
  useSettingsStore.getState().setFoundryConfig({
    foundryModel: "gpt-x",
    foundryBaseUrl: "https://x.openai.azure.com/openai/v1",
  });
  const { getEnterpriseCallSettings } = await vite.ssrLoadModule(
    "/services/ai/enterpriseSettings.ts"
  );
  const settings = getEnterpriseCallSettings("foundry", "chatIntelligence");
  assert.equal(settings.apiKey, "");
  assert.equal("foundryBaseUrl" in settings, false);
  assert.equal("foundryWireApi" in settings, false);
});

test("the Foundry output limit caps the requested maxTokens", async (t) => {
  const { vite, useSettingsStore } = await load(t);
  useSettingsStore.getState().setFoundryConfig({ foundryModel: "m", foundryMaxOutputTokens: 1500 });
  const { capFoundryOutputTokens } = await vite.ssrLoadModule("/services/ai/enterpriseSettings.ts");
  assert.equal(capFoundryOutputTokens("foundry", 4096), 1500);
  assert.equal(capFoundryOutputTokens("foundry", 800), 800);
  assert.equal(capFoundryOutputTokens("foundry", undefined), 1500);
  assert.equal(capFoundryOutputTokens("azure", 4096), 4096);
});

test("the default Foundry output limit does not cap the 25k reasoning retry", async (t) => {
  const { vite, useSettingsStore } = await load(t);
  const { capFoundryOutputTokens } = await vite.ssrLoadModule("/services/ai/enterpriseSettings.ts");
  const state = useSettingsStore.getState();
  state.setFoundryConfig({ foundryModel: "m", foundryMaxOutputTokens: 8000 });
  assert.equal(capFoundryOutputTokens("foundry", 25_000), 25_000);
  assert.equal(capFoundryOutputTokens("foundry", 12_000), 8000, "an ordinary request stays capped");
  // A limit the user chose still wins.
  state.setFoundryConfig({ foundryModel: "m", foundryMaxOutputTokens: 4000 });
  assert.equal(capFoundryOutputTokens("foundry", 25_000), 4000);
});

test("the onboarding route has the Foundry step after the local setup", async (t) => {
  const { vite } = await load(t);
  const { getOnboardingRoute } = await vite.ssrLoadModule("/components/onboarding/flow.ts");
  const route = getOnboardingRoute({ authPath: "guest", setupMode: "local", agentAllowed: false });
  assert.deepEqual(route.slice(-2), ["local-setup", "foundry-setup"]);
});

test("a Foundry model gets chat tools", async (t) => {
  const { vite } = await load(t);
  const { chatSupportsTools } = await vite.ssrLoadModule("/components/chat/chatToolSupport.ts");
  const llmConfig = { mode: "enterprise", provider: "foundry", model: "gpt-x" };
  assert.equal(chatSupportsTools({ llmConfig, isCloudAgent: false }), true);
  assert.equal(
    chatSupportsTools({
      llmConfig: { mode: "local", provider: "qwen", model: "tiny-1b" },
      isCloudAgent: false,
    }),
    false
  );
});
