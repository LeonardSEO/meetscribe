const test = require("node:test");
const assert = require("node:assert/strict");
const { useLocalOnly } = require("../setup/localOnly");

useLocalOnly();

test("Orukeet is pinned to the published archive hash", async () => {
  const { pinnedSha256 } = await import("../../src/config/pinnedModelHashes.js");
  assert.equal(
    pinnedSha256("orukeet-v0.1.0"),
    "f9191f30178cc9122ce2f023bf9fefafc822028307b0efa4caff645ba3fe8d0a"
  );
  assert.equal(pinnedSha256("parakeet-tdt-0.6b-v3"), undefined);
  assert.equal(pinnedSha256("constructor"), undefined);
});

test("the download config carries the pinned hash, not the registry's", () => {
  const { getParakeetModelConfig } = require("../../src/helpers/parakeet.js");
  assert.equal(
    getParakeetModelConfig("orukeet-v0.1.0").sha256,
    "f9191f30178cc9122ce2f023bf9fefafc822028307b0efa4caff645ba3fe8d0a"
  );
});
