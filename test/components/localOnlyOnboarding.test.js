const test = require("node:test");
const assert = require("node:assert/strict");
const { useLocalOnly } = require("../setup/localOnly.js");

useLocalOnly();

test("a new local-only session starts as a guest on the local setup path", async () => {
  const { createOnboardingSession, getOnboardingRoute } =
    await import("../../src/components/onboarding/flow.ts");
  const session = createOnboardingSession();
  assert.equal(session.authPath, "guest");
  assert.equal(session.setupMode, "local");
  assert.notEqual(session.currentStepId, "auth");

  const route = getOnboardingRoute({
    authPath: session.authPath,
    setupMode: session.setupMode,
    agentAllowed: true,
  });
  assert.equal(route.includes("auth"), false);
  assert.equal(route.includes("setup-choice"), false);
  assert.ok(route.includes("permissions"));
  assert.ok(route.includes("local-setup"));
  assert.equal(route[0], session.currentStepId);
});

test("a local-only route stays account-free even for a null auth path", async () => {
  const { getOnboardingRoute } = await import("../../src/components/onboarding/flow.ts");
  const route = getOnboardingRoute({ authPath: null, setupMode: null, agentAllowed: true });
  assert.equal(route.includes("auth"), false);
  assert.equal(route.includes("setup-choice"), false);
});
