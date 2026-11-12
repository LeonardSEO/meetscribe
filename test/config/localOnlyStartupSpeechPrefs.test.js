const test = require("node:test");
const assert = require("node:assert/strict");
const { useLocalOnly } = require("../setup/localOnly.js");

useLocalOnly();

const load = () => import("../../src/config/localOnlyDefaults.js");

test("a migrated upstream profile in cloud mode still keeps Orukeet running", async () => {
  const { localOnlyStartupSpeechPrefs } = await load();
  const prefs = localOnlyStartupSpeechPrefs({
    useLocalWhisper: false,
    localTranscriptionProvider: "nvidia",
    model: "orukeet-v0.1.0",
    language: "nl",
    keepLocalModelLoaded: true,
  });
  assert.equal(prefs.useLocalWhisper, true);
  assert.equal(prefs.localTranscriptionProvider, "nvidia");
  assert.equal(prefs.model, "orukeet-v0.1.0");
  assert.equal(prefs.language, "nl");
  assert.equal(prefs.keepLocalModelLoaded, true);
});

test("a stored Whisper or other model becomes the Orukeet default", async () => {
  const { localOnlyStartupSpeechPrefs } = await load();
  for (const stored of [
    { useLocalWhisper: true, localTranscriptionProvider: "whisper", model: "base" },
    { useLocalWhisper: true, localTranscriptionProvider: "nvidia", model: "parakeet-tdt-0.6b-v3" },
    { useLocalWhisper: true, localTranscriptionProvider: "nvidia" },
  ]) {
    const prefs = localOnlyStartupSpeechPrefs(stored);
    assert.equal(prefs.useLocalWhisper, true);
    assert.equal(prefs.localTranscriptionProvider, "nvidia");
    assert.equal(prefs.model, "orukeet-v0.1.0", JSON.stringify(stored));
  }
});

test("upstream mode passes the preferences through unchanged", async () => {
  const { localOnlyStartupSpeechPrefs } = await load();
  globalThis.__OW_UPSTREAM_MODE = true;
  try {
    const stored = { useLocalWhisper: false, localTranscriptionProvider: "whisper", model: "base" };
    assert.equal(localOnlyStartupSpeechPrefs(stored), stored);
  } finally {
    delete globalThis.__OW_UPSTREAM_MODE;
  }
});
