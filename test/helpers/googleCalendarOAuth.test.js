const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const oauthModulePath = require.resolve("../../src/helpers/googleCalendarOAuth.js");
const originalLoad = Module._load;
let flowStarted = false;

function loadOAuth() {
  delete require.cache[oauthModulePath];
  Module._load = function loadWithMocks(request, parent, isMain) {
    if (request === "electron") return { net: {} };
    if (request === "./oauthLoopbackFlow") {
      return {
        runOAuthLoopbackFlow: (options) => {
          flowStarted = true;
          return options;
        },
        OAuthFlowError: Error,
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(oauthModulePath);
  } finally {
    Module._load = originalLoad;
  }
}

function withClientId(value, fn) {
  const saved = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  if (value === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
  else process.env.GOOGLE_CALENDAR_CLIENT_ID = value;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    else process.env.GOOGLE_CALENDAR_CLIENT_ID = saved;
  }
}

test("a build without a Google client id refuses before opening the browser", () => {
  const GoogleCalendarOAuth = loadOAuth();
  flowStarted = false;
  withClientId(undefined, () => {
    assert.throws(
      () => new GoogleCalendarOAuth(null).startOAuthFlow(),
      /GOOGLE_CALENDAR_CLIENT_ID is not configured/
    );
  });
  assert.equal(flowStarted, false);
});

test("a configured client id starts the loopback flow", () => {
  const GoogleCalendarOAuth = loadOAuth();
  flowStarted = false;
  withClientId("client.apps.googleusercontent.com", () => {
    new GoogleCalendarOAuth(null).startOAuthFlow();
  });
  assert.equal(flowStarted, true);
});
