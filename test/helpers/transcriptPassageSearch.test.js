const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "electron") return { app: {} };
  return originalLoad.call(this, request, parent, isMain);
};
const DatabaseManager = require("../../src/helpers/database.js");
Module._load = originalLoad;

function createManager(t, { filename = ":memory:", reuse } = {}) {
  const sqlite = reuse || new DatabaseSync(filename);
  t.after(() => {
    if (sqlite.isOpen) sqlite.close();
  });
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS spaces (id INTEGER PRIMARY KEY, kind TEXT);
    CREATE TABLE IF NOT EXISTS space_accounts (space_id INTEGER, account_id TEXT);
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, transcript TEXT,
      deleted_at TEXT, account_id TEXT, space_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS speaker_mappings (
      note_id INTEGER NOT NULL, speaker_id TEXT NOT NULL, profile_id INTEGER,
      display_name TEXT NOT NULL, PRIMARY KEY (note_id, speaker_id)
    );
    INSERT OR IGNORE INTO spaces (id, kind) VALUES (1, 'private');
  `);
  sqlite.transaction = (callback) => () => {
    sqlite.exec("BEGIN");
    try {
      const result = callback();
      sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  };
  const manager = Object.create(DatabaseManager.prototype);
  manager.db = sqlite;
  manager.activeAccountId = null;
  manager._initTranscriptPassageIndex();
  return manager;
}

const segments = (...items) =>
  JSON.stringify(
    items.map(([text, speaker, timestamp]) => ({ text, source: "system", speaker, timestamp }))
  );

function addNote(
  manager,
  { title = "Weekly sync", transcript, createdAt = "2026-03-10 09:00:00" }
) {
  return Number(
    manager.db
      .prepare(
        "INSERT INTO notes (title, content, transcript, created_at, space_id) VALUES (?, '', ?, ?, 1)"
      )
      .run(title, transcript, createdAt).lastInsertRowid
  );
}

test("finds a word that only occurs in the transcript, with speaker and start time", (t) => {
  const m = createManager(t);
  const id = addNote(m, {
    transcript: segments(["We should revisit the zeppelin budget.", "speaker_0", 62]),
  });
  const [hit] = m.searchTranscriptPassages({ query: "zeppelin" });
  assert.equal(hit.noteId, id);
  assert.equal(hit.noteTitle, "Weekly sync");
  assert.equal(hit.noteDate, "2026-03-10 09:00:00");
  assert.equal(hit.speaker, "Speaker 1");
  assert.equal(hit.startSeconds, 62);
  assert.match(hit.text, /zeppelin/);
  assert.equal(typeof hit.passageId, "number");
});

test("diacritics are ignored", (t) => {
  const m = createManager(t);
  addNote(m, { transcript: segments(["De coördinatie loopt goed.", "speaker_0", 1]) });
  assert.equal(m.searchTranscriptPassages({ query: "coordinatie" }).length, 1);
  assert.equal(m.searchTranscriptPassages({ query: "coördinatie" }).length, 1);
});

test("odd queries never throw", (t) => {
  const m = createManager(t);
  addNote(m, { transcript: segments(["The Q3 plan is ready.", "speaker_0", 1]) });
  for (const query of [
    "Q3-plan",
    '"',
    "AND",
    "*",
    "",
    "   ",
    "OR NOT",
    "a:b (c",
    null,
    undefined,
  ]) {
    assert.doesNotThrow(() => m.searchTranscriptPassages({ query }), String(query));
  }
  assert.equal(m.searchTranscriptPassages({ query: "Q3-plan" }).length, 1);
  assert.deepEqual(m.searchTranscriptPassages({ query: '"' }), []);
});

test("terms are joined with OR and ranked by relevance", (t) => {
  const m = createManager(t);
  addNote(m, { title: "A", transcript: segments(["Only budget here.", "speaker_0", 1]) });
  addNote(m, {
    title: "B",
    transcript: segments(["Budget and roadmap together.", "speaker_0", 1]),
  });
  const hits = m.searchTranscriptPassages({ query: "budget roadmap" });
  assert.equal(hits.length, 2);
  assert.equal(hits[0].noteTitle, "B");
});

test("dateFrom and dateTo filter on the meeting date", (t) => {
  const m = createManager(t);
  addNote(m, {
    title: "Jan",
    createdAt: "2026-01-05 10:00:00",
    transcript: segments(["alpha topic", "speaker_0", 1]),
  });
  addNote(m, {
    title: "Mar",
    createdAt: "2026-03-05T10:00:00.000Z",
    transcript: segments(["alpha topic", "speaker_0", 1]),
  });
  const titles = (opts) =>
    m.searchTranscriptPassages({ query: "alpha", ...opts }).map((h) => h.noteTitle);
  assert.deepEqual(titles({ dateFrom: "2026-02-01" }), ["Mar"]);
  assert.deepEqual(titles({ dateTo: "2026-02-01" }), ["Jan"]);
  assert.deepEqual(titles({ dateFrom: "2026-01-05", dateTo: "2026-01-05" }), ["Jan"]);
  assert.equal(titles({}).length, 2);
});

test("noteId restricts the search to one note", (t) => {
  const m = createManager(t);
  const a = addNote(m, { transcript: segments(["alpha topic", "speaker_0", 1]) });
  addNote(m, { transcript: segments(["alpha topic", "speaker_0", 1]) });
  const hits = m.searchTranscriptPassages({ query: "alpha", noteId: a });
  assert.deepEqual(
    hits.map((h) => h.noteId),
    [a]
  );
});

test("a deleted note disappears and a restored note returns", (t) => {
  const m = createManager(t);
  const id = addNote(m, { transcript: segments(["gamma topic", "speaker_0", 1]) });
  assert.equal(m.searchTranscriptPassages({ query: "gamma" }).length, 1);
  m.db.prepare("UPDATE notes SET deleted_at = '2026-04-01' WHERE id = ?").run(id);
  assert.equal(m.searchTranscriptPassages({ query: "gamma" }).length, 0);
  m.db.prepare("UPDATE notes SET deleted_at = NULL WHERE id = ?").run(id);
  assert.equal(m.searchTranscriptPassages({ query: "gamma" }).length, 1);
  m.db.prepare("DELETE FROM notes WHERE id = ?").run(id);
  assert.equal(m.searchTranscriptPassages({ query: "gamma" }).length, 0);
  assert.equal(m.db.prepare("SELECT COUNT(*) AS n FROM transcript_passages").get().n, 0);
});

test("a changed transcript replaces the old passages", (t) => {
  const m = createManager(t);
  const id = addNote(m, { transcript: segments(["delta old words", "speaker_0", 1]) });
  assert.equal(m.searchTranscriptPassages({ query: "delta" }).length, 1);
  m.db
    .prepare("UPDATE notes SET transcript = ? WHERE id = ?")
    .run(segments(["epsilon new words", "speaker_0", 1]), id);
  assert.equal(m.searchTranscriptPassages({ query: "delta" }).length, 0);
  assert.equal(m.searchTranscriptPassages({ query: "epsilon" }).length, 1);
});

test("a renamed speaker is searchable and the old name is gone", (t) => {
  const m = createManager(t);
  const id = addNote(m, { transcript: segments(["zeta remark", "speaker_1", 5]) });
  assert.equal(m.searchTranscriptPassages({ query: "Priya" }).length, 0);
  m.db
    .prepare(
      "INSERT INTO speaker_mappings (note_id, speaker_id, display_name) VALUES (?, 'speaker_1', 'Priya')"
    )
    .run(id);
  const [hit] = m.searchTranscriptPassages({ query: "Priya" });
  assert.equal(hit.speaker, "Priya");
  m.db.prepare("UPDATE speaker_mappings SET display_name = 'Rohan' WHERE note_id = ?").run(id);
  assert.equal(m.searchTranscriptPassages({ query: "Priya" }).length, 0);
  assert.equal(m.searchTranscriptPassages({ query: "Rohan" }).length, 1);
});

test("limit defaults to 8 and is capped at 20", (t) => {
  const m = createManager(t);
  for (let i = 0; i < 30; i++) {
    addNote(m, { transcript: segments([`theta mention ${i}`, "speaker_0", i]) });
  }
  assert.equal(m.searchTranscriptPassages({ query: "theta" }).length, 8);
  assert.equal(m.searchTranscriptPassages({ query: "theta", limit: 100 }).length, 20);
  assert.equal(m.searchTranscriptPassages({ query: "theta", limit: 3 }).length, 3);
  assert.equal(m.searchTranscriptPassages({ query: "theta", limit: 0 }).length, 8);
});

test("plain-text transcripts are indexed with null times", (t) => {
  const m = createManager(t);
  addNote(m, { transcript: "We talked about the iota migration." });
  const [hit] = m.searchTranscriptPassages({ query: "iota" });
  assert.equal(hit.speaker, null);
  assert.equal(hit.startSeconds, null);
});

test("existing notes are queued by the migration and indexed incrementally on search", (t) => {
  const sqlite = new DatabaseSync(":memory:");
  const first = createManager(t, { reuse: sqlite });
  sqlite.exec(
    "DROP TABLE pending_transcript_index; DROP TABLE transcript_passages; DROP TABLE transcript_passages_fts"
  );
  sqlite.exec("DROP TRIGGER IF EXISTS notes_transcript_index_insert");
  addNote(first, { transcript: segments(["kappa legacy", "speaker_0", 1]) });
  addNote(first, { transcript: null });
  // Re-running the migration on a database that predates the index.
  first._initTranscriptPassageIndex();
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM transcript_passages").get().n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM pending_transcript_index").get().n, 1);
  assert.equal(first.searchTranscriptPassages({ query: "kappa" }).length, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM pending_transcript_index").get().n, 0);
});

test("notes outside the active account scope are not returned", (t) => {
  const m = createManager(t);
  m.db.exec("INSERT INTO spaces (id, kind) VALUES (2, 'team')");
  m.db
    .prepare(
      "INSERT INTO notes (title, transcript, space_id, account_id) VALUES ('Theirs', ?, 2, 'other')"
    )
    .run(segments(["lambda secret", "speaker_0", 1]));
  assert.equal(m.searchTranscriptPassages({ query: "lambda" }).length, 0);
});

test("one note that fails to index does not roll back the rest of the drain", (t) => {
  const m = createManager(t);
  m.db.exec(`
    CREATE TRIGGER fail_on_boom BEFORE INSERT ON transcript_passages
    WHEN NEW.text LIKE '%kaboomsecret%'
    BEGIN SELECT RAISE(ABORT, 'boom'); END;
  `);
  const bad = addNote(m, {
    title: "Bad",
    transcript: segments(["first fine line", "speaker_0", 1], ["kaboomsecret line", "speaker_0", 2]),
  });
  addNote(m, { title: "Good", transcript: segments(["omega fine line", "speaker_0", 1]) });
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.map(String).join(" "));
  t.after(() => {
    console.error = original;
  });
  assert.doesNotThrow(() => m._drainTranscriptIndex());
  // The healthy note is indexed, the failing one has no half-written passages
  // and its journal row is cleared so every later search doesn't retry it.
  assert.equal(m.searchTranscriptPassages({ query: "omega" }).length, 1);
  assert.equal(
    m.db.prepare("SELECT COUNT(*) AS n FROM transcript_passages WHERE note_id = ?").get(bad).n,
    0
  );
  assert.equal(m.db.prepare("SELECT COUNT(*) AS n FROM pending_transcript_index").get().n, 0);
  assert.ok(!logged.some((line) => line.includes("kaboomsecret")));
});

test("an invalid noteId is ignored and a numeric string is accepted", (t) => {
  const m = createManager(t);
  const a = addNote(m, { title: "A", transcript: segments(["sigma topic", "speaker_0", 1]) });
  addNote(m, { title: "B", transcript: segments(["sigma topic", "speaker_0", 1]) });
  const count = (noteId) => m.searchTranscriptPassages({ query: "sigma", noteId }).length;
  assert.equal(count(a), 1);
  assert.equal(count(String(a)), 1);
  for (const bad of ["abc", "1 OR 1=1", 1.5, NaN, {}, [], -3, 0, true]) {
    assert.doesNotThrow(() => count(bad), String(bad));
    assert.equal(count(bad), 2, String(bad));
  }
});
