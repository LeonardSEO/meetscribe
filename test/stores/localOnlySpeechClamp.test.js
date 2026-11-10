const test = require("node:test");
const assert = require("node:assert/strict");
const { useLocalOnly } = require("../setup/localOnly.js");

useLocalOnly();

const stored = {
  useLocalWhisper: false,
  meetingUseLocalWhisper: false,
  uploadUseLocalWhisper: false,
  transcriptionMode: "providers",
  meetingTranscriptionMode: "openwhispr",
  uploadTranscriptionMode: "openwhispr",
  localTranscriptionProvider: "whisper",
  meetingLocalTranscriptionProvider: "whisper",
  uploadLocalTranscriptionProvider: "whisper",
  parakeetModel: "",
  meetingParakeetModel: "parakeet-tdt-0.6b-v3",
  uploadParakeetModel: "cohere-transcribe-03-2026",
  whisperModel: "base",
};

test("clamp makes dictation, meeting and upload local nvidia orukeet", async () => {
  const { clampLocalOnlySpeech } = await import("../../src/stores/localOnlySpeechClamp.ts");
  const c = clampLocalOnlySpeech(stored);
  for (const [m, l, p, model] of [
    ["transcriptionMode", "useLocalWhisper", "localTranscriptionProvider", "parakeetModel"],
    [
      "meetingTranscriptionMode",
      "meetingUseLocalWhisper",
      "meetingLocalTranscriptionProvider",
      "meetingParakeetModel",
    ],
    [
      "uploadTranscriptionMode",
      "uploadUseLocalWhisper",
      "uploadLocalTranscriptionProvider",
      "uploadParakeetModel",
    ],
  ]) {
    assert.equal(c[m], "local");
    assert.equal(c[l], true);
    assert.equal(c[p], "nvidia");
    assert.equal(c[model], "orukeet-v0.1.0");
  }
  assert.equal(stored.useLocalWhisper, false, "input untouched");
  assert.equal(clampLocalOnlySpeech(stored), c, "stable identity");
});

test("resolved upload and meeting configs from stored cloud values are local orukeet", async () => {
  const { clampLocalOnlySpeech } = await import("../../src/stores/localOnlySpeechClamp.ts");
  const { selectResolvedUploadTranscription, selectResolvedMeetingTranscription } =
    await import("../../src/stores/settingsStore.ts");
  const { resolveMeetingTranscriptionOptions } =
    await import("../../src/helpers/meetingTranscriptionRouting.js");
  const state = clampLocalOnlySpeech({ ...stored, cloudTranscriptionProvider: "openai" });
  const up = selectResolvedUploadTranscription(state);
  assert.equal(up.useLocalWhisper, true);
  assert.equal(up.transcriptionMode, "local");
  assert.equal(up.localTranscriptionProvider, "nvidia");
  assert.equal(up.parakeetModel, "orukeet-v0.1.0");
  const mt = selectResolvedMeetingTranscription(state);
  const opts = resolveMeetingTranscriptionOptions({
    transcriptionMode: mt.transcriptionMode,
    localProvider: mt.localTranscriptionProvider,
    whisperModel: mt.whisperModel,
    parakeetModel: mt.parakeetModel,
    cohereModel: mt.cohereModel,
  });
  assert.equal(opts.localProvider, "nvidia");
  assert.equal(opts.localModel, "orukeet-v0.1.0");
});

test("a stored Oruk model is kept", async () => {
  const { clampLocalOnlySpeech } = await import("../../src/stores/localOnlySpeechClamp.ts");
  assert.equal(
    clampLocalOnlySpeech({ ...stored, parakeetModel: "orukeet-v0.1.0" }).parakeetModel,
    "orukeet-v0.1.0"
  );
});
