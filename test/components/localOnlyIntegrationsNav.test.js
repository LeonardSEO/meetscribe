const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const fs = require("node:fs");
const path = require("node:path");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

async function render(t, localOnly) {
  const saved = globalThis.__OW_UPSTREAM_MODE;
  if (localOnly) delete globalThis.__OW_UPSTREAM_MODE;
  else globalThis.__OW_UPSTREAM_MODE = true;
  t.after(() => {
    if (saved === undefined) delete globalThis.__OW_UPSTREAM_MODE;
    else globalThis.__OW_UPSTREAM_MODE = saved;
  });
  installBrowserGlobals(t);
  const vite = await createRendererServer(t, { cachePrefix: "ow-integrations-nav-" });
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
  const { IntegrationsNav } = await vite.ssrLoadModule(
    "/components/integrations/IntegrationsNav.tsx"
  );
  const { INTEGRATIONS_SECTION_GROUPS } = await vite.ssrLoadModule(
    "/components/integrations/integrationsSections.ts"
  );
  const sections = INTEGRATIONS_SECTION_GROUPS.flatMap((g) => g.sections ?? g.items ?? []);
  return renderToStaticMarkup(
    React.createElement(IntegrationsNav, {
      active: sections[0],
      meta: Object.fromEntries(sections.map((s) => [s, null])),
      onSelect() {},
    })
  );
}

test("the docs button is hidden in local-only", async (t) => {
  assert.doesNotMatch(await render(t, true), /Integration docs/);
});

test("the docs button stays in upstream mode", async (t) => {
  assert.match(await render(t, false), /Integration docs/);
});
