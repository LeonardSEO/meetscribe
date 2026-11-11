const test = require("node:test");
const assert = require("node:assert/strict");

let minutesModule;
let mentionModule;

test.before(async () => {
  const path = require("node:path");
  const { pathToFileURL } = require("node:url");
  const root = process.env.OPENWHISPR_TEST_SOURCE || path.resolve(__dirname, "../..");
  minutesModule = await import(pathToFileURL(path.join(root, "src/utils/meetingMinutes.ts")));
  mentionModule = await import(pathToFileURL(path.join(root, "src/utils/mentionMarkdown.ts")));
});

const valid = {
  language: "en",
  summary: "We aligned on the launch plan.",
  topics: [{ title: "Launch", points: ["Date is fixed", "Budget approved"] }],
  decisions: ["Launch on 1 March"],
  actionItems: [{ task: "Send quote", owner: "Sam", deadline: "Friday" }],
};
const fenced = (obj, tag = "json") => "```" + tag + "\n" + JSON.stringify(obj) + "\n```";
const render = (item, language = "en") =>
  minutesModule.renderMinutesMarkdown({ ...valid, language, actionItems: [item] });

test("accepts plain JSON", () => {
  const r = minutesModule.parseMinutes(JSON.stringify(valid));
  assert.equal(r.ok, true);
  assert.deepEqual(r.minutes, valid);
});

test("accepts JSON wrapped in a code fence", () => {
  assert.equal(minutesModule.parseMinutes(fenced(valid)).ok, true);
  assert.equal(minutesModule.parseMinutes(fenced(valid, "")).ok, true);
});

test("tolerates prose around a single JSON object", () => {
  const r = minutesModule.parseMinutes(
    `Here you go:\n${JSON.stringify(valid)}\nHope it helps {sure}`
  );
  assert.equal(r.ok, false); // trailing brace makes it ambiguous
  const ok = minutesModule.parseMinutes(`Here you go:\n${JSON.stringify(valid)}\nHope it helps`);
  assert.equal(ok.ok, true);
});

test("rejects missing fields, non-JSON and non-objects", () => {
  assert.equal(minutesModule.parseMinutes('{"summary":"x"}').ok, false);
  assert.equal(minutesModule.parseMinutes("Hier zijn de notulen").ok, false);
  assert.equal(minutesModule.parseMinutes("[1,2]").ok, false);
  assert.equal(minutesModule.parseMinutes('"text"').ok, false);
  assert.equal(minutesModule.parseMinutes("").ok, false);
  const bad = minutesModule.parseMinutes("nope");
  assert.equal(typeof bad.reason, "string");
});

test("rejects two JSON objects in one reply", () => {
  const two = `${JSON.stringify(valid)} and ${JSON.stringify(valid)}`;
  assert.equal(minutesModule.parseMinutes(two).ok, false);
});

test("trims strings, drops empty entries and normalises empty owner/deadline", () => {
  const r = minutesModule.parseMinutes(
    JSON.stringify({
      language: " nl ",
      summary: "  hoi  ",
      topics: [
        { title: " A ", points: [" x ", "  ", ""] },
        { title: "  ", points: ["y"] },
      ],
      decisions: ["", " d "],
      actionItems: [
        { task: " t ", owner: "  ", deadline: "" },
        { task: "  ", owner: "Sam", deadline: null },
      ],
    })
  );
  assert.equal(r.ok, true);
  assert.equal(r.minutes.language, "nl");
  assert.equal(r.minutes.summary, "hoi");
  assert.deepEqual(r.minutes.topics, [{ title: "A", points: ["x"] }]);
  assert.deepEqual(r.minutes.decisions, ["d"]);
  assert.deepEqual(r.minutes.actionItems, [{ task: "t", owner: null, deadline: null }]);
});

test("renders Dutch headings for language nl, nl-NL and NL", () => {
  for (const language of ["nl", "nl-NL", "NL"]) {
    const md = minutesModule.renderMinutesMarkdown({ ...valid, language });
    for (const h of ["## Samenvatting", "## Bespreekpunten", "## Besluiten", "## Actiepunten"]) {
      assert.ok(md.includes(h), `${language}: ${h}`);
    }
  }
});

test("falls back to English headings for an unknown language", () => {
  for (const language of ["xx", "", "en-GB"]) {
    const md = minutesModule.renderMinutesMarkdown({ ...valid, language });
    for (const h of ["## Summary", "## Discussion points", "## Decisions", "## Action items"]) {
      assert.ok(md.includes(h), `${language}: ${h}`);
    }
    assert.ok(!md.includes("Samenvatting"));
  }
});

test("empty lists omit their heading", () => {
  const md = minutesModule.renderMinutesMarkdown({
    ...valid,
    topics: [],
    decisions: [],
    actionItems: [],
  });
  assert.ok(md.includes("## Summary"));
  for (const h of ["## Discussion points", "## Decisions", "## Action items"]) {
    assert.ok(!md.includes(h));
  }
});

test("renders topics and decisions", () => {
  const md = minutesModule.renderMinutesMarkdown(valid);
  assert.ok(md.includes("### Launch\n- Date is fixed\n- Budget approved"));
  assert.ok(md.includes("## Decisions\n- Launch on 1 March"));
});

test("action items put the deadline in the task part, owner last", () => {
  assert.ok(
    render({ task: "Send quote", owner: "Sam", deadline: "Friday" }).includes(
      "- [ ] Send quote (Friday) — Sam\n"
    )
  );
  assert.ok(
    render({ task: "Send quote", owner: null, deadline: "Friday" }).includes(
      "- [ ] Send quote (Friday)\n"
    )
  );
  assert.ok(
    render({ task: "Send quote", owner: "Sam", deadline: null }).includes(
      "- [ ] Send quote — Sam\n"
    )
  );
});

test("omits owner and deadline when not mentioned", () => {
  assert.ok(
    render({ task: "Offerte sturen", owner: null, deadline: null }).includes(
      "- [ ] Offerte sturen\n"
    )
  );
});

test("output works with tagActionItemOwners", () => {
  const people = [{ name: "Sam Jansen", email: "sam@example.com" }];
  for (const deadline of [null, "vrijdag"]) {
    const md = render({ task: "Offerte sturen", owner: "Sam", deadline }, "nl");
    const tagged = mentionModule.tagActionItemOwners(md, people);
    assert.ok(tagged.includes("[@Sam Jansen](mention:"), `deadline=${deadline}: ${tagged}`);
    if (deadline) assert.ok(tagged.includes("Offerte sturen (vrijdag) — [@Sam Jansen]"));
  }
});

test("model strings cannot create headings or list items", () => {
  const md = minutesModule.renderMinutesMarkdown({
    language: "en",
    summary: "Intro\n## Fake heading\n- fake item",
    topics: [{ title: "T\n## X", points: ["p\n- q"] }],
    decisions: ["d\n- [ ] sneaky"],
    actionItems: [{ task: "a\n## b", owner: "o\n- p", deadline: "x\ny" }],
  });
  const lines = md.split("\n");
  assert.deepEqual(
    lines.filter((l) => l.startsWith("#")),
    ["## Summary", "## Discussion points", "### T ## X", "## Decisions", "## Action items"]
  );
  assert.equal(lines.filter((l) => /^- /.test(l)).length, 3);
  assert.equal(lines.filter((l) => /^- \[ \]/.test(l)).length, 1);
  assert.ok(!lines.some((l) => l.startsWith("- fake") || l.startsWith("## Fake")));
});

test("summary starting with markdown markers does not become a heading or list", () => {
  const md = minutesModule.renderMinutesMarkdown({ ...valid, summary: "# Title" });
  assert.ok(!md.split("\n").some((l) => l === "# Title"));
});

test("language null is treated as English", () => {
  const r = minutesModule.parseMinutes(JSON.stringify({ ...valid, language: null }));
  assert.equal(r.ok, true);
  assert.equal(r.minutes.language, "en");
});

test("rendered text cannot open a fence, rule, table or checkbox", () => {
  const hostile = ["```js", "~~~", "---", "***", "===", "| a | b |", "[ ] sneaky", "[x] done"];
  for (const text of hostile) {
    const md = minutesModule.renderMinutesMarkdown({
      language: "en",
      summary: text,
      topics: [{ title: "T", points: [text] }],
      decisions: [text],
      actionItems: [],
    });
    const lines = md.split("\n");
    assert.equal(lines[1].startsWith("\\"), true, `summary ${text}`);
    const bullets = lines.filter((line) => line.startsWith("- "));
    assert.equal(bullets.length, 2, text);
    for (const bullet of bullets) {
      assert.equal(bullet.startsWith("- \\"), true, `${text} -> ${bullet}`);
    }
  }
});

test("ordinary text is not escaped", () => {
  const md = minutesModule.renderMinutesMarkdown({
    ...valid,
    summary: "Budget | scope is fine",
    decisions: ["Use [ticket] 12"],
  });
  assert.match(md, /\nBudget \| scope is fine\n/);
  assert.match(md, /- Use \[ticket\] 12/);
});
