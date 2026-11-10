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

test("a missing local model reports an error and never selects a cloud route", async () => {
  const { cloudFallbackAllowed } = await import("../../src/config/localOnlyDefaults.js");
  // allowOpenAIFallback stored on from an older install must not re-open the cloud path.
  assert.equal(cloudFallbackAllowed(true), false);
  assert.equal(cloudFallbackAllowed(false), false);

  const ParakeetManager = require("../../src/helpers/parakeet.js");
  const manager = Object.create((ParakeetManager.default || ParakeetManager).prototype);
  manager.validateModelName = () => {};
  await assert.rejects(
    () => manager._policyAllowedTranscribeLocalParakeet(Buffer.from("x"), {}),
    (err) => !/openai|cloud/i.test(err.message)
  );
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
