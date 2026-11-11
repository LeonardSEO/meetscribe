// Every translation names the app Meetscribe. Translation keys keep their upstream
// names (they are identifiers, not copy); only the values are product text.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const LOCALES = path.join(__dirname, "../../src/locales");
const LANGS = ["ar", "de", "en", "es", "fr", "it", "ja", "pt", "ru", "zh-CN", "zh-TW"];
// Domains, links and the NixOS module option of the real OpenWhispr project, used only
// by upstream-only copy (Linux is out of scope for this app).
const ALLOWED_UPSTREAM_REFERENCES =
  /openwhispr\.com|github\.com\/OpenWhispr|programs\.openwhispr\.\w+/gi;

function readTranslations(lang) {
  return JSON.parse(fs.readFileSync(path.join(LOCALES, lang, "translation.json"), "utf8"));
}

function flatten(node, prefix = "", out = []) {
  for (const [key, value] of Object.entries(node)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, dotted, out);
    else if (typeof value === "string") out.push([dotted, value]);
  }
  return out;
}

function get(node, dotted) {
  return dotted.split(".").reduce((current, key) => current?.[key], node);
}

test("no translation value names OpenWhispr", () => {
  const offenders = [];
  for (const lang of LANGS) {
    for (const [key, value] of flatten(readTranslations(lang))) {
      if (/openwhispr/i.test(value.replace(ALLOWED_UPSTREAM_REFERENCES, ""))) {
        offenders.push(`${lang}:${key}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("brand is spelled Meetscribe", () => {
  const offenders = [];
  for (const lang of LANGS) {
    for (const [key, value] of flatten(readTranslations(lang))) {
      if (/MeetScribe|Meet Scribe|\bmeetscribe\b/.test(value.replace(/meetscribe:\/\//g, ""))) {
        offenders.push(`${lang}:${key}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("English copy uses the right article before Meetscribe", () => {
  const offenders = flatten(readTranslations("en"))
    .filter(([, value]) => /\b[Aa]n Meetscribe\b/.test(value))
    .map(([key]) => key);
  assert.deepEqual(offenders, []);
});

test("translation keys keep their upstream names", () => {
  assert.equal(typeof get(readTranslations("en"), "notes.upload.openwhisprCloud"), "string");
});
