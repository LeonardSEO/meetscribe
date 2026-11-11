const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

// The built-in minutes template asks the model for a JSON object, validates it
// (one corrective retry), renders it into the editable summary and stores the
// JSON and the deployment beside it.

const LABELS = { noModel: "no model", noEndpoint: "no endpoint", actionFailed: "failed" };
const BEFORE = {
  title: "Weekly",
  transcript: '[{"text":"hello"}]',
  enhanced_content: "old summary",
  enhancement_prompt: "old prompt",
  enhancement_template_id: "old template",
  enhanced_at_content_hash: "old hash",
  minutes_json: '{"old":true}',
  minutes_model: "old-deployment",
};
const MINUTES = {
  language: "en",
  summary: "We aligned on the launch plan.",
  topics: [{ title: "Launch", points: ["Date is fixed"] }],
  decisions: ["Launch on 1 March"],
  actionItems: [{ task: "Send quote", owner: "Sam", deadline: null }],
};
const GOOD = JSON.stringify(MINUTES);
const MATERIAL_INPUT = "## Meeting Transcript\nSam: I will send the quote.";

async function loadStore(t, replies) {
  const updates = [];
  installBrowserGlobals(t, {
    window: {
      electronAPI: {
        updateNote: async (noteId, payload) => {
          updates.push({ noteId, payload });
          return { success: true };
        },
        getNote: async (noteId) => ({ id: noteId, ...BEFORE }),
      },
    },
  });
  const calls = [];
  const vite = await createRendererServer(t, {
    cachePrefix: "openwhispr-minutes-action-test-",
    mockModules: {
      "/services/ReasoningService": `
        export default {
          processText: async (text, model, agentName, config) => {
            globalThis.__minutesCalls.push({ text, model, config });
            const next = globalThis.__minutesReplies.shift();
            if (next instanceof Error) throw next;
            return next;
          },
        };
      `,
      "/utils/generateTitle": `export const generateNoteTitle = async () => undefined;`,
    },
  });
  globalThis.__minutesCalls = calls;
  globalThis.__minutesReplies = [...replies];
  t.after(() => {
    delete globalThis.__minutesCalls;
    delete globalThis.__minutesReplies;
  });
  const store = await vite.ssrLoadModule("/stores/actionProcessingStore.ts");
  return { store, calls, updates };
}

async function minutesAction() {
  const { BUILTIN_ACTIONS, MINUTES_KEY } = await import("../../src/helpers/builtinActions.js");
  const builtin = BUILTIN_ACTIONS.find((action) => action.translationKey === MINUTES_KEY);
  return { ...builtin, id: 7, translation_key: MINUTES_KEY, client_id: MINUTES_KEY };
}

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${label}`);
}

const start = (store, action, noteId = 1, options = {}) =>
  store.runBackgroundAction(
    noteId,
    MATERIAL_INPUT,
    "new-hash",
    action,
    { modelId: "gpt-minutes", isCloudMode: false, isMeetingNote: true, ...options },
    LABELS
  );

test("a valid reply is rendered into the summary, stored as JSON with its deployment", async (t) => {
  const { store, calls, updates } = await loadStore(t, [GOOD]);
  start(store, await minutesAction());
  await waitFor(() => updates.length > 0, "save");
  assert.equal(calls.length, 1);
  const { payload } = updates[0];
  assert.match(payload.enhanced_content, /^## Summary\nWe aligned on the launch plan\./);
  assert.match(payload.enhanced_content, /- \[ \] Send quote — Sam/);
  assert.deepEqual(JSON.parse(payload.minutes_json), MINUTES);
  assert.equal(payload.minutes_model, "gpt-minutes");
  assert.equal(payload.enhanced_at_content_hash, "new-hash");
  assert.equal("transcript" in payload, false);
});

test("a reply in a fence with thinking in front is accepted", async (t) => {
  const { store, updates } = await loadStore(t, ["<think>hm</think>\n```json\n" + GOOD + "\n```"]);
  start(store, await minutesAction());
  await waitFor(() => updates.length > 0, "save");
  assert.deepEqual(JSON.parse(updates[0].payload.minutes_json), MINUTES);
});

test("an invalid first reply gets one more request with the validation error, then is saved", async (t) => {
  const { store, calls, updates } = await loadStore(t, ["Sure! Here are the notes.", GOOD]);
  start(store, await minutesAction());
  await waitFor(() => updates.length > 0, "save");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].config.systemPrompt.includes("Reply does not contain"), false);
  assert.ok(calls[1].config.systemPrompt.includes("Reply does not contain a single JSON object"));
  assert.deepEqual(JSON.parse(updates[0].payload.minutes_json), MINUTES);
});

test("two invalid replies leave the note untouched and report minutesInvalid", async (t) => {
  const { store, calls, updates } = await loadStore(t, ["nope", "still nope", GOOD]);
  start(store, await minutesAction());
  let events = [];
  await waitFor(() => (events = store.consumeErrorEvents()).length > 0, "error");
  assert.equal(calls.length, 2);
  assert.equal(events[0].messageKey, "notes.actions.errors.minutesInvalid");
  assert.equal(updates.length, 0);
});

test("a provider auth failure is not retried and points at the model settings", async (t) => {
  const auth = Object.assign(new Error("401"), {
    code: "PROVIDER_AUTH_FAILED",
    messageKey: "providerErrors.authFailed",
    settingsTarget: "llms",
  });
  const { store, calls, updates } = await loadStore(t, [auth, GOOD]);
  start(store, await minutesAction());
  let events = [];
  await waitFor(() => (events = store.consumeErrorEvents()).length > 0, "error");
  assert.equal(calls.length, 1);
  assert.equal(events[0].settingsTarget, "llms");
  assert.equal(updates.length, 0);
});

test("NOTHING_TO_SUMMARIZE is the neutral notice, not a parse failure", async (t) => {
  const { store, calls, updates } = await loadStore(t, ["NOTHING_TO_SUMMARIZE", GOOD]);
  start(store, await minutesAction());
  let events = [];
  await waitFor(() => (events = store.consumeErrorEvents()).length > 0, "notice");
  assert.equal(calls.length, 1);
  assert.equal(events[0].messageKey, "notes.actions.errors.nothingToSummarize");
  assert.equal(events[0].notice, true);
  assert.equal(updates.length, 0);
});

test("NOTHING_TO_SUMMARIZE on the corrective retry is also the notice", async (t) => {
  const { store, updates } = await loadStore(t, ["garbage", "NOTHING_TO_SUMMARIZE"]);
  start(store, await minutesAction());
  let events = [];
  await waitFor(() => (events = store.consumeErrorEvents()).length > 0, "notice");
  assert.equal(events[0].messageKey, "notes.actions.errors.nothingToSummarize");
  assert.equal(updates.length, 0);
});

test("Undo restores the summary, the minutes JSON and the deployment", async (t) => {
  const { store, updates } = await loadStore(t, [GOOD]);
  start(store, await minutesAction());
  await waitFor(() => updates.length > 0, "save");
  const [event] = store.consumeAppliedEvents();
  assert.equal(event.previous.enhanced_content, BEFORE.enhanced_content);
  assert.equal(event.previous.minutes_json, BEFORE.minutes_json);
  assert.equal(event.previous.minutes_model, BEFORE.minutes_model);
});

test("regenerating with another model updates the stored deployment", async (t) => {
  const { store, updates } = await loadStore(t, [GOOD, GOOD]);
  const action = await minutesAction();
  start(store, action, 1, { modelId: "deployment-a" });
  await waitFor(() => updates.length === 1, "first save");
  await waitFor(() => store.consumeAppliedEvents().length > 0, "first applied");
  store.cancelAction(1);
  start(store, action, 1, { modelId: "deployment-b" });
  await waitFor(() => updates.length === 2, "second save");
  assert.equal(updates[0].payload.minutes_model, "deployment-a");
  assert.equal(updates[1].payload.minutes_model, "deployment-b");
});

test("another template clears the stored minutes", async (t) => {
  const { store, updates } = await loadStore(t, ["# Notes\n- things"]);
  start(store, { id: 2, name: "Plain", kind: "template", prompt: "Summarize.", client_id: "x" });
  await waitFor(() => updates.length > 0, "save");
  assert.equal(updates[0].payload.minutes_json, null);
  assert.equal(updates[0].payload.minutes_model, null);
});

test("the prompt carries the JSON model and the null rule for owner and deadline", async (t) => {
  const { store, calls, updates } = await loadStore(t, [GOOD]);
  start(store, await minutesAction());
  await waitFor(() => updates.length > 0, "save");
  const prompt = calls[0].config.systemPrompt;
  assert.match(prompt, /"actionItems"/);
  assert.match(prompt, /"owner": string \| null/);
  assert.match(
    prompt,
    /null for an action item.s owner and deadline when they were not mentioned/i
  );
  assert.match(prompt, /only the JSON object/i);
  assert.equal(calls[0].config.refuseClippedByWindow, false);
});

test("the merge step of a split recording keeps the JSON instruction", async (t) => {
  const { store, calls, updates } = await loadStore(t, []);
  globalThis.__minutesReplies = undefined;
  let n = 0;
  globalThis.__minutesReplies = {
    shift() {
      n += 1;
      if (n === 1) return Object.assign(new Error("too big"), { code: "CONTEXT_TOO_LARGE" });
      return /this part only/i.test(globalThis.__minutesCalls.at(-1).config.systemPrompt)
        ? "- part notes"
        : GOOD;
    },
  };
  globalThis.window.electronAPI.getLocalContextBudget = async () => ({
    success: true,
    maxContextTokens: 8192,
    modelName: "Test",
  });
  const line = "Sam: we agreed to ship the billing migration on Friday after QA.\n";
  const material = { notes: "", meetingContext: "", transcript: line.repeat(400).trim() };
  store.runBackgroundAction(
    5,
    `## Meeting Transcript\n${material.transcript}`,
    "h",
    await minutesAction(),
    { modelId: "m", isCloudMode: false, isMeetingNote: true, material },
    LABELS
  );
  await waitFor(() => updates.length > 0, "save");
  const merge = calls.at(-1).config.systemPrompt;
  assert.match(merge, /"actionItems"/);
  assert.match(merge, /Notes from part/);
  assert.ok(JSON.parse(updates[0].payload.minutes_json));
});
