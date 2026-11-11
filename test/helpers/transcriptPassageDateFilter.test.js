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

function addNote(manager, { transcript, createdAt }) {
  return Number(
    manager.db
      .prepare(
        "INSERT INTO notes (title, content, transcript, created_at, space_id) VALUES ('Sync', '', ?, ?, 1)"
      )
      .run(transcript, createdAt).lastInsertRowid
  );
}

test("the date filter compares local calendar days, not UTC days", (t) => {
  const previous = process.env.TZ;
  process.env.TZ = "Europe/Amsterdam";
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
  const m = createManager(t);
  // 23:30 UTC on 9 March is 00:30 on 10 March in Amsterdam (UTC+1).
  addNote(m, {
    transcript: segments(["Shipping the zeppelin budget.", "speaker_0", 5]),
    createdAt: "2026-03-09 23:30:00",
  });
  const search = (filters) => m.searchTranscriptPassages({ query: "zeppelin", ...filters });
  assert.equal(search({ dateFrom: "2026-03-10", dateTo: "2026-03-10" }).length, 1);
  assert.equal(search({ dateTo: "2026-03-09" }).length, 0);
  assert.equal(search({ dateFrom: "2026-03-09", dateTo: "2026-03-09" }).length, 0);
});
