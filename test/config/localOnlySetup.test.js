const test = require("node:test");
const assert = require("node:assert/strict");
const { useLocalOnly } = require("../setup/localOnly.js");

useLocalOnly();

const base = {
  platform: "win32",
  arch: "x64",
  name: null,
  formFactor: "laptop",
  processorName: "Intel Core i5",
  appleChip: null,
  memoryGb: 16,
  graphicsName: null,
  nvidia: null,
  parakeetSupported: true,
  systemLanguages: ["en"],
};
const UNMANAGED = { status: "unmanaged", policy: null, appVersion: null };

test("local-only dictation picks Orukeet for every language group", async () => {
  const { pickDictationModel } = await import("../../src/config/localSetup.ts");
  for (const languages of [["en"], ["nl", "de"], ["hi"], ["hi", "en"], ["ja"], ["xx"]]) {
    assert.equal(pickDictationModel(languages, base).modelId, "orukeet-v0.1.0", String(languages));
  }
});

test("the plan's dictation row is Orukeet for english, hindi and other languages", async () => {
  const { buildLocalSetupPlan } = await import("../../src/config/localSetup.ts");
  for (const spokenLanguages of [["en"], ["hi"], ["ja"], ["nl"]]) {
    const plan = buildLocalSetupPlan({ profile: base, spokenLanguages, policy: UNMANAGED });
    const row = plan.rows.find((r) => r.id === "dictation");
    assert.equal(row.modelId, "orukeet-v0.1.0", String(spokenLanguages));
  }
});

test("LOCAL_ASR_ORGANIZATIONS holds only oruk", async () => {
  const { LOCAL_ASR_ORGANIZATIONS, getSelectedASROrganization } =
    await import("../../src/helpers/localASROrganization.ts");
  assert.deepEqual(
    LOCAL_ASR_ORGANIZATIONS.map((o) => o.id),
    ["oruk"]
  );
  // A blank or foreign model on the nvidia backend still browses the Oruk tab.
  assert.equal(getSelectedASROrganization("nvidia", ""), "oruk");
  assert.equal(getSelectedASROrganization("whisper", "base"), "oruk");
});

test("a Mac too old for Orukeet gets a blocked dictation row, not a download", async () => {
  const { buildLocalSetupPlan } = await import("../../src/config/localSetup.ts");
  const mac = {
    ...base,
    platform: "darwin",
    arch: "arm64",
    parakeetSupported: false,
    memoryGb: 16,
  };
  const plan = buildLocalSetupPlan({ profile: mac, spokenLanguages: ["nl"], policy: UNMANAGED });
  const row = plan.rows.find((r) => r.id === "dictation");
  assert.equal(row.label, "unavailable");
  assert.equal(row.reason, "os");
  assert.equal(row.modelId, "orukeet-v0.1.0");
});
