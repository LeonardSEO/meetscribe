// Central switch for the account-free, local-only meeting assistant.
// Local-only is the product default; the test setup (test/setup/upstreamMode.js)
// sets the upstream marker so the existing suite keeps pinning upstream behaviour.
// CommonJS so both the main process and the Vite renderer share it.
function isLocalOnly() {
  return globalThis.__OW_UPSTREAM_MODE !== true;
}

module.exports = { isLocalOnly };
