const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb } = require("./harness/db.js");

test("notes stay readable when no account scope was ever set", (t) => {
  const db = createDb(t);
  if (!db) return;
  assert.equal(db.activeAccountId, null);
  const saved = db.saveNote("Weekly sync", "Agenda and decisions").note;
  const read = db.getNote(saved.id);
  assert.ok(read, "the note saved without an account scope is returned");
  assert.equal(read.title, "Weekly sync");
  assert.equal(
    db.getNotes().some((n) => n.id === saved.id),
    true
  );
});
