const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("capForFoundry takes a share of the configured input limit, never raising a budget", async () => {
  const { capForFoundry, FOUNDRY_TRANSCRIPT_SHARE, FOUNDRY_HISTORY_SHARE, FULL_TRANSCRIPT_MAX_TOKENS } =
    await import("../../src/utils/transcriptEvidence.ts");
  const { HISTORY_MAX_TOKENS } = await import("../../src/components/chat/historyMessages.ts");
  assert.equal(capForFoundry(64_000, 8192, FOUNDRY_TRANSCRIPT_SHARE), 4096);
  assert.equal(capForFoundry(16_000, 8192, FOUNDRY_HISTORY_SHARE), 2048);
  assert.equal(capForFoundry(4_000, 100_000, FOUNDRY_TRANSCRIPT_SHARE), 4_000);
  assert.equal(capForFoundry(64_000, 0, FOUNDRY_TRANSCRIPT_SHARE), 64_000);
  assert.ok(capForFoundry(FULL_TRANSCRIPT_MAX_TOKENS.hosted, 100_000, 0.5) <= 50_000);
  assert.ok(capForFoundry(HISTORY_MAX_TOKENS.hosted, 100_000, FOUNDRY_HISTORY_SHARE) <= 25_000);
});

test("the chat engine applies the Foundry caps to the transcript and history budgets", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../../src/components/chat/chatTurnEngine.ts"),
    "utf8"
  );
  assert.match(src, /capForFoundry\(\s*FULL_TRANSCRIPT_MAX_TOKENS\[contextTier\]/);
  assert.match(src, /capForFoundry\(\s*HISTORY_MAX_TOKENS\[contextTier\]/);
});
