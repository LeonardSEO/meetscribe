const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { useLocalOnly } = require("../setup/localOnly.js");

useLocalOnly();

const modes = ["openwhispr", "providers", "local", "self-hosted", "enterprise"].map((id) => ({
  id,
}));
const read = (p) => fs.readFileSync(path.join(__dirname, "../..", p), "utf8");

test("speech mode selection leaves only local", async () => {
  const { localOnlySpeechModes, localOnlySpeechMode } =
    await import("../../src/helpers/localOnlyEngine.js");
  assert.deepEqual(localOnlySpeechModes(modes), [{ id: "local" }]);
  assert.equal(localOnlySpeechMode("providers"), "local");
  assert.equal(localOnlySpeechMode("openwhispr"), "local");
});

test("effective settings resolve every speech scope to local nvidia orukeet", async () => {
  const { selectPolicyEffectiveSettings } = await import("../../src/stores/settingsStore.ts");
  const stored = {
    useLocalWhisper: false,
    uploadUseLocalWhisper: false,
    meetingUseLocalWhisper: false,
    transcriptionMode: "providers",
    meetingTranscriptionMode: "openwhispr",
    uploadTranscriptionMode: "openwhispr",
    localTranscriptionProvider: "whisper",
    meetingLocalTranscriptionProvider: "whisper",
    uploadLocalTranscriptionProvider: "whisper",
    parakeetModel: "",
    meetingParakeetModel: "",
    uploadParakeetModel: "",
  };
  const e = selectPolicyEffectiveSettings(stored, {
    status: "unmanaged",
    policy: null,
    appVersion: null,
  });
  assert.equal(e.uploadUseLocalWhisper, true);
  assert.equal(e.uploadTranscriptionMode, "local");
  assert.equal(e.uploadLocalTranscriptionProvider, "nvidia");
  assert.equal(e.uploadParakeetModel, "orukeet-v0.1.0");
  assert.equal(e.localTranscriptionProvider, "nvidia");
  assert.equal(e.meetingLocalTranscriptionProvider, "nvidia");
});

test("the first-run screen names the licence and the macOS requirement", () => {
  const en = JSON.parse(read("src/locales/en/translation.json"));
  assert.equal(en.onboarding.rehaul.localSetup.attribution, "CC BY-SA 4.0, oruk/orukeet");
  assert.ok(en.onboarding.rehaul.localSetup.macosUnsupported.includes("{{version}}"));
});

test("the renderer's macOS minimum matches the main-process capability check", async () => {
  const { ORUKEET_MINIMUM_MACOS_VERSION } = await import("../../src/helpers/localOnlyEngine.js");
  const { PARAKEET_MINIMUM_MACOS_VERSION } = require("../../src/helpers/parakeetCapability.js");
  assert.equal(ORUKEET_MINIMUM_MACOS_VERSION, PARAKEET_MINIMUM_MACOS_VERSION);
});

test("every locale carries the first-run attribution and macOS strings", () => {
  const dir = path.join(__dirname, "../../src/locales");
  for (const locale of fs.readdirSync(dir).filter((f) => !f.includes("."))) {
    const ls = JSON.parse(read(`src/locales/${locale}/translation.json`)).onboarding.rehaul
      .localSetup;
    assert.equal(ls.attribution, "CC BY-SA 4.0, oruk/orukeet", locale);
    assert.ok(ls.macosUnsupported.includes("{{version}}"), locale);
  }
});
