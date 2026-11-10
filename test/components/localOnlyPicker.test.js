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

test("dictation, meeting and upload settings all narrow their modes to local", () => {
  for (const file of [
    "src/components/SettingsPage.tsx",
    "src/components/settings/MeetingSettings.tsx",
    "src/components/settings/UploadSettings.tsx",
  ]) {
    const src = read(file);
    assert.match(src, /localOnlySpeechModes\(/, file);
    assert.match(src, /localOnlySpeechMode\(/, file);
    assert.match(src, /!isLocalOnly\(\) && \(\s*<InferenceModeSelector/, file);
  }
});

test("the picker never commits whisper in local-only and upload has no switch to cloud", () => {
  const picker = read("src/components/TranscriptionModelPicker.tsx");
  assert.doesNotMatch(picker, /selectedLocalProvider = "whisper"/);
  const upload = read("src/components/notes/UploadAudioView.tsx");
  assert.doesNotMatch(upload, /const switchToCloud =/);
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
