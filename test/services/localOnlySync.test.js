const test = require("node:test");
const assert = require("node:assert/strict");
const { useLocalOnly } = require("../setup/localOnly.js");

useLocalOnly();

test("local-only sync consent is always off, even for a validated signed-in state", async () => {
  const { resolveSyncConsent } = await import("../../src/services/syncPassPolicy.ts");
  const consent = resolveSyncConsent({
    authValidated: true,
    signedIn: true,
    backupEnabled: true,
    subscribed: true,
    backupAllowedByPolicy: true,
    dataRetentionEnabled: true,
    insightsSyncEnabled: true,
  });
  assert.deepEqual(consent, { shared: false, backup: false, analytics: false });
});

test("requestSignIn does nothing in local-only mode", async () => {
  const store = new Map([["authenticationSkipped", "true"]]);
  let reloads = 0;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.window = { location: { reload: () => (reloads += 1) } };
  try {
    const { requestSignIn } = await import("../../src/utils/requestSignIn.ts");
    requestSignIn();
    assert.equal(reloads, 0);
    assert.equal(store.get("authenticationSkipped"), "true");
  } finally {
    delete globalThis.localStorage;
    delete globalThis.window;
  }
});
