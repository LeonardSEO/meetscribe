const test = require("node:test");
const assert = require("node:assert/strict");

const { isLocalOnly } = require("../../src/config/localOnly");

test("defaults to local-only when the upstream marker is absent", () => {
  const saved = globalThis.__OW_UPSTREAM_MODE;
  delete globalThis.__OW_UPSTREAM_MODE;
  try {
    assert.equal(isLocalOnly(), true);
  } finally {
    if (saved !== undefined) globalThis.__OW_UPSTREAM_MODE = saved;
  }
});

test("the test setup marker restores upstream behaviour", () => {
  const saved = globalThis.__OW_UPSTREAM_MODE;
  globalThis.__OW_UPSTREAM_MODE = true;
  try {
    assert.equal(isLocalOnly(), false);
  } finally {
    if (saved === undefined) delete globalThis.__OW_UPSTREAM_MODE;
    else globalThis.__OW_UPSTREAM_MODE = saved;
  }
});
