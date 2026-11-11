// Local-only: what the model reads never names OpenWhispr, and the tools that
// search OpenWhispr's own documentation are not offered (its site is blocked).
const test = require("node:test");
const assert = require("node:assert/strict");

const wasUpstream = globalThis.__OW_UPSTREAM_MODE;
test.before(() => {
  delete globalThis.__OW_UPSTREAM_MODE;
});
test.after(() => {
  globalThis.__OW_UPSTREAM_MODE = wasUpstream;
});

const LOCATIONS = {
  account: "Settings → Profile",
  plans: "Settings → Plans & Billing",
  calendars: "Integrations → Calendars",
  connectors: "Integrations → Connectors",
  models: "Settings → Language Models",
};

test("the system prompt never names OpenWhispr", async () => {
  const { getAgentSystemPrompt } = await import("../../src/config/prompts.ts");
  const prompt = getAgentSystemPrompt([
    "search_notes",
    "search_meetings",
    "get_note",
    "create_note",
    "update_note",
    "list_folders",
    "web_search",
    "copy_to_clipboard",
  ]);
  assert.doesNotMatch(prompt, /openwhispr/i);
  assert.match(prompt, /not Meetscribe's unless explicitly named/);
});

test("unavailable capabilities never send the user to OpenWhispr", async () => {
  const { resolveUnavailableCapabilities, describeUnavailable } =
    await import("../../src/config/agentCapabilities.ts");
  for (const overrides of [
    { isSignedIn: false },
    { connectors: { hasPlan: false, allowed: true, blockedByOrg: false, statuses: {} } },
    { supportsTools: false },
  ]) {
    const text = describeUnavailable(
      resolveUnavailableCapabilities({
        supportsTools: true,
        isSignedIn: true,
        webSearch: { allowed: true, blockedByOrg: false },
        calendarConnected: true,
        connectors: { hasPlan: true, allowed: true, blockedByOrg: false, statuses: {} },
        locations: LOCATIONS,
        ...overrides,
      })
    );
    assert.notEqual(text, "", JSON.stringify(overrides));
    assert.doesNotMatch(text, /openwhispr/i, JSON.stringify(overrides));
  }
});

test("the OpenWhispr help tools are not offered", async () => {
  const { createToolRegistry } = await import("../../src/services/tools/index.ts");
  const registry = createToolRegistry({
    isSignedIn: false,
    calendarConnected: false,
    cloudBackupEnabled: false,
    webSearchEnabled: false,
  });
  const names = registry.getAll().map((tool) => tool.name);
  for (const name of ["search_openwhispr_help", "read_openwhispr_help", "get_openwhispr_context"]) {
    assert.equal(names.includes(name), false, name);
  }
});
