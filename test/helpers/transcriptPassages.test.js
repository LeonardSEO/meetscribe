const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPassages, segmentSpeakerLabel } = require("../../src/helpers/transcriptPassages.js");

const seg = (text, extra = {}) => ({ text, source: "system", ...extra });
const raw = (segments) => JSON.stringify(segments);

test("merges consecutive segments of one speaker and splits on a speaker change", () => {
  const passages = buildPassages(
    raw([
      seg("Hello there.", { speaker: "speaker_0", timestamp: 1 }),
      seg("How are you?", { speaker: "speaker_0", timestamp: 4 }),
      seg("Fine, thanks.", { speaker: "speaker_1", timestamp: 7 }),
    ]),
    {}
  );
  assert.equal(passages.length, 2);
  assert.deepEqual(
    passages.map((p) => [p.seq, p.speaker, p.startSeconds, p.endSeconds, p.text]),
    [
      [0, "Speaker 1", 1, 4, "Hello there. How are you?"],
      [1, "Speaker 2", 7, 7, "Fine, thanks."],
    ]
  );
});

test("a passage never exceeds 800 characters", () => {
  const sentence = "word ".repeat(30).trim(); // 149 chars
  const segments = Array.from({ length: 20 }, (_, i) =>
    seg(sentence, { speaker: "speaker_0", timestamp: i })
  );
  const passages = buildPassages(raw(segments), {});
  assert.ok(passages.length > 1);
  for (const p of passages) assert.ok(p.text.length <= 800, `length ${p.text.length}`);
  assert.equal(passages[0].startSeconds, 0);
  assert.ok(passages[0].endSeconds > 0);
});

test("one very long segment is split without losing text", () => {
  const text = "alpha ".repeat(500).trim();
  const passages = buildPassages(raw([seg(text, { speaker: "speaker_0", timestamp: 2 })]), {});
  assert.ok(passages.length > 1);
  for (const p of passages) {
    assert.ok(p.text.length <= 800);
    assert.equal(p.startSeconds, 2);
  }
  assert.equal(passages.map((p) => p.text).join(" "), text);
});

test("speaker names come from the mappings, and the note taker is labelled as get_note does", () => {
  const passages = buildPassages(
    raw([
      seg("I will send it.", { source: "mic", speaker: "you", timestamp: 0 }),
      seg("Great.", { speaker: "speaker_1", timestamp: 3 }),
      seg("Unlabelled.", { timestamp: 5 }),
    ]),
    { speaker_1: "Priya" }
  );
  assert.deepEqual(
    passages.map((p) => p.speaker),
    ["Note taker", "Priya", "Others"]
  );
});

test("live recordings store epoch milliseconds; times are relative seconds", () => {
  const base = 1700000000000;
  const passages = buildPassages(
    raw([
      seg("First.", { speaker: "speaker_0", timestamp: base }),
      seg("Second.", { speaker: "speaker_1", timestamp: base + 90_500 }),
    ]),
    {}
  );
  assert.deepEqual(
    passages.map((p) => p.startSeconds),
    [0, 90.5]
  );
});

test("plain text gives passages with null times and speaker", () => {
  const passages = buildPassages("We agreed on the budget.\nNext step is the review.", {});
  assert.equal(passages.length, 1);
  assert.equal(passages[0].speaker, null);
  assert.equal(passages[0].startSeconds, null);
  assert.equal(passages[0].endSeconds, null);
  assert.match(passages[0].text, /budget/);
});

test("invalid JSON falls back to plain text without throwing", () => {
  const passages = buildPassages('[{"text": "broken', {});
  assert.equal(passages.length, 1);
  assert.equal(passages[0].startSeconds, null);
  assert.match(passages[0].text, /broken/);
});

test("empty and non-string input give no passages", () => {
  assert.deepEqual(buildPassages("", {}), []);
  assert.deepEqual(buildPassages("   ", {}), []);
  assert.deepEqual(buildPassages(null, {}), []);
  assert.deepEqual(buildPassages("[]", {}), []);
});

test("speaker labels match the TS helper get_note uses", async () => {
  const { readableTranscript } = await import("../../src/utils/transcriptEvidence.ts");
  const segments = [
    seg("a", { source: "mic", speaker: "you" }),
    seg("b", { source: "mic", speaker: "you", recorderName: "Dana" }),
    seg("c", { source: "mic", speaker: "speaker_0" }),
    seg("d", { speaker: "speaker_2" }),
    seg("e", { speaker: "speaker_1", speakerName: "Sam" }),
    seg("f", { speaker: "speaker_1", speakerName: "Sam", speakerLocked: true }),
    seg("g", { source: "mic" }),
    seg("h", { source: "system" }),
    seg("i", { source: "system", speaker: "Guest" }),
    seg("j", { source: "mic", speakerName: "You" }),
    seg("k", { source: "mic", speaker: "speaker_3" }),
  ];
  const mappings = { speaker_1: "Priya", speaker_2: "Lee", speaker_3: "you" };
  const lines = readableTranscript(raw(segments), mappings).text.split("\n");
  assert.equal(lines.length, segments.length);
  segments.forEach((segment, i) => {
    const label = segmentSpeakerLabel(segment, mappings);
    const expected = label ? `${label}: ${segment.text}` : segment.text;
    assert.equal(lines[i], expected, `segment ${segment.text}`);
  });
});
