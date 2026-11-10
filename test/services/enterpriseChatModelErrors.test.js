const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "./enterpriseSettings") {
    return { getEnterpriseCallSettings: () => ({}) };
  }
  return originalLoad.call(this, request, parent, isMain);
};
test.after(() => {
  Module._load = originalLoad;
});

test("a stream error part keeps code, messageKey and messageParams on the Error", async () => {
  const { createEnterpriseChatModel } = require("../../src/services/ai/enterpriseChatModel.ts");
  let listener;
  globalThis.window = {
    electronAPI: {
      onEnterpriseStreamPart: (cb) => {
        listener = cb;
        return () => {};
      },
      enterpriseStreamStart: async ({ streamId }) => {
        queueMicrotask(() =>
          listener({
            streamId,
            error: "too long",
            code: "CONTEXT_TOO_LARGE",
            messageKey: "providerErrors.contextTooLarge",
            messageParams: { provider: "Azure AI Foundry" },
          })
        );
        return { success: false, error: "too long", code: "CONTEXT_TOO_LARGE" };
      },
      enterpriseStreamCancel: async () => {},
    },
  };
  const model = createEnterpriseChatModel("foundry", "dep");
  const { stream } = await model.doStream({ prompt: [] });
  await assert.rejects(
    async () => {
      const reader = stream.getReader();
      for (;;) if ((await reader.read()).done) break;
    },
    (error) => {
      assert.equal(error.code, "CONTEXT_TOO_LARGE");
      assert.equal(error.messageKey, "providerErrors.contextTooLarge");
      assert.deepEqual(error.messageParams, { provider: "Azure AI Foundry" });
      return true;
    }
  );
});
