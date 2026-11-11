const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/components/settings/foundryForm.ts");
const valid = {
  baseUrl: "https://x.openai.azure.com/openai/v1",
  model: "gpt-x",
  maxInputTokens: "100000",
  maxOutputTokens: "8000",
};

test("a complete form has no errors", async () => {
  const { validateFoundryForm } = await load();
  assert.deepEqual(validateFoundryForm(valid), {});
});

test("each error points at its own field", async () => {
  const { validateFoundryForm } = await load();
  const errors = validateFoundryForm({
    baseUrl: "ftp://x",
    model: " ",
    maxInputTokens: "0",
    maxOutputTokens: "12.5",
  });
  assert.deepEqual(Object.keys(errors).sort(), [
    "baseUrl",
    "maxInputTokens",
    "maxOutputTokens",
    "model",
  ]);
  assert.equal(validateFoundryForm({ ...valid, baseUrl: "" }).baseUrl, "foundry.baseUrl.required");
});

test("token limits are whole numbers above zero", async () => {
  const { parseTokenLimit } = await load();
  assert.equal(parseTokenLimit(" 8000 "), 8000);
  for (const bad of ["", "-1", "0", "1e3", "abc", "9".repeat(20)])
    assert.equal(parseTokenLimit(bad), null, bad);
});

test("the IPC prefix is stripped from a handler's message", async () => {
  const { ipcErrorMessage } = await load();
  assert.equal(
    ipcErrorMessage(
      new Error("Error invoking remote method 'save-foundry-config': Error: Refused host")
    ),
    "Refused host"
  );
});

test("a failed connection test points at the field it concerns", async () => {
  const { fieldForTestFailure } = await load();
  assert.equal(fieldForTestFailure("PROVIDER_AUTH_FAILED"), "apiKey");
  assert.equal(fieldForTestFailure("API_KEY_MISSING"), "apiKey");
  assert.equal(fieldForTestFailure("PROVIDER_MODEL_NOT_FOUND"), "model");
  assert.equal(fieldForTestFailure("PROVIDER_UNREACHABLE"), "baseUrl");
  assert.equal(fieldForTestFailure("PROVIDER_TIMEOUT"), "baseUrl");
  assert.equal(fieldForTestFailure("PROVIDER_RATE_LIMITED"), null);
  assert.equal(fieldForTestFailure(undefined), null);
});

test("only Azure hosts require an API key", async () => {
  const { foundryKeyRequired } = await load();
  assert.equal(foundryKeyRequired("https://x.openai.azure.com/openai/v1"), true);
  assert.equal(foundryKeyRequired("https://p.services.ai.azure.com/api/projects/p"), true);
  assert.equal(foundryKeyRequired("http://localhost:11434/v1"), false);
  assert.equal(foundryKeyRequired("https://llm.example.com/v1"), false);
  assert.equal(foundryKeyRequired("not a url"), true);
});
