const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeFoundryBaseUrl,
  validateFoundryEndpoint,
  createFoundryModel,
  getFoundryCredential,
  resolveFoundryRuntime,
  applyFoundryConfig,
  isAzureHost,
} = require("../../src/helpers/foundryProvider.js");
const { getEnterpriseAIModel } = require("../../src/helpers/enterpriseAiProviders.js");
const {
  mapEnterpriseError,
  isEnterpriseProvider,
  pickEnterpriseConfig,
} = require("../../src/helpers/enterpriseProviderErrors.js");

const prompt = [{ role: "user", content: [{ type: "text", text: "Hi" }] }];
const originalFetch = global.fetch;
let calls;

function stubFetch(responseBody = "{}", status = 200) {
  calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: init?.body ? JSON.parse(init.body) : null });
    return new Response(responseBody, {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

async function call(model, options = {}) {
  try {
    await model.doGenerate({ prompt, ...options });
  } catch {
    // The stub response is not a full completion; only the request matters here.
  }
  return calls[0];
}

test.afterEach(() => {
  global.fetch = originalFetch;
});

for (const raw of [
  "https://x.openai.azure.com",
  "https://x.openai.azure.com/openai/v1/",
  "https://x.openai.azure.com/openai/deployments/gpt/chat/completions?api-version=2024-10-21",
  "https://x.services.ai.azure.com/api/projects/p",
]) {
  test(`normalizes ${raw}`, () =>
    assert.equal(normalizeFoundryBaseUrl(raw), `${new URL(raw).origin}/openai/v1`));
}

test("keeps a non-Azure base URL as given, without trailing slash", () =>
  assert.equal(
    normalizeFoundryBaseUrl("https://api.example.com/v1/"),
    "https://api.example.com/v1"
  ));

test("normalize throws on invalid input", () => {
  for (const bad of ["", "   ", "not a url", "ftp://x.example.com", undefined]) {
    assert.throws(() => normalizeFoundryBaseUrl(bad));
  }
});

test("responses wire posts to /responses with store:false and no temperature", async () => {
  stubFetch();
  const model = createFoundryModel("my-deployment", "k", {
    foundryBaseUrl: "https://x.openai.azure.com",
    foundryWireApi: "responses",
  });
  const request = await call(model, { temperature: 0.7 });
  assert.equal(request.url, "https://x.openai.azure.com/openai/v1/responses");
  assert.equal(request.body.store, false);
  assert.ok(!("temperature" in request.body));
  assert.equal(request.body.model, "my-deployment");
  assert.deepEqual(request.body.include, ["reasoning.encrypted_content"]);
});

test("chat wire posts to /chat/completions", async () => {
  stubFetch();
  const model = createFoundryModel("gpt", "k", {
    foundryBaseUrl: "https://x.openai.azure.com/openai/v1",
    foundryWireApi: "chat",
  });
  const request = await call(model, { temperature: 0.7 });
  assert.ok(request.url.endsWith("/chat/completions"));
  assert.ok(!("temperature" in request.body));
});

test("Azure chat wire sends max_completion_tokens, not max_tokens", async () => {
  stubFetch();
  const model = createFoundryModel("gpt-4o", "k", {
    foundryBaseUrl: "https://x.openai.azure.com",
    foundryWireApi: "chat",
  });
  const request = await call(model, { maxOutputTokens: 123 });
  assert.equal(request.body.max_completion_tokens, 123);
  assert.ok(!("max_tokens" in request.body));
});

test("generic chat wire keeps max_tokens", async () => {
  stubFetch();
  const model = createFoundryModel("llama", "k", {
    foundryBaseUrl: "https://api.example.com/v1",
    foundryWireApi: "chat",
  });
  const request = await call(model, { maxOutputTokens: 123 });
  assert.equal(request.body.max_tokens, 123);
  assert.ok(!("max_completion_tokens" in request.body));
});

test("sends the key as a bearer token", async () => {
  stubFetch();
  const model = createFoundryModel("gpt", "k", {
    foundryBaseUrl: "https://x.openai.azure.com",
    foundryWireApi: "responses",
  });
  const request = await call(model);
  const headers = new Headers(request.init.headers);
  assert.equal(headers.get("authorization"), "Bearer k");
});

test("Azure without a key is refused before any request", () => {
  stubFetch();
  assert.throws(
    () =>
      createFoundryModel("gpt", "", {
        foundryBaseUrl: "https://x.openai.azure.com",
        foundryWireApi: "responses",
      }),
    (error) => error.code === "API_KEY_MISSING"
  );
  assert.equal(calls.length, 0);
});

test("rejects http on a public host and cloud metadata hosts", () => {
  for (const url of [
    "http://api.example.com/v1",
    "http://8.8.8.8/v1",
    "https://169.254.169.254/v1",
    "http://169.254.169.254/v1",
    "https://metadata.google.internal/v1",
    "http://metadata.google.internal/v1",
    "https://[fd00:ec2::254]/v1",
    "ftp://x.example.com",
  ]) {
    assert.throws(() => validateFoundryEndpoint(url), undefined, url);
  }
});

test("allows https on a public host", () => {
  validateFoundryEndpoint("https://x.openai.azure.com/openai/v1");
  validateFoundryEndpoint("https://api.example.com/v1");
});

test("allows http on localhost and private ranges", () => {
  for (const url of [
    "http://localhost:11434/v1",
    "http://127.0.0.1:8080/v1",
    "http://[::1]:8080/v1",
    "http://10.1.2.3/v1",
    "http://172.16.0.5/v1",
    "http://192.168.1.20:8000/v1",
  ]) {
    validateFoundryEndpoint(url);
  }
});

test("refuses OpenWhispr hosts as the base URL in local-only mode", () => {
  const saved = globalThis.__OW_UPSTREAM_MODE;
  delete globalThis.__OW_UPSTREAM_MODE;
  try {
    assert.throws(() => validateFoundryEndpoint("https://api.openwhispr.com/v1"));
    assert.throws(() => validateFoundryEndpoint("https://openwhispr.com/openai/v1"));
    validateFoundryEndpoint("https://x.openai.azure.com/openai/v1");
  } finally {
    if (saved !== undefined) globalThis.__OW_UPSTREAM_MODE = saved;
  }
});

test("createFoundryModel validates the endpoint itself", () => {
  assert.throws(() =>
    createFoundryModel("m", "k", {
      foundryBaseUrl: "http://169.254.169.254/v1",
      foundryWireApi: "chat",
    })
  );
});

test("foundry is routed through getEnterpriseAIModel", async () => {
  stubFetch();
  const model = await getEnterpriseAIModel("foundry", "dep", "k", {
    foundryBaseUrl: "https://x.openai.azure.com",
    foundryWireApi: "responses",
  });
  const request = await call(model);
  assert.equal(request.url, "https://x.openai.azure.com/openai/v1/responses");
});

test("foundry is an enterprise provider and keeps its config fields", () => {
  assert.equal(isEnterpriseProvider("foundry"), true);
  const picked = pickEnterpriseConfig({
    foundryBaseUrl: "https://x.openai.azure.com",
    foundryWireApi: "chat",
    apiKey: "renderer-key",
  });
  assert.equal(picked.foundryBaseUrl, "https://x.openai.azure.com");
  assert.equal(picked.foundryWireApi, "chat");
  assert.ok(!("apiKey" in picked));
});

function httpError(status, body) {
  return Object.assign(new Error("Bad Request"), {
    name: "AI_APICallError",
    statusCode: status,
    responseBody: JSON.stringify(body),
  });
}

test("context_length_exceeded maps to CONTEXT_TOO_LARGE", () => {
  const mapped = mapEnterpriseError(
    "foundry",
    httpError(400, {
      error: { code: "context_length_exceeded", message: "This model's maximum context length" },
    }),
    { foundryBaseUrl: "https://x.openai.azure.com" }
  );
  assert.equal(mapped.code, "CONTEXT_TOO_LARGE");
  assert.equal(mapped.messageKey, "providerErrors.contextTooLarge");
  assert.ok(mapped.message);
});

test("a content filter refusal maps to PROVIDER_CONTENT_FILTERED", () => {
  const mapped = mapEnterpriseError(
    "foundry",
    httpError(400, { error: { code: "content_filter", message: "filtered" } }),
    { foundryBaseUrl: "https://api.example.com/v1" }
  );
  assert.equal(mapped.code, "PROVIDER_CONTENT_FILTERED");
  assert.equal(mapped.messageKey, "providerErrors.selfHosted.contentFiltered");
});

test("foundry errors are classified by status, not by Azure heuristics", () => {
  const mapped = mapEnterpriseError("foundry", httpError(401, { error: { message: "nope" } }), {
    foundryBaseUrl: "https://x.openai.azure.com",
  });
  assert.equal(mapped.code, "PROVIDER_AUTH_FAILED");
  assert.equal(mapped.messageKey, "providerErrors.authFailed");
});

test("the renderer-supplied apiKey, base URL and wire API are ignored for foundry", async () => {
  const env = {
    getFoundryApiKey: () => "stored-key",
    getFoundryConfig: () => ({ baseUrl: "https://x.openai.azure.com/openai/v1", wireApi: "chat" }),
  };
  assert.deepEqual(getFoundryCredential(env), { apiKey: "stored-key" });
  const runtime = resolveFoundryRuntime(env, "dep", {
    apiKey: "renderer-key",
    foundryBaseUrl: "https://evil.example.com/v1",
    foundryWireApi: "responses",
    managedContext: { accountId: "a" },
  });
  assert.equal(runtime.apiKey, "stored-key");
  assert.equal(runtime.provider, "foundry");
  assert.equal(runtime.model, "dep");
  assert.equal(runtime.enterprise.foundryBaseUrl, "https://x.openai.azure.com/openai/v1");
  assert.equal(runtime.enterprise.foundryWireApi, "chat");

  stubFetch();
  const model = createFoundryModel(runtime.model, runtime.apiKey, runtime.enterprise);
  const request = await call(model);
  assert.ok(request.url.startsWith("https://x.openai.azure.com/"));
  assert.equal(new Headers(request.init.headers).get("authorization"), "Bearer stored-key");
});

function memoryEnv(initial = {}) {
  const state = { baseUrl: "", wireApi: "responses", key: "k", ...initial };
  return {
    state,
    getFoundryConfig: () => ({ baseUrl: state.baseUrl, wireApi: state.wireApi }),
    saveFoundryConfig: ({ baseUrl, wireApi }) => Object.assign(state, { baseUrl, wireApi }),
    getFoundryApiKey: () => state.key,
    clearKey: () => {
      state.key = "";
    },
  };
}

test("saving the config normalizes and validates it", () => {
  const env = memoryEnv();
  const result = applyFoundryConfig(
    env,
    {
      baseUrl: "https://x.openai.azure.com/openai/deployments/g/chat/completions?api-version=1",
      wireApi: "chat",
    },
    env.clearKey
  );
  assert.equal(result.baseUrl, "https://x.openai.azure.com/openai/v1");
  assert.equal(env.state.wireApi, "chat");
  assert.equal(env.state.key, "k", "first save keeps the key");
  assert.throws(() =>
    applyFoundryConfig(env, { baseUrl: "http://169.254.169.254/v1" }, env.clearKey)
  );
  assert.throws(() =>
    applyFoundryConfig(env, { baseUrl: "http://api.example.com/v1" }, env.clearKey)
  );
  assert.equal(
    env.state.baseUrl,
    "https://x.openai.azure.com/openai/v1",
    "a refused save changes nothing"
  );
});

test("changing the base URL origin clears the stored key; same origin keeps it", () => {
  const env = memoryEnv({ baseUrl: "https://x.openai.azure.com/openai/v1" });
  const same = applyFoundryConfig(
    env,
    { baseUrl: "https://x.openai.azure.com", wireApi: "chat" },
    env.clearKey
  );
  assert.equal(same.keyCleared, false);
  assert.equal(env.state.key, "k");
  const moved = applyFoundryConfig(env, { baseUrl: "https://api.example.com/v1" }, env.clearKey);
  assert.equal(moved.keyCleared, true);
  assert.equal(env.state.key, "");
});

test("isAzureHost matches the Azure suffixes only", () => {
  assert.equal(isAzureHost("x.openai.azure.com"), true);
  assert.equal(isAzureHost("X.Services.AI.Azure.com"), true);
  assert.equal(isAzureHost("openai.azure.com.evil.example"), false);
});

test("metadata and link-local hosts are refused however they are written", () => {
  for (const url of [
    "http://[::ffff:169.254.169.254]/v1",
    "https://[::ffff:169.254.169.254]/v1",
    "https://[::ffff:a9fe:a9fe]/v1",
    "https://[::169.254.169.254]/v1",
    "https://[::a9fe:a9fe]/v1",
    "https://[0:0:0:0:0:ffff:a9fe:a9fe]/v1",
    "https://[64:ff9b::a9fe:a9fe]/v1",
    "https://2852039166/v1",
    "https://0xa9fea9fe/v1",
    "https://0251.0376.0251.0376/v1",
    "https://169.254.1.1/v1",
    "https://[fe80::1]/v1",
    "https://[febf::1]/v1",
    "https://[fd00:ec2::254]/v1",
    "https://[FD00:EC2:0:0:0:0:0:254]/v1",
  ]) {
    assert.throws(() => validateFoundryEndpoint(url), /not allowed/, url);
  }
  // Ordinary mapped/public addresses are not caught by accident.
  validateFoundryEndpoint("https://[::ffff:8.8.8.8]/v1");
  validateFoundryEndpoint("http://[::ffff:192.168.1.5]/v1");
});

function responsesModel(name, baseUrl = "https://x.openai.azure.com") {
  return createFoundryModel(name, "k", { foundryBaseUrl: baseUrl, foundryWireApi: "responses" });
}

test("a 400 about encrypted_content retries once without include and remembers it", async () => {
  calls = [];
  let mode = "reject";
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body });
    if (mode === "reject" && body.include) {
      return new Response(
        JSON.stringify({
          error: { message: "Unknown parameter: include reasoning.encrypted_content" },
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  const model = responsesModel("retry-dep");
  try {
    await model.doGenerate({ prompt });
  } catch {}
  assert.equal(calls.length, 2);
  assert.ok(calls[0].body.include);
  assert.equal(calls[0].body.store, false);
  assert.ok(!("include" in calls[1].body));
  assert.equal(calls[1].body.store, false);

  calls.length = 0;
  try {
    await model.doGenerate({ prompt });
  } catch {}
  assert.equal(calls.length, 1, "remembered: no failing attempt first");
  assert.ok(!("include" in calls[0].body));

  calls.length = 0;
  try {
    await responsesModel("other-dep").doGenerate({ prompt });
  } catch {}
  assert.ok(calls[0].body.include, "other models still try include");
});

test("an unrelated 400 is not retried and nothing is remembered", async () => {
  calls = [];
  global.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ error: { message: "bad prompt" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  };
  const model = responsesModel("plain-400-dep");
  try {
    await model.doGenerate({ prompt });
  } catch {}
  try {
    await model.doGenerate({ prompt });
  } catch {}
  assert.equal(calls.length, 2);
  assert.ok(calls.every((body) => body.include));
});

test("streaming also retries without include", async () => {
  calls = [];
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.include) {
      return new Response(JSON.stringify({ error: { message: "include not supported" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("", { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  try {
    const { stream } = await responsesModel("stream-dep").doStream({ prompt });
    const reader = stream.getReader();
    while (!(await reader.read()).done);
  } catch {}
  assert.equal(calls.length, 2);
  assert.ok(!("include" in calls[1]));
});

test("shared classifier: BYOK status handling is unchanged outside the new 400 codes", () => {
  const { providerHttpError } = require("../../src/helpers/providerHttpErrors.js");
  const code = (status, body) =>
    providerHttpError({ provider: "OpenAI", status, body, surface: "llm" }).code;
  assert.equal(code(401, "x"), "PROVIDER_AUTH_FAILED");
  assert.equal(code(429, "rate"), "PROVIDER_RATE_LIMITED");
  assert.equal(code(404, "model_not_found"), "PROVIDER_MODEL_NOT_FOUND");
  assert.equal(code(400, "model does not exist"), "PROVIDER_MODEL_NOT_FOUND");
  assert.equal(code(400, "something else"), "PROVIDER_BAD_REQUEST");
  assert.equal(code(413, "big"), "PROVIDER_PAYLOAD_TOO_LARGE");
  assert.equal(code(503, "down"), "PROVIDER_UNAVAILABLE");
  assert.equal(code(400, '{"error":{"code":"context_length_exceeded"}}'), "CONTEXT_TOO_LARGE");
  assert.equal(code(400, '{"error":{"code":"content_filter"}}'), "PROVIDER_CONTENT_FILTERED");
  // Only 400 is reinterpreted: a 500 mentioning the words stays an outage.
  assert.equal(code(500, "context_length_exceeded"), "PROVIDER_UNAVAILABLE");
  assert.equal(code(429, "content_filter"), "PROVIDER_RATE_LIMITED");
});
