const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeFoundryBaseUrl,
  validateFoundryEndpoint,
  createFoundryModel,
  getFoundryCredential,
  resolveFoundryRuntime,
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

test("the renderer-supplied apiKey is ignored for foundry", async () => {
  const env = { getFoundryApiKey: () => "stored-key" };
  assert.deepEqual(getFoundryCredential(env), { apiKey: "stored-key" });
  const runtime = resolveFoundryRuntime(env, "dep", {
    apiKey: "renderer-key",
    foundryBaseUrl: "https://x.openai.azure.com",
    foundryWireApi: "responses",
    managedContext: { accountId: "a" },
  });
  assert.equal(runtime.apiKey, "stored-key");
  assert.equal(runtime.provider, "foundry");
  assert.equal(runtime.model, "dep");
  assert.equal(runtime.enterprise.foundryBaseUrl, "https://x.openai.azure.com");

  stubFetch();
  const model = createFoundryModel(runtime.model, runtime.apiKey, runtime.enterprise);
  const request = await call(model);
  assert.equal(new Headers(request.init.headers).get("authorization"), "Bearer stored-key");
});
