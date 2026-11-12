#!/usr/bin/env node
// Removes stale @electron/rebuild markers so the next package rebuilds native modules
// for Electron (see scripts/lib/native-rebuild-cache.js).
const path = require("path");
const { clearNativeRebuildMarkers } = require("./lib/native-rebuild-cache");

const removed = clearNativeRebuildMarkers(path.join(__dirname, "..", "node_modules"));
console.log(
  removed.length
    ? `Cleared ${removed.length} native rebuild marker(s); electron-builder will rebuild them for Electron.`
    : "No native rebuild markers to clear."
);
