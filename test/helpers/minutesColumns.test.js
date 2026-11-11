const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb } = require("./harness/db.js");

// Minutes JSON and the deployment that wrote it are local columns on notes.

const saved = (db) => db.saveNote("Weekly", "body", "meeting").note;

test("notes have minutes_json and minutes_model, empty on a new note", (t) => {
  const db = createDb(t);
  if (!db) return;
  const columns = db.db
    .prepare("PRAGMA table_info(notes)")
    .all()
    .map((c) => c.name);
  assert.ok(columns.includes("minutes_json"));
  assert.ok(columns.includes("minutes_model"));
  const note = db.getNote(saved(db).id);
  assert.equal(note.minutes_json ?? null, null);
  assert.equal(note.minutes_model ?? null, null);
});

test("updateNote stores the minutes beside the summary and Undo's null values clear them", (t) => {
  const db = createDb(t);
  if (!db) return;
  const { id } = saved(db);
  const result = db.updateNote(id, {
    enhanced_content: "## Summary\nX",
    minutes_json: '{"a":1}',
    minutes_model: "deployment-1",
  });
  assert.equal(result.success, true);
  const note = db.getNote(id);
  assert.equal(note.minutes_json, '{"a":1}');
  assert.equal(note.minutes_model, "deployment-1");
  db.updateNote(id, { minutes_json: null, minutes_model: null });
  assert.equal(db.getNote(id).minutes_json, null);
  assert.equal(db.getNote(id).minutes_model, null);
});

test("storing minutes does not rewrite the transcript or queue a text sync operation", (t) => {
  const db = createDb(t);
  if (!db) return;
  const { id } = saved(db);
  db.updateNote(id, { transcript: "[]" });
  const before = db.getNote(id);
  db.updateNote(id, { minutes_json: "{}", minutes_model: "m" });
  const after = db.getNote(id);
  assert.equal(after.transcript, "[]");
  assert.equal(after.enhanced_content_sync_operation, before.enhanced_content_sync_operation);
  assert.equal(after.enhanced_content_edit_generation, before.enhanced_content_edit_generation);
});

test("the built-in minutes template is seeded", (t) => {
  const db = createDb(t);
  if (!db) return;
  const { MINUTES_KEY } = require("../../src/helpers/builtinActions.js");
  const rows = db.getActions().filter((row) => row.translation_key === MINUTES_KEY);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "template");
});
