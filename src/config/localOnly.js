// Central switch for the account-free, local-only meeting assistant.
// Local-only is the product default; the test setup (test/setup/upstreamMode.js)
// sets the upstream marker so the existing suite keeps pinning upstream behaviour.
// ESM like providerHttpErrors.js: imported by the renderer and loaded by the main
// process through require(esm). A CommonJS file cannot load in the Vite renderer.
export function isLocalOnly() {
  return globalThis.__OW_UPSTREAM_MODE !== true;
}
