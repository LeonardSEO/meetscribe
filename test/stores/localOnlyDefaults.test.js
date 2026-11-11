const test = require("node:test");
const assert = require("node:assert/strict");
const { useLocalOnly } = require("../setup/localOnly");

useLocalOnly();

const load = () => import("../../src/config/localOnlyDefaults.js");

test("fresh settings route every scope to local Orukeet", async () => {
  const { LOCAL_ONLY_DEFAULTS, DEFAULT_LOCAL_SPEECH_MODEL } = await load();
  assert.equal(DEFAULT_LOCAL_SPEECH_MODEL, "orukeet-v0.1.0");
  for (const key of ["parakeetModel", "meetingParakeetModel", "uploadParakeetModel"])
    assert.equal(LOCAL_ONLY_DEFAULTS[key], "orukeet-v0.1.0");
  for (const key of ["transcriptionMode", "meetingTranscriptionMode", "uploadTranscriptionMode"])
    assert.equal(LOCAL_ONLY_DEFAULTS[key], "local");
  for (const key of ["useLocalWhisper", "meetingUseLocalWhisper", "uploadUseLocalWhisper"])
    assert.equal(LOCAL_ONLY_DEFAULTS[key], true);
  for (const key of [
    "localTranscriptionProvider",
    "meetingLocalTranscriptionProvider",
    "uploadLocalTranscriptionProvider",
  ])
    assert.equal(LOCAL_ONLY_DEFAULTS[key], "nvidia");
  assert.equal(LOCAL_ONLY_DEFAULTS.allowOpenAIFallback, false);
  assert.equal(LOCAL_ONLY_DEFAULTS.allowLocalFallback, false);
  assert.equal(LOCAL_ONLY_DEFAULTS.useCleanupModel, false);
  assert.equal(LOCAL_ONLY_DEFAULTS.cleanupMode, "enterprise");
  assert.equal(LOCAL_ONLY_DEFAULTS.noteFormattingMode, "enterprise");
  assert.equal(LOCAL_ONLY_DEFAULTS.defaultSummaryTemplateId, "notes.actions.builtin.minutes");
});

test("localOnlyDefault replaces only the fallback in local-only mode", async () => {
  const { localOnlyDefault } = await load();
  assert.equal(localOnlyDefault("transcriptionMode", "openwhispr"), "local");
  assert.equal(localOnlyDefault("unknownKey", "x"), "x");
  globalThis.__OW_UPSTREAM_MODE = true;
  try {
    assert.equal(localOnlyDefault("transcriptionMode", "openwhispr"), "openwhispr");
  } finally {
    delete globalThis.__OW_UPSTREAM_MODE;
  }
});

test("a fresh local-only install pre-warms Orukeet; a saved choice wins", async () => {
  const { startupSpeechEnv } = await load();
  assert.deepEqual(startupSpeechEnv({}), {
    localTranscriptionProvider: "nvidia",
    parakeetModel: "orukeet-v0.1.0",
  });
  assert.deepEqual(
    startupSpeechEnv({
      LOCAL_TRANSCRIPTION_PROVIDER: "nvidia",
      PARAKEET_MODEL: "parakeet-tdt-0.6b-v3",
    }),
    { localTranscriptionProvider: "nvidia", parakeetModel: "parakeet-tdt-0.6b-v3" }
  );
  assert.deepEqual(startupSpeechEnv({ LOCAL_WHISPER_MODEL: "base" }), {
    localTranscriptionProvider: "",
    parakeetModel: undefined,
  });
});
