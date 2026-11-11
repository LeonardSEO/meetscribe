const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const fs = require("node:fs");
const path = require("node:path");
const { useLocalOnly } = require("../setup/localOnly.js");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

useLocalOnly();

test("local-only settings show the cleanup, assistant and translation switches", async (t) => {
  installBrowserGlobals(t);
  const vite = await createRendererServer(t, { cachePrefix: "ow-local-only-toggles-" });
  const [{ default: i18next }, { initReactI18next }] = await Promise.all([
    vite.ssrLoadModule("i18next"),
    vite.ssrLoadModule("react-i18next"),
  ]);
  if (!i18next.isInitialized) {
    const translation = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../src/locales/en/translation.json"), "utf8")
    );
    await i18next.use(initReactI18next).init({
      lng: "en",
      resources: { en: { translation } },
      interpolation: { escapeValue: false },
    });
  }
  const { default: Toggles } = await vite.ssrLoadModule(
    "/components/settings/LocalOnlyAiToggles.tsx"
  );
  const markup = renderToStaticMarkup(
    React.createElement(Toggles, { useCleanupModel: false, setUseCleanupModel() {} })
  );
  assert.equal((markup.match(/role="switch"/g) || []).length, 3);
  assert.ok(markup.includes("Enable text cleanup"));
});

test("Settings renders the switches next to Foundry in local-only", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../../src/components/SettingsPage.tsx"),
    "utf8"
  );
  assert.match(src, /<LocalOnlyAiToggles[\s\S]*?<FoundrySection \/>/);
});
