const test = require("node:test");
const assert = require("node:assert/strict");
const { useLocalOnly } = require("../setup/localOnly.js");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

useLocalOnly();

const nvidiaPc = {
  platform: "win32",
  arch: "x64",
  name: null,
  formFactor: "desktop",
  processorName: "Intel Core i7",
  appleChip: null,
  memoryGb: 32,
  graphicsName: "NVIDIA RTX 4070",
  nvidia: { vramGb: 12 },
  parakeetSupported: true,
  systemLanguages: ["nl"],
};
const UNMANAGED = { status: "unmanaged", policy: null, appVersion: null };

test("local-only setup offers only the dictation row and no graphics pack", async () => {
  const { buildLocalSetupPlan } = await import("../../src/config/localSetup.ts");
  const plan = buildLocalSetupPlan({
    profile: nvidiaPc,
    spokenLanguages: ["nl"],
    policy: UNMANAGED,
  });
  assert.deepEqual(
    plan.rows.map((r) => r.id),
    ["dictation"]
  );
  assert.equal(plan.graphicsPack, null);
  assert.equal(plan.organizationRunsText, false);
});

test("applying the local-only plan leaves AI cleanup off even when the switch is on", async (t) => {
  const { storage } = installBrowserGlobals(t);
  void storage;
  const vite = await createRendererServer(t, { cachePrefix: "ow-local-only-setup-" });
  const store = await vite.ssrLoadModule("/stores/settingsStore.ts");
  const { applyLocalSetupSettings } = await vite.ssrLoadModule(
    "/components/onboarding/localSetupSettings.ts"
  );
  const { buildLocalSetupPlan } = await vite.ssrLoadModule("/config/localSetup.ts");
  const plan = buildLocalSetupPlan({
    profile: nvidiaPc,
    spokenLanguages: ["nl"],
    policy: UNMANAGED,
  });
  applyLocalSetupSettings(plan, { cleanup: true, assistant: true });
  assert.equal(store.useSettingsStore.getState().useCleanupModel, false);
});
