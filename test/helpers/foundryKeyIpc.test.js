const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const handlersModulePath = require.resolve("../../src/helpers/ipcHandlers");
const originalLoad = Module._load;
const handlers = new Map();
const sent = [];
let streamError;

const electronStub = {
  app: {
    getPath: () => "/tmp",
    getName: () => "test",
    getVersion: () => "0.0.0",
    isPackaged: false,
    on: () => {},
    requestSingleInstanceLock: () => true,
  },
  ipcMain: {
    handle: (channel, fn) => handlers.set(channel, fn),
    on: () => {},
    removeHandler: () => {},
  },
  net: {
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" }),
  },
  BrowserWindow: class BrowserWindow {
    static getAllWindows() {
      return [];
    }
    static fromWebContents() {
      return null;
    }
  },
  shell: {},
  dialog: {},
  screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 0, height: 0 } }) },
  systemPreferences: { getMediaAccessStatus: () => "granted" },
  session: { fromPartition: () => ({}) },
  clipboard: {},
  nativeImage: {},
  globalShortcut: {},
  utilityProcess: {},
  MessageChannelMain: class {},
};

Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "electron") return electronStub;
  if (request === "./tokenStore") return { get: () => "test-token" };
  if (parent?.filename === handlersModulePath) {
    if (request === "./debugLogger") return new Proxy({}, { get: () => () => {} });
    if (request === "./enterpriseAiProviders") {
      return {
        getEnterpriseAIModel: async () => ({
          doStream: async () => {
            throw streamError;
          },
        }),
      };
    }
    if (request === "./windowBroadcast") return { broadcastToWindows: () => {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function anything() {
  return new Proxy(function () {}, {
    get: (target, property) => {
      if (property === Symbol.toPrimitive || property === "toString") return () => "";
      if (property === "then") return undefined;
      return anything();
    },
    apply: () => anything(),
  });
}

let stored = "";
const environmentManager = {
  getFoundryApiKey: () => stored,
  saveFoundryApiKey: (key) => {
    stored = key;
    return { success: true };
  },
};

test.before(() => {
  delete require.cache[handlersModulePath];
  const IPCHandlers = require(handlersModulePath);
  const Ctor = IPCHandlers.default || IPCHandlers;
  const target = { sessionId: "s", environmentManager };
  const fake = new Proxy(target, {
    get: (value, property) => (property in value ? value[property] : anything()),
  });
  Ctor.prototype.setupHandlers.call(fake);
});

test.after(() => {
  Module._load = originalLoad;
});

const event = {
  sender: {
    id: 1,
    isDestroyed: () => false,
    send: (channel, message) => sent.push({ channel, message }),
    on: () => {},
    once: () => {},
    removeListener: () => {},
  },
};

test("saving the Foundry key stores it and has-foundry-api-key only returns a boolean", async () => {
  assert.equal(await handlers.get("has-foundry-api-key")(event), false);
  await handlers.get("save-foundry-api-key")(event, "secret-sentinel");
  const result = await handlers.get("has-foundry-api-key")(event);
  assert.equal(result, true);
  assert.equal(stored, "secret-sentinel");
});

test("no channel hands the Foundry key back to the renderer", () => {
  assert.equal(handlers.has("get-foundry-api-key"), false);
});

test("save-foundry-api-key rejects a non-string", () => {
  assert.throws(() => handlers.get("save-foundry-api-key")(event, 42), TypeError);
});

test("the enterprise stream error carries messageKey as well as the message", async () => {
  sent.length = 0;
  streamError = Object.assign(new Error("bad"), {
    statusCode: 400,
    responseBody: JSON.stringify({ error: { code: "context_length_exceeded" } }),
  });
  const result = await handlers.get("enterprise-stream-start")(event, {
    streamId: "s1",
    provider: "foundry",
    modelId: "dep",
    config: { foundryBaseUrl: "https://x.openai.azure.com", foundryWireApi: "responses" },
    options: {},
  });
  assert.equal(result.success, false);
  const errorMessage = sent.map((s) => s.message).find((m) => m.error);
  assert.ok(errorMessage, "an error part was sent");
  assert.equal(errorMessage.messageKey, "providerErrors.contextTooLarge");
  assert.equal(errorMessage.code, "CONTEXT_TOO_LARGE");
});
