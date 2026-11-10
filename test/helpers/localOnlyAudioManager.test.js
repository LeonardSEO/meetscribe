const test = require("node:test");
const assert = require("node:assert/strict");
const { useLocalOnly } = require("../setup/localOnly");
const { loadAudioManager } = require("./harness/audioManager");
const { installMicCaptureGlobals } = require("../lib/rendererTestHarness");

useLocalOnly();

// A profile whose stored toggle says "cloud" must still behave as local.
const cloudProfile = {
  useLocalWhisper: false,
  transcriptionMode: "providers",
  cloudTranscriptionMode: "byok",
  cloudTranscriptionProvider: "openai",
  cloudTranscriptionModel: "gpt-4o-mini-transcribe",
  openaiApiKey: "sk-test",
  isSignedIn: true,
  localTranscriptionProvider: "nvidia",
  parakeetModel: "orukeet-v0.1.0",
  showTranscriptionPreview: true,
  allowOpenAIFallback: true,
};

test("streaming, preview and PCM tap stay local when useLocalWhisper=false is stored", async (t) => {
  installMicCaptureGlobals(t);
  const { createManager } = await loadAudioManager(t, {
    cachePrefix: "openwhispr-local-only-streaming-test-",
    settingsKey: "__localOnlyStreamingSettings",
    settings: cloudProfile,
  });
  const manager = createManager({ getWorkletBlobUrl: () => "blob:worklet" });

  assert.equal(manager.shouldUseStreaming(), false, "no cloud realtime path");
  assert.equal(manager.shouldUseStreaming(true), false, "not even when signed in");
  assert.equal(manager._runsLocalPreview(), true);
  const tap = manager._startPcmTap();
  tap?.close();
  assert.notEqual(tap, null, "offline local engine keeps its PCM tap");
});

test("a missing local model reports 'not downloaded' and never reaches a cloud route", async (t) => {
  const { createManager } = await loadAudioManager(t, {
    cachePrefix: "openwhispr-local-only-missing-model-test-",
    settingsKey: "__localOnlyMissingModelSettings",
    settings: { ...cloudProfile, parakeetModel: "" },
  });
  const ParakeetManager = require("../../src/helpers/parakeet.js");
  // The real main-process path, with the model reported as not on disk.
  const parakeet = Object.create(ParakeetManager.prototype);
  const requested = [];
  parakeet.serverManager = {
    isAvailable: () => true,
    isModelDownloaded: (name) => {
      requested.push(name);
      return false;
    },
  };
  parakeet.getModelsDir = () => "/nonexistent";

  const cloudCalls = [];
  let reported = null;
  const manager = createManager({
    isProcessing: true,
    _startProcessingPipeline: () => ({}),
    _shouldAbandonProcessingPipeline: () => false,
    _settleProcessingPipeline: () => true,
    _completeActivationCapture: async () => {},
    _takePendingResultExtras: () => ({}),
    onError: (error) => {
      reported = error;
    },
    processWithLocalParakeet: (_blob, model) =>
      parakeet._policyAllowedTranscribeLocalParakeet(Buffer.from("audio"), { model }),
    processWithOpenAIAPI: async () => {
      cloudCalls.push("openai");
      return { success: true, text: "cloud" };
    },
  });

  await manager.processAudio(new Blob(["audio"]));

  assert.deepEqual(cloudCalls, [], "no cloud route or fallback");
  assert.ok(reported, "the failure is reported");
  assert.match(reported.description, /orukeet-v0\.1\.0.*not downloaded/i);
  assert.deepEqual(requested, ["orukeet-v0.1.0"], "a blank model resolved to Orukeet");
});

test("a local meeting refuses to start when its model is not on disk", () => {
  const {
    checkLocalMeetingStart,
    LOCAL_MODEL_NOT_DOWNLOADED,
  } = require("../../src/helpers/localMeetingModel.js");
  const managers = (parakeet, whisper) => ({
    parakeetManager: { isModelDownloaded: () => parakeet },
    whisperManager: { isModelDownloaded: () => whisper },
  });

  const refused = checkLocalMeetingStart({
    provider: "nvidia",
    model: "orukeet-v0.1.0",
    ...managers(false, true),
  });
  assert.equal(refused.success, false);
  assert.equal(refused.code, LOCAL_MODEL_NOT_DOWNLOADED);
  assert.match(refused.error, /not downloaded/);
  assert.equal(
    checkLocalMeetingStart({
      provider: "nvidia",
      model: "orukeet-v0.1.0",
      ...managers(true, false),
    }),
    null
  );
  assert.equal(
    checkLocalMeetingStart({ provider: "whisper", model: "base", ...managers(true, false) })?.code,
    LOCAL_MODEL_NOT_DOWNLOADED
  );
  assert.equal(
    checkLocalMeetingStart({
      provider: "nvidia",
      model: "x",
      parakeetManager: {
        isModelDownloaded() {
          throw new Error("boom");
        },
      },
      whisperManager: {},
    })?.code,
    LOCAL_MODEL_NOT_DOWNLOADED,
    "a check that cannot run counts as missing"
  );
});

test("the meeting chunk loop keeps buffered audio and reports once while the model is missing", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../../src/helpers/ipcHandlers.js"), "utf8");
  const start = src.indexOf("const transcribeLocalMeetingChunk");
  const body = src.slice(start, start + 2500);
  assert.ok(
    body.indexOf("isLocalMeetingModelAvailable") < body.indexOf("meetingLocalBuffers[source] = []"),
    "model is checked before the buffer is emptied"
  );
  assert.match(body, /meetingLocalModelMissingReported/);
});
