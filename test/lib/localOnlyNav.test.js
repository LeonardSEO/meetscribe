const test = require("node:test");
const assert = require("node:assert/strict");
const { useLocalOnly } = require("../setup/localOnly");

useLocalOnly();

test("settings nav has no account, billing or workspace entries", async () => {
  const { buildSettingsNav } = await import("../../src/lib/settingsNav.ts");
  const ids = buildSettingsNav({
    isSignedIn: true,
    hasWorkspace: true,
    canManageSettings: true,
  }).map((e) => e.id);
  assert.ok(!ids.includes("account"));
  assert.ok(!ids.includes("plansBilling"));
  assert.ok(!ids.some((id) => id.startsWith("workspace")));
  assert.ok(ids.includes("general"));
});

test("deep links to removed sections land on general", async () => {
  const { buildSettingsNav, resolveSettingsSection } = await import("../../src/lib/settingsNav.ts");
  const nav = buildSettingsNav({
    isSignedIn: false,
    hasWorkspace: false,
    canManageSettings: false,
  });
  assert.equal(resolveSettingsSection("account", nav), "general");
  assert.equal(resolveSettingsSection("plansBilling", nav), "general");
  assert.equal(resolveSettingsSection("workspacePeople", nav), "general");
  assert.equal(resolveSettingsSection(undefined, nav), "general");
});

test("upsell is always hidden", async () => {
  const { decideUpsell } = await import("../../src/lib/upsell.ts");
  for (const input of [
    { authLoaded: true, isSignedIn: false, hasPaidAccess: null, isPastDue: false },
    { authLoaded: false, isSignedIn: false, hasPaidAccess: null, isPastDue: false },
    { authLoaded: true, isSignedIn: true, hasPaidAccess: false, isPastDue: false },
  ]) {
    assert.equal(decideUpsell(input), "hide");
  }
});

test("mode options never contain the cloud mode", async () => {
  const { withoutCloudModeOptions } = await import("../../src/hooks/usePolicy.ts");
  const out = withoutCloudModeOptions([{ id: "openwhispr" }, { id: "local" }, { id: "providers" }]);
  assert.deepEqual(
    out.map((o) => o.id),
    ["local", "providers"]
  );
});
