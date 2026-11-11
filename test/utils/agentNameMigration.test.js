// The default agent name is Meetscribe. A name still stored as the old default
// "OpenWhispr" moves to Meetscribe once, and the dictionary follows; a name the
// user chose stays.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

const MOCKS = {
  "/stores/settingsStore": `
    export const getSettings = () => ({ customDictionary: globalThis.__dictionary });
    export const useSettingsStore = {
      getState: () => ({
        updateCustomDictionary({ add, remove }) {
          globalThis.__dictionary = globalThis.__dictionary
            .filter((word) => !remove.includes(word))
            .concat(add);
        },
      }),
    };
  `,
};

async function loadAgentName(t, { stored, dictionary = [] } = {}) {
  const initialStorage = stored === undefined ? {} : { agentName: stored };
  const { storage } = installBrowserGlobals(t, { initialStorage });
  globalThis.__dictionary = dictionary;
  t.after(() => delete globalThis.__dictionary);
  const vite = await createRendererServer(t, {
    cachePrefix: "meetscribe-agent-name-test-",
    mockModules: MOCKS,
  });
  const agentName = await vite.ssrLoadModule("/utils/agentName.ts");
  return { agentName, storage };
}

test("the old default name becomes Meetscribe and the dictionary follows", async (t) => {
  const { agentName, storage } = await loadAgentName(t, {
    stored: "OpenWhispr",
    dictionary: ["Kubernetes", "OpenWhispr"],
  });
  agentName.migrateLegacyAgentName();
  assert.equal(agentName.getAgentName(), "Meetscribe");
  assert.equal(storage.getItem("agentName"), "Meetscribe");
  assert.deepEqual(globalThis.__dictionary, ["Kubernetes", "Meetscribe"]);
});

test("a name the user chose stays", async (t) => {
  const { agentName, storage } = await loadAgentName(t, {
    stored: "Jarvis",
    dictionary: ["Jarvis"],
  });
  agentName.migrateLegacyAgentName();
  assert.equal(agentName.getAgentName(), "Jarvis");
  assert.equal(storage.getItem("agentName"), "Jarvis");
  assert.deepEqual(globalThis.__dictionary, ["Jarvis"]);
});

test("no stored name reads as Meetscribe and writes nothing", async (t) => {
  const { agentName, storage } = await loadAgentName(t);
  agentName.migrateLegacyAgentName();
  assert.equal(agentName.getAgentName(), "Meetscribe");
  assert.equal(storage.getItem("agentName"), null);
  assert.deepEqual(globalThis.__dictionary, []);
});

test("running the migration twice changes nothing more", async (t) => {
  const { agentName } = await loadAgentName(t, {
    stored: "OpenWhispr",
    dictionary: ["OpenWhispr"],
  });
  agentName.migrateLegacyAgentName();
  agentName.migrateLegacyAgentName();
  assert.equal(agentName.getAgentName(), "Meetscribe");
  assert.deepEqual(globalThis.__dictionary, ["Meetscribe"]);
});
