const test = require("node:test");
const assert = require("node:assert/strict");
const { useLocalOnly } = require("../setup/localOnly");

useLocalOnly();

const loadTool = () => import("../../src/services/tools/searchMeetingsTool.ts");

const originalWindow = global.window;
test.afterEach(() => {
  if (originalWindow === undefined) delete global.window;
  else global.window = originalWindow;
});

function installApi(rows, calls = []) {
  global.window = {
    electronAPI: {
      searchTranscriptPassages: async (params) => {
        calls.push(params);
        return rows;
      },
    },
  };
  return calls;
}

const row = (overrides = {}) => ({
  passageId: 1,
  noteId: 7,
  noteTitle: "Weekly sync",
  noteDate: "2026-11-03 09:00:00",
  speaker: "Sanne",
  startSeconds: 125,
  endSeconds: 140,
  text: "We decided to ship project X on Friday.",
  ...overrides,
});

test("numbers results from 1, formats the time and marks passages untrusted", async () => {
  const { searchMeetingsTool } = await loadTool();
  installApi([row(), row({ passageId: 2, noteId: 8, speaker: null, startSeconds: null })]);
  const result = await searchMeetingsTool.execute({ query: "project X" });
  assert.equal(result.success, true);
  assert.deepEqual(
    result.data.map((item) => [item.ref, item.noteId, item.speaker, item.time]),
    [
      [1, 7, "Sanne", "02:05"],
      [2, 8, null, null],
    ]
  );
  assert.equal(result.data[0].title, "Weekly sync");
  assert.equal(result.data[0].date, "2026-11-03 09:00:00");
  assert.ok(result.data.every((item) => item.untrusted === true));
});

test("maps the date filters, caps the limit and cuts long passages", async () => {
  const { searchMeetingsTool, MAX_MEETING_SOURCES, MAX_PASSAGE_CHARS } = await loadTool();
  const calls = installApi([row({ text: "x".repeat(2000) })]);
  const result = await searchMeetingsTool.execute({
    query: "besluit besloten",
    date_from: "2026-11-02",
    date_to: "2026-11-08",
    limit: 50,
  });
  assert.deepEqual(calls[0], {
    query: "besluit besloten",
    dateFrom: "2026-11-02",
    dateTo: "2026-11-08",
    limit: MAX_MEETING_SOURCES,
  });
  assert.equal(MAX_MEETING_SOURCES, 8);
  assert.equal(result.data[0].text.length, MAX_PASSAGE_CHARS);
  assert.equal(MAX_PASSAGE_CHARS, 800);
});

test("ignores malformed dates and sends nothing but the passages", async () => {
  const { searchMeetingsTool } = await loadTool();
  const calls = installApi([]);
  const result = await searchMeetingsTool.execute({
    query: "budget",
    date_from: "last week",
    date_to: 5,
  });
  assert.deepEqual(calls[0], { query: "budget", limit: 8 });
  assert.equal(result.success, true);
  assert.deepEqual(result.data, []);
  assert.match(result.displayText, /toolStatus\.none|no matching passages/i);
});

test("an empty query is refused and an IPC failure is reported", async () => {
  const { searchMeetingsTool } = await loadTool();
  installApi([]);
  assert.equal((await searchMeetingsTool.execute({ query: "  " })).success, false);
  global.window = {
    electronAPI: {
      searchTranscriptPassages: async () => {
        throw new Error("db down");
      },
    },
  };
  const failed = await searchMeetingsTool.execute({ query: "budget" });
  assert.equal(failed.success, false);
});

test("the prompt instruction demands grounded answers, citations and word variants", async () => {
  const { searchMeetingsTool } = await loadTool();
  const { getAgentSystemPrompt } = await import("../../src/config/prompts.ts");
  const prompt = getAgentSystemPrompt([searchMeetingsTool]);
  assert.match(prompt, /only from the (returned )?passages/i);
  assert.match(prompt, /\[n\]/);
  assert.match(prompt, /nothing (is )?found|no passages/i);
  assert.match(prompt, /besluit/);
  assert.match(prompt, /besloten/);
  assert.match(prompt, /untrusted/i);
});

test("the tool is offered in every chat without an account, in local-only mode only", async () => {
  const { createToolRegistry } = await import("../../src/services/tools/index.ts");
  const settings = {
    isSignedIn: false,
    calendarConnected: false,
    cloudBackupEnabled: false,
    webSearchEnabled: false,
  };
  assert.ok(createToolRegistry(settings).get("search_meetings"));
  assert.ok(createToolRegistry({ ...settings, keepNotesUnchanged: true }).get("search_meetings"));
  // A chat pinned to a container must not search past it.
  const scoped = createToolRegistry({ ...settings, searchScope: { spaceId: 1, folderId: null } });
  assert.equal(scoped.get("search_meetings"), undefined);
  globalThis.__OW_UPSTREAM_MODE = true;
  try {
    assert.equal(createToolRegistry(settings).get("search_meetings"), undefined);
  } finally {
    delete globalThis.__OW_UPSTREAM_MODE;
  }
});

test("a note chat may search other meetings only when asked", async () => {
  const { getAgentSystemPrompt } = await import("../../src/config/prompts.ts");
  const prompt = getAgentSystemPrompt(["search_meetings"], { openNote: "NOTE BODY" });
  assert.match(prompt, /search_meetings only when the user asks/);
});

test("refs continue across the searches of one turn", async () => {
  const { searchMeetingsTool } = await loadTool();
  const { createToolExecutionScope } = await import("../../src/components/chat/toolExecutionScope.ts");
  installApi([row(), row({ passageId: 2 })]);
  const scope = createToolExecutionScope();
  const ctx = (id) => scope.createContext({ messageId: "m", toolCallId: id });
  const first = await searchMeetingsTool.execute({ query: "a" }, ctx("c1"));
  const second = await searchMeetingsTool.execute({ query: "b" }, ctx("c2"));
  assert.deepEqual(first.data.map((d) => d.ref), [1, 2]);
  assert.deepEqual(second.data.map((d) => d.ref), [3, 4]);
  // Another turn starts again at 1.
  const other = await searchMeetingsTool.execute(
    { query: "c" },
    createToolExecutionScope().createContext({ messageId: "m2", toolCallId: "c3" })
  );
  assert.equal(other.data[0].ref, 1);
});

test("cloud sync never carries meeting passages", async () => {
  const { conversationMessageMetadata } = await import("../../src/services/SyncService.ts");
  const metadata = JSON.stringify({
    turn: { status: "complete", startedAt: 1, reasoning: "r" },
    toolCalls: [
      { id: "1", name: "search_meetings", status: "completed", metadata: [{ ref: 1, text: "SECRET PASSAGE" }] },
      { id: "2", name: "search_notes", status: "completed", metadata: [{ id: 3 }] },
    ],
  });
  const out = conversationMessageMetadata(metadata);
  assert.ok(!JSON.stringify(out).includes("SECRET PASSAGE"));
  assert.equal(out.toolCalls[0].name, "search_meetings");
  assert.deepEqual(out.toolCalls[1].metadata, [{ id: 3 }]);
  assert.equal(out.turn.reasoning, undefined);
  assert.equal(conversationMessageMetadata(null), null);
});
