const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/components/chat/meetingCitations.ts");

const item = (ref, overrides = {}) => ({
  ref,
  noteId: 10 + ref,
  title: `Meeting ${ref}`,
  date: "2026-11-03 09:00:00",
  speaker: "Sanne",
  time: "02:05",
  text: `Passage ${ref}`,
  untrusted: true,
  ...overrides,
});
const call = (metadata, overrides = {}) => ({
  id: "c1",
  name: "search_meetings",
  arguments: "{}",
  status: "completed",
  metadata,
  ...overrides,
});

test("parseCitations links known sources and leaves unknown ones as plain text", async () => {
  const { parseCitations } = await load();
  const sources = [{ ref: 1, noteId: 11 }];
  const out = parseCitations("Besloten op vrijdag [1], maar ook [9].", sources);
  assert.match(out, /\[\[1\]\]\(#meeting-source-1\)/);
  assert.ok(out.includes("[9]") && !out.includes("#meeting-source-9"));
});

test("parseCitations handles groups and leaves code and existing links alone", async () => {
  const { parseCitations } = await load();
  const sources = [{ ref: 1 }, { ref: 2 }];
  assert.equal(
    parseCitations("Zie [1][2].", sources),
    "Zie [[1]](#meeting-source-1)[[2]](#meeting-source-2)."
  );
  assert.equal(parseCitations("`a[1]` en [1](https://x.test)", sources), "`a[1]` en [1](https://x.test)");
  assert.equal(parseCitations("```\nx[1]\n```\n[1]", sources), "```\nx[1]\n```\n[[1]](#meeting-source-1)");
  assert.equal(parseCitations("nothing [1]", []), "nothing [1]");
});

test("extractMeetingSources collects all completed searches, capped per search and validated", async () => {
  const { extractMeetingSources } = await load();
  const many = Array.from({ length: 12 }, (_, i) => item(i + 1, { text: "y".repeat(1000) }));
  const sources = extractMeetingSources([
    call(many),
    call([item(1)], { id: "c3", status: "error" }),
    { id: "c4", name: "search_notes", arguments: "{}", status: "completed", metadata: [item(1)] },
  ]);
  assert.equal(sources.length, 8);
  assert.equal(sources[0].text.length, 800);
  assert.deepEqual(sources.map((s) => s.ref), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(extractMeetingSources(undefined), []);
  assert.deepEqual(
    extractMeetingSources([call([{ ref: "x" }, null, item(2, { noteId: -4 })])]),
    []
  );
});

test("two searches in one reply map each citation to its own call's source", async () => {
  const { extractMeetingSources, parseCitations } = await load();
  const sources = extractMeetingSources([
    call([item(1, { title: "First" }), item(2, { title: "Second" })], { id: "a" }),
    call([item(3, { title: "Third", speaker: "Bram" })], { id: "b" }),
  ]);
  assert.deepEqual(sources.map((s) => [s.ref, s.title]), [[1, "First"], [2, "Second"], [3, "Third"]]);
  assert.equal(sources[2].speaker, "Bram");
  assert.match(parseCitations("A [1] B [3]", sources), /\[\[3\]\]\(#meeting-source-3\)/);
});

test("a ref shared by two passages, or with no source, stays plain", async () => {
  const { extractMeetingSources, parseCitations } = await load();
  // A saved reply from before refs were shared: both calls number from 1.
  const sources = extractMeetingSources([
    call([item(1, { title: "Old A" }), item(2, { title: "Only" })], { id: "a" }),
    call([item(1, { title: "Old B" })], { id: "b" }),
  ]);
  assert.deepEqual(sources.map((s) => s.ref), [2]);
  const out = parseCitations("x [1] y [2] z [9]", sources);
  assert.ok(!out.includes("#meeting-source-1") && !out.includes("#meeting-source-9"));
  assert.ok(out.includes("#meeting-source-2"));
  // One call repeating a ref is ambiguous too.
  assert.deepEqual(extractMeetingSources([call([item(1), item(1)])]), []);
  // A single call numbered from 1, as saved before this change, still works.
  assert.equal(extractMeetingSources([call([item(1), item(2)])]).length, 2);
});

test("sources survive saving and reopening the conversation", async () => {
  const { extractMeetingSources } = await load();
  const { replyMetadata, decodeChatMessages } = await import(
    "../../src/components/chat/chatPersistence.ts"
  );
  const toolCalls = [call([item(1), item(2, { speaker: null, time: null })])];
  const metadata = replyMetadata(toolCalls, undefined);
  const restored = decodeChatMessages({
    messages: [
      { id: 1, role: "assistant", content: "Antwoord [1]", metadata: JSON.stringify(metadata) },
    ],
  });
  assert.deepEqual(
    extractMeetingSources(restored[0].toolCalls),
    extractMeetingSources(toolCalls)
  );
  assert.equal(extractMeetingSources(restored[0].toolCalls).length, 2);
});

test("history replay never carries passage text", async () => {
  const { toHistoryMessages } = await import("../../src/components/chat/historyMessages.ts");
  const messages = [
    { id: "u", role: "user", content: "What was decided?", isStreaming: false },
    {
      id: "a",
      role: "assistant",
      content: "Shipping Friday [1].",
      isStreaming: false,
      toolCalls: [
        call([item(1, { text: "SECRET PASSAGE TEXT" })], { arguments: '{"query":"decided"}' }),
      ],
    },
    { id: "u2", role: "user", content: "And then?", isStreaming: false },
  ];
  for (const toolHistory of ["parts", "text"]) {
    const history = toHistoryMessages(messages, { toolHistory });
    assert.ok(!JSON.stringify(history).includes("SECRET PASSAGE TEXT"), toolHistory);
  }
});

const React = require("react");
const { createRoot } = require("react-dom/client");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");
const { installInteractiveDom, findElement } = require("../lib/interactiveDom");

function click(element) {
  element.dispatchEvent({
    type: "click",
    bubbles: true,
    button: 0,
    defaultPrevented: false,
    cancelBubble: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.cancelBubble = true;
    },
  });
}

test("each source shows meeting, speaker and time; expanding shows the passage and opens the meeting", async (t) => {
  const opened = [];
  let root;
  t.after(async () => {
    if (root) await React.act(async () => root.unmount());
  });
  installBrowserGlobals(t, { window: { electronAPI: { agentOpenNote: (id) => opened.push(id) } } });
  const container = installInteractiveDom(t);
  const vite = await createRendererServer(t, { cachePrefix: "openwhispr-meeting-sources-test-" });
  const { MeetingSources } = await vite.ssrLoadModule("/components/chat/MeetingSources.tsx");
  root = createRoot(container);

  await React.act(async () =>
    root.render(
      React.createElement(MeetingSources, {
        sources: [item(1, { text: "We ship project X on Friday." }), item(2, { speaker: null })],
      })
    )
  );

  assert.match(container.textContent, /Meeting 1/);
  assert.match(container.textContent, /Sanne/);
  assert.match(container.textContent, /meetingSources\.atTime/);
  assert.doesNotMatch(container.textContent, /We ship project X/);

  const toggle = findElement(
    container,
    (el) => el.tagName === "BUTTON" && el.getAttribute("aria-expanded") === "false"
  );
  await React.act(async () => click(toggle));
  assert.match(container.textContent, /We ship project X on Friday\./);

  const openButton = findElement(
    container,
    (el) => el.tagName === "BUTTON" && /meetingSources\.openMeeting/.test(el.textContent)
  );
  await React.act(async () => click(openButton));
  assert.deepEqual(opened, [11]);
});
