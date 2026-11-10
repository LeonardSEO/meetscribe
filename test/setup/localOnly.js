const { before, after } = require("node:test");

// Call at the top level of a test file to run it in local-only mode.
function useLocalOnly() {
  let saved;
  before(() => {
    saved = globalThis.__OW_UPSTREAM_MODE;
    delete globalThis.__OW_UPSTREAM_MODE;
  });
  after(() => {
    if (saved === undefined) delete globalThis.__OW_UPSTREAM_MODE;
    else globalThis.__OW_UPSTREAM_MODE = saved;
  });
}

module.exports = { useLocalOnly };
