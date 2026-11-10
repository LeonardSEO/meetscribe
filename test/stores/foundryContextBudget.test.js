const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");
const { useLocalOnly } = require("../setup/localOnly.js");

useLocalOnly();

const ACTION = { id: 1, name: "Generate Notes", prompt: "Summarize the meeting." };
const LABELS = { noModel: "no model", noEndpoint: "no endpoint", actionFailed: "failed" };
const LINE = "Alice: we agreed to ship the billing migration on Friday after QA.\n";

async function loadStore(t) {
  const updates = [];
  const budgetCalls = [];
  installBrowserGlobals(t, {
    initialStorage: {
      foundryModel: "gpt-x",
      foundryMaxInputTokens: "8192",
      foundryMaxOutputTokens: "3000",
    },
    window: {
      electronAPI: {
        updateNote: async (noteId, payload) => {
          updates.push({ noteId, payload });
          return { success: true };
        },
        getNote: async (noteId) => ({ id: noteId }),
        getLocalContextBudget: async (modelId) => {
          budgetCalls.push(modelId);
          return { success: false };
        },
      },
    },
  });
  const calls = [];
  const vite = await createRendererServer(t, {
    cachePrefix: "openwhispr-foundry-budget-test-",
    mockModules: {
      "/services/ReasoningService": `
        export default {
          processText: async (text, model, agentName, config) => {
            const calls = globalThis.__processTextCalls;
            calls.push({ text, model, config });
            if (calls.length === 1) {
              throw Object.assign(new Error("too big"), { code: "CONTEXT_TOO_LARGE" });
            }
            return "# Notes " + calls.length;
          },
        };
      `,
      "/utils/generateTitle": `export const generateNoteTitle = async () => undefined;`,
    },
  });
  globalThis.__processTextCalls = calls;
  t.after(() => delete globalThis.__processTextCalls);
  const store = await vite.ssrLoadModule("/stores/actionProcessingStore.ts");
  return { store, calls, updates, budgetCalls };
}

async function waitFor(predicate) {
  for (let i = 0; i < 500; i += 1) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timed out");
}

test("a Foundry CONTEXT_TOO_LARGE refusal splits the transcript against foundryMaxInputTokens", async (t) => {
  const { store, calls, updates, budgetCalls } = await loadStore(t);
  const material = {
    notes: "My note.",
    meetingContext: "## Meeting Context\nAlice records.",
    transcript: LINE.repeat(400).trim(),
  };
  store.runBackgroundAction(
    1,
    [material.notes, material.meetingContext, `## Meeting Transcript\n${material.transcript}`].join(
      "\n\n"
    ),
    "hash",
    ACTION,
    { modelId: "gpt-x", isCloudMode: false, isMeetingNote: true, material },
    LABELS
  );
  await waitFor(() => updates.length > 0);
  assert.deepEqual(budgetCalls, [], "no local runtime is asked about its window");
  const parts = calls.slice(1, -1);
  // The same 400 lines pack into 3 parts at an 8192-token window (see actionProcessingChunked).
  assert.equal(parts.length, 3, "parts are planned against foundryMaxInputTokens");
  assert.equal(calls[0].config.maxTokens, 3000, "the output limit rides as maxTokens");
  for (const part of parts) assert.ok(part.config.maxTokens <= 3000);
});
