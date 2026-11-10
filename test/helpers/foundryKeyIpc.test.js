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
    if (request === "ai") {
      return {
        generateText: async () => {
          throw streamError;
        },
      };
    }
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
let savedConfig = { baseUrl: "", wireApi: "responses" };
const environmentManager = {
  getFoundryConfig: () => savedConfig,
  saveFoundryConfig: (config) => {
    savedConfig = config;
    return { success: true };
  },
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
  savedConfig = { baseUrl: "https://x.openai.azure.com/openai/v1", wireApi: "responses" };
  streamError = Object.assign(new Error("bad"), {
    statusCode: 400,
    responseBody: JSON.stringify({ error: { code: "context_length_exceeded" } }),
  });
  const result = await handlers.get("enterprise-stream-start")(event, {
    streamId: "s1",
    provider: "foundry",
    modelId: "dep",
    config: { foundryBaseUrl: "https://evil.example.com/v1", foundryWireApi: "chat" },
    options: {},
  });
  assert.equal(result.success, false);
  const errorMessage = sent.map((s) => s.message).find((m) => m.error);
  assert.ok(errorMessage, "an error part was sent");
  assert.equal(errorMessage.messageKey, "providerErrors.contextTooLarge");
  assert.equal(errorMessage.code, "CONTEXT_TOO_LARGE");
  assert.equal(result.code, "CONTEXT_TOO_LARGE");
});

test("save-foundry-config stores the config, get-foundry-config never returns the key", async () => {
  stored = "secret-sentinel";
  const saved = await handlers.get("save-foundry-config")(event, {
    baseUrl: "https://x.openai.azure.com",
    wireApi: "chat",
  });
  assert.equal(saved.baseUrl, "https://x.openai.azure.com/openai/v1");
  assert.equal(saved.keyCleared, false);
  const config = await handlers.get("get-foundry-config")(event);
  assert.deepEqual(config, { baseUrl: "https://x.openai.azure.com/openai/v1", wireApi: "chat" });
  assert.ok(!JSON.stringify(config).includes("secret-sentinel"));
});

test("moving to another origin through save-foundry-config clears the key", async () => {
  stored = "secret-sentinel";
  const moved = await handlers.get("save-foundry-config")(event, {
    baseUrl: "https://api.example.com/v1",
    wireApi: "chat",
  });
  assert.equal(moved.keyCleared, true);
  assert.equal(stored, "");
  await assert.rejects(async () =>
    handlers.get("save-foundry-config")(event, { baseUrl: "http://169.254.169.254/v1" })
  );
});

test("process-enterprise-reasoning returns the code for a context-length refusal", async () => {
  streamError = Object.assign(new Error("bad"), {
    statusCode: 400,
    responseBody: JSON.stringify({ error: { code: "context_length_exceeded" } }),
  });
  savedConfig = { baseUrl: "https://x.openai.azure.com/openai/v1", wireApi: "responses" };
  const result = await handlers.get("process-enterprise-reasoning")(event, "text", "dep", "agent", {
    provider: "foundry",
  });
  assert.equal(result.success, false);
  assert.equal(result.code, "CONTEXT_TOO_LARGE");
  assert.equal(result.messageKey, "providerErrors.contextTooLarge");
});
