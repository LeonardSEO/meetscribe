const test = require("node:test");
const assert = require("node:assert/strict");
const { useLocalOnly } = require("../setup/localOnly");

useLocalOnly();

const loadRouting = () => import("../../src/helpers/meetingTranscriptionRouting.js");

test("a blank meeting model resolves to Orukeet, never another engine", async () => {
  const { resolveMeetingTranscriptionOptions } = await loadRouting();
  const opts = resolveMeetingTranscriptionOptions({
    transcriptionMode: "local",
    localProvider: "nvidia",
    parakeetModel: "",
    language: "en",
  });
  assert.equal(opts.provider, "local");
  assert.equal(opts.localModel, "orukeet-v0.1.0");
});

test("a meeting never selects a cloud route in local-only", async () => {
  const { resolveMeetingTranscriptionOptions } = await loadRouting();
  for (const transcriptionMode of ["openwhispr", "providers", "self-hosted"]) {
    const opts = resolveMeetingTranscriptionOptions({
      transcriptionMode,
      localProvider: "nvidia",
      parakeetModel: "",
      language: "en",
    });
    assert.equal(opts.provider, "local", transcriptionMode);
    assert.equal(opts.localModel, "orukeet-v0.1.0");
  }
});

test("upstream mode keeps the cloud fallback toggle", async () => {
  globalThis.__OW_UPSTREAM_MODE = true;
  try {
    const { cloudFallbackAllowed } = await import("../../src/config/localOnlyDefaults.js");
    assert.equal(cloudFallbackAllowed(true), true);
  } finally {
    delete globalThis.__OW_UPSTREAM_MODE;
  }
});

test("main refuses every non-local speech provider in local-only", async () => {
  const { localOnlySpeechRefusal } = await import("../../src/helpers/localOnlyEngine.js");
  assert.equal(localOnlySpeechRefusal("meeting", { provider: "local" }), null);
  for (const provider of ["openai-realtime", "deepgram", "assemblyai", "orukeet", undefined]) {
    for (const mode of ["byok", "openwhispr"]) {
      const m = localOnlySpeechRefusal("meeting", { provider, mode });
      assert.equal(m?.code, "LOCAL_ONLY_BLOCKED", `meeting ${provider} ${mode}`);
      const d = localOnlySpeechRefusal("dictation", { provider, mode });
      assert.equal(d?.code, "LOCAL_ONLY_BLOCKED", `dictation ${provider} ${mode}`);
    }
  }
});

test("upstream mode refuses nothing", async () => {
  globalThis.__OW_UPSTREAM_MODE = true;
  try {
    const { localOnlySpeechRefusal } = await import("../../src/helpers/localOnlyEngine.js");
    assert.equal(localOnlySpeechRefusal("meeting", { provider: "deepgram" }), null);
    assert.equal(localOnlySpeechRefusal("dictation", { provider: "orukeet", mode: "byok" }), null);
  } finally {
    delete globalThis.__OW_UPSTREAM_MODE;
  }
});

test("ipcHandlers routes meeting connect, meeting start and dictation connect through the guard", () => {
  const src = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../../src/helpers/ipcHandlers.js"),
    "utf8"
  );
  assert.equal(src.match(/localOnlySpeechRefusal\("meeting"/g).length, 2);
  // dictation realtime connect plus warmup and start of assemblyai, deepgram, gemini and corti
  assert.equal(src.match(/localOnlySpeechRefusal\("dictation"/g).length, 9);
});
