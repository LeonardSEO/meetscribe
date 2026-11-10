const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");
const { useLocalOnly } = require("../setup/localOnly.js");

useLocalOnly();

// A profile from before local-only: every scope stored on a non-Foundry provider,
// and the Foundry form never opened except for the model.
const STORED = {
  foundryModel: "gpt-x",
  useDictationAgent: "true",
  useDictationTranslation: "true",
  translationTargetLanguage: "de",
  useCleanupModel: "true",
  dictationAgentMode: "providers",
  dictationAgentProvider: "openai",
  dictationAgentModel: "gpt-5-mini",
  cleanupMode: "providers",
  cleanupProvider: "openai",
  cleanupModel: "gpt-5-mini",
  translationMode: "providers",
  translationProvider: "anthropic",
  translationModel: "claude-haiku-4-5",
};

async function load(t) {
  installBrowserGlobals(t, { initialStorage: STORED });
  const vite = await createRendererServer(t, {
    cachePrefix: "openwhispr-foundry-raw-readers-test-",
    resolveAlias: { "@": path.resolve(__dirname, "../../src") },
  });
  await vite.ssrLoadModule("/models/ModelRegistry.ts");
  const { useSettingsStore } = await vite.ssrLoadModule("/stores/settingsStore.ts");
  const agent = await vite.ssrLoadModule("/helpers/dictationAgentInference.js");
  const translation = await vite.ssrLoadModule("/helpers/dictationTranslationInference.js");
  return { settings: useSettingsStore.getState(), ...agent, ...translation };
}

test("the dictation agent route is Foundry whatever the stored scope says", async (t) => {
  const { settings, resolveDictationAgentInference } = await load(t);
  assert.equal(settings.dictationAgentProvider, "openai", "precondition");
  const route = resolveDictationAgentInference(settings);
  assert.equal(route.config.provider, "foundry");
  assert.equal(route.model, "gpt-x");
  assert.equal(route.reachable, true);
  assert.equal(route.displayProvider, "foundry");
  assert.equal(route.config.baseUrl, undefined);
  assert.equal(route.config.customApiKey, undefined);
});

test("the agent is unreachable until a Foundry model is set", async (t) => {
  const { settings, resolveDictationAgentInference } = await load(t);
  const route = resolveDictationAgentInference({ ...settings, foundryModel: "" });
  assert.equal(route.reachable, false);
});

test("the translation route is Foundry too", async (t) => {
  const { settings, resolveDictationTranslationInference } = await load(t);
  const route = resolveDictationTranslationInference(settings);
  assert.equal(route.config.provider, "foundry");
  assert.equal(route.model, "gpt-x");
  assert.equal(route.reachable, true);
  assert.equal(route.config.language, "de");
});

test("implicit cleanup dispatches to Foundry", async (t) => {
  const { settings, resolveImplicitCleanupProvider } = await load(t);
  assert.equal(settings.cleanupProvider, "openai", "precondition");
  assert.equal(resolveImplicitCleanupProvider(settings), "foundry");
});
