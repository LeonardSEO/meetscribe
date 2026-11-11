# Meetscribe-rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overal waar de gebruiker (of het taalmodel namens de gebruiker) de naam van de app ziet, staat "Meetscribe" in plaats van "OpenWhispr"; ook de app-identiteit (bundle-ID, datamap, protocol) heet Meetscribe. Logo, iconen, kleuren en lettertypen blijven ongewijzigd.

**Architecture:** Vier lagen, elk met eigen test: (1) vertaalwaarden in alle 11 talen plus een guard-test die terugval voorkomt; (2) app-identiteit in `electron-builder.json`/`main.js` met een eenmalige migratie van de oude datamap; (3) hardcoded teksten in code, inclusief de standaard agentnaam met migratie; (4) native helpers, installer en documentatie. De map `openwhispr-mobile/` gaat eruit.

**Tech Stack:** Electron 41, React 19/TypeScript, i18next, `node --test` (via `npm test`, met `test/setup/upstreamMode.js`), electron-builder.

**Spec:** geen apart document; de besluiten uit het gesprek van 2026-11-11 staan hieronder in Global Constraints.

## Global Constraints

- Productnaam exact: `Meetscribe` (hoofdletter M, rest klein). Nooit "MeetScribe" of "meetScribe" in zichtbare tekst.
- Nieuwe identiteit: appId / Windows AppUserModelId `com.meetscribe.app`; protocol `meetscribe` (dev: `meetscribe-dev`, staging: `meetscribe-staging`); kanaalmappen `Meetscribe-<channel>`; productie-datamap `<appData>/Meetscribe`.
- Logo, iconbestanden (`src/assets/icon.*`, `CFBundleIconName`), kleuren en lettertypen worden **niet** aangeraakt.
- **Bewust niet hernoemd** (intern, onzichtbaar of naar een echte externe OpenWhispr-dienst): modelcache `~/.cache/openwhispr` en `OPENWHISPR_CACHE_ROOT`; alle `OPENWHISPR_*`/`VITE_OPENWHISPR_*` env-variabelen; keychain-service `SERVICE = "OpenWhispr"` in `src/helpers/secretCrypto.js` (zodat de Foundry-key leesbaar blijft); `~/.openwhispr/cli-bridge.json`; D-Bus-namen `com.openwhispr.App`; localStorage-sleutels, IPC-kanalen, i18n-**sleutels** (bv. `openwhisprCloud`), code-identifiers (`isOpenWhisprCloud`, `__OW_UPSTREAM_MODE`); URL's en domeinen (`openwhispr.com`, `github.com/OpenWhispr/...`); `src/helpers/blockedHosts.js`; de Azure-signing-velden en de upstream release-workflows (`release.yml`, `build-and-notarize.yml`, `update-nix.yml`, `update-winget.yml`), `flake.nix`/`nix/` (Linux valt buiten scope); historische documenten onder `docs/superpowers/` en `docs/validation/`.
- `NOTICE` en de fork-vermelding in `README.md` blijven OpenWhispr noemen: dat is de MIT-attributie.
- Gedrag dat alleen upstream bereikbaar is, wordt via `isLocalOnly()` afgeschermd zodat de bestaande upstream-tests hun gedrag blijven vastpinnen; nieuwe local-only tests zetten `globalThis.__OW_UPSTREAM_MODE` uit.
- Elke nieuwe UI-tekst krijgt een sleutel in alle 11 talen (`ar de en es fr it ja pt ru zh-CN zh-TW`).

## Review Focus

1. **Bestaande gebruiker met data in `OpenWhispr/`** start Meetscribe: notities, notulen, instellingen (localStorage) en audio moeten er gewoon zijn → migratietest in Task 3.
2. **Beide mappen bestaan al** (bv. na een eerdere dev-run): de nieuwe map wordt nooit overschreven of samengevoegd → test `skips when target exists` in Task 3.
3. **Oude OpenWhispr-app draait nog** tijdens de eerste Meetscribe-start: niet verplaatsen onder een draaiend proces → test `skips while legacy instance holds SingletonLock` in Task 3.
4. **Opgeslagen agentnaam "OpenWhispr"** (de oude standaard): wordt "Meetscribe", en het woordenboek volgt mee; een zelfgekozen naam blijft staan → test in Task 4.
5. **Keychain-toegang na nieuwe bundle-ID**: macOS vraagt eenmalig toestemming; wordt die geweigerd, dan vraagt Instellingen om de Foundry-key opnieuw en crasht de app niet → handmatige check in `docs/manual-acceptance.md` (Task 6), want keychain-ACL's zijn niet unit-testbaar.

---

### Task 1: Mobiele app verwijderen

**Files:**
- Delete: `openwhispr-mobile/` (hele map)
- Modify: `.gitattributes` (regel 1), `.github/dependabot.yml` (blok met `directory: "/openwhispr-mobile"`), `.github/scripts/ci-scope.cjs` (mobiele tak in `classifyPaths`), `.github/scripts/ci-scope.test.cjs` (mobiele cases), `.github/CONTRIBUTING.md` (mobiele paragraaf en tabelrij), elke workflow in `.github/workflows/` die alleen de mobiele app bouwt (vind met `git grep -l "openwhispr-mobile\|mobile" .github/workflows`)

**Interfaces:** geen.

- [ ] **Step 1:** `git rm -r openwhispr-mobile` en verwijder de verwijzingen hierboven. Laat `classifyPaths` een geldig resultaat teruggeven zonder mobiele scope; pas de verwachte objecten in `ci-scope.test.cjs` daarop aan.
- [ ] **Step 2:** Run `node --test .github/scripts/ci-scope.test.cjs` → PASS. Run `git grep -n "openwhispr-mobile"` → geen uitvoer.
- [ ] **Step 3:** Commit `chore: remove the mobile app`.

---

### Task 2: Vertalingen → Meetscribe (alle 11 talen)

**Files:**
- Create: `test/locales/brandName.test.js`
- Modify: `src/locales/*/translation.json` (alleen **waarden**)
- Modify: tests die Engelse UI-tekst met "OpenWhispr" vergelijken (gevonden in Step 5)

**Interfaces:**
- Produces: de regel "geen vertaalwaarde bevat OpenWhispr, behalve in een URL/domein" — Task 4 en 5 leunen erop.

- [ ] **Step 1: Schrijf de falende test** `test/locales/brandName.test.js`:

```js
// Elke vertaalwaarde in elke taal noemt de app Meetscribe.
// Toegestaan: domeinen/URL's van de echte OpenWhispr-dienst (upstream-only tekst).
const ALLOWED = /openwhispr\.com|github\.com\/OpenWhispr/gi;
test("no translation value names OpenWhispr", () => {
  for (const lang of LANGS) {
    for (const [key, value] of flatten(readJson(`src/locales/${lang}/translation.json`))) {
      assert.doesNotMatch(value.replace(ALLOWED, ""), /openwhispr/i, `${lang}:${key}`);
    }
  }
});
test("brand is spelled Meetscribe", () => {
  for (const lang of LANGS) {
    for (const [key, value] of flatten(readJson(`src/locales/${lang}/translation.json`))) {
      // alleen "Meetscribe" en het protocol "meetscribe://" zijn goed
      assert.doesNotMatch(value.replace(/meetscribe:\/\//g, ""), /MeetScribe|Meet Scribe|\bmeetscribe\b/, `${lang}:${key}`);
    }
  }
});
test("translation keys keep their upstream names", () => {
  assert.equal(typeof get(readJson("src/locales/en/translation.json"), "notes.upload.openwhisprCloud"), "string");
});
```
`LANGS` is de lijst uit Global Constraints; `flatten` loopt recursief over objecten en geeft `[dotted.key, string]`.

- [ ] **Step 2:** Run `node --import tsx --test test/locales/brandName.test.js` → FAIL, ~200 meldingen per taal.
- [ ] **Step 3: Vervang in waarden.** Eenmalig script in de scratchpad (niet committen) dat per taal de JSON parst, alleen string-waarden aanpast en met dezelfde inspringing (2 spaties) en afsluitende newline terugschrijft. Volgorde van vervangingen:
  1. `openwhispr://` → `meetscribe://`
  2. Laat staan: elk voorkomen binnen `openwhispr.com` of `github.com/OpenWhispr`.
  3. Overige `OpenWhispr` → `Meetscribe` (ook in "OpenWhispr Cloud", "OpenWhispr Assistant", "Hey OpenWhispr").
  4. Een kale kleine `openwhispr` als merknaam → `Meetscribe`; toon de 2–3 treffers vóór vervangen en beslis per geval (merknaam vs. sleutel/URL-fragment).
  Controleer daarna met `git diff --stat src/locales` dat alleen translation.json-bestanden wijzigen en `git diff src/locales/en/translation.json | grep '^[-+]\s*"' | grep -v ':'` leeg is (geen sleutelwijzigingen).
- [ ] **Step 4:** Run de test uit Step 1 en `node --import tsx --test test/locales/translationCoverage.test.js` → PASS.
- [ ] **Step 5:** Run `npm test 2>&1 | grep -B2 -A8 "OpenWhispr" | head -200`. Werk elke falende assertie bij die **UI-tekst uit de vertalingen** verwacht (vervang de verwachte "OpenWhispr" door "Meetscribe"). Laat assertions over identifiers, URL's en hardcoded prompts (Task 4) ongemoeid.
- [ ] **Step 6:** Run `npm test` → zelfde aantal fails als op `main` vóór deze taak (noteer dat getal vooraf met `git stash; npm test | tail -5; git stash pop`), nul nieuwe.
- [ ] **Step 7:** Commit `feat: name the app Meetscribe in every language`.

---

### Task 3: App-identiteit en datamap-migratie

**Files:**
- Create: `src/helpers/legacyUserDataMigration.js`, `test/helpers/legacyUserDataMigration.test.js`
- Modify: `electron-builder.json` (`appId`, `productName`, `protocols[0].name`/`schemes`, `mac.extendInfo` usage-teksten r.173–177, `nsis` `title` r.271, `publish` `owner`/`repo` r.280–281 → `LeonardSEO`/`meetscribe`), `electron-builder.unsigned-win.json` (zelfde velden als die erin staan), `package.json` (`name` → `meetscribe`, `description` → "Lokale vergaderassistent: opnemen, transcriberen en notuleren zonder account", `author.name` → `Meetscribe`, `author.email` verwijderen), `main.js` (r.48–53, r.92, r.274–275, r.1169), `src/index.html` (`<title>`), `src/AppRouter.jsx:272` (`aria-label`), `src/updater.js` r.39–40

**Interfaces:**
- Produces: `migrateLegacyUserData({ appDataDir: string, targetName: string, legacyName: string, fs?: typeof import("fs"), log?: (msg: string, meta?: object) => void }): "migrated" | "copied" | "skipped-target-exists" | "skipped-no-legacy" | "skipped-legacy-running" | "failed"` (CommonJS, `module.exports = { migrateLegacyUserData }`).

- [ ] **Step 1: Schrijf de falende tests** in `test/helpers/legacyUserDataMigration.test.js` met een echte tijdelijke map (`fs.mkdtempSync(os.tmpdir())`):
  - `moves legacy dir when target is missing`: `OpenWhispr/notes.db` bestaat → resultaat `"migrated"`, `Meetscribe/notes.db` bestaat, `OpenWhispr/` bestaat niet meer.
  - `skips when target exists`: beide mappen bestaan → `"skipped-target-exists"`, beide inhouden ongewijzigd.
  - `skips when there is no legacy dir` → `"skipped-no-legacy"`, geen `Meetscribe/` aangemaakt.
  - `skips while legacy instance holds SingletonLock`: `OpenWhispr/SingletonLock` bestaat (gewoon bestand volstaat) → `"skipped-legacy-running"`, niets verplaatst.
  - `copies when rename fails`: een `fs`-stub waarvan `renameSync` `EXDEV` gooit en de rest naar echte `fs` doorgeeft → `"copied"`, `Meetscribe/notes.db` bestaat, `OpenWhispr/` blijft staan.
  - `never throws`: een `fs`-stub waarvan ook `cpSync` gooit → `"failed"` en een half gekopieerde `Meetscribe/` is weer weg.
- [ ] **Step 2:** Run `node --test test/helpers/legacyUserDataMigration.test.js` → FAIL (module bestaat niet).
- [ ] **Step 3: Implementeer** `migrateLegacyUserData` in `src/helpers/legacyUserDataMigration.js`. Volgorde: target bestaat → skip; legacy ontbreekt → skip; `SingletonLock` (macOS/Linux) of `lockfile` (Windows) in legacy → skip; `renameSync`; bij fout `cpSync(legacy, target, { recursive: true, errorOnExist: true })`; bij fout daarvan `rmSync(target, { recursive: true, force: true })` en `"failed"`. Geen Electron-import, zodat het testbaar is.
- [ ] **Step 4:** Run de test → PASS.
- [ ] **Step 5: Koppel aan `main.js`.** Wijzig `DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL` naar `meetscribe-dev`/`meetscribe-staging`/`meetscribe`, `BASE_WINDOWS_APP_ID` naar `com.meetscribe.app`, de kanaalmap naar `` `Meetscribe-${APP_CHANNEL}` `` en `app.setName("Meetscribe")` (r.274–275, ook de vergelijking). Roep **vóór** `require("dotenv").config(...)` (r.~99) en dus vóór elke `getPath("userData")`-lezing aan:
  - productie: `migrateLegacyUserData({ appDataDir: app.getPath("appData"), targetName: path.basename(app.getPath("userData")), legacyName: "OpenWhispr", log })`
  - andere kanalen: `targetName: \`Meetscribe-${APP_CHANNEL}\``, `legacyName: \`OpenWhispr-${APP_CHANNEL}\``
  Log het resultaat via `debugLogger.info` met alleen de resultaatcode, geen paden. Vervang r.1169 `OpenWhispr sign-in complete.` door `Meetscribe sign-in complete.`
- [ ] **Step 6: Overige identiteitsbestanden** zoals onder Files. macOS usage-teksten: vervang alleen "OpenWhispr" door "Meetscribe", rest van de zin blijft. Laat `CFBundleIconName`, `certificateProfileName`, `codeSigningAccountName` staan.
- [ ] **Step 7:** Run `npm test` → geen nieuwe fails t.o.v. Task 2; tests die `openwhispr://` of `com.gizmolabs.openwhispr` als **app-identiteit** verwachten bijwerken naar de nieuwe waarden. Run `npm run typecheck` → PASS.
- [ ] **Step 8:** Run `npm run build:local:mac`; controleer `defaults read "$(ls -d dist/mac-arm64/Meetscribe.app)/Contents/Info.plist" CFBundleIdentifier` → `com.meetscribe.app`, en dat `CFBundleURLSchemes` `meetscribe` bevat.
- [ ] **Step 9:** Commit `feat: Meetscribe app identity with one-time data folder migration`.

---

### Task 4: Hardcoded teksten in de code en de agentnaam

**Files:**
- Create: `test/utils/agentNameMigration.test.js`, `test/config/meetscribePromptCopy.test.js`
- Modify: `src/utils/agentName.ts`, de plek waar `ensureAgentNameInDictionary()` bij het opstarten wordt aangeroepen (vind met `git grep -n ensureAgentNameInDictionary src`), `src/services/tools/index.ts:61`, `src/config/prompts.ts:42,52`, `src/config/agentCapabilities.ts:191,197,203`, en de string-literals in de bestanden uit de lijst hieronder

**Interfaces:**
- Consumes: Task 2-regel (UI-tekst via vertalingen is al Meetscribe).
- Produces: `migrateLegacyAgentName(): void` geëxporteerd uit `src/utils/agentName.ts`; `DEFAULT_AGENT_NAME = "Meetscribe"`.

- [ ] **Step 1: Falende tests.**
  - `test/utils/agentNameMigration.test.js` (localStorage-stub, settings-store zoals bestaande agentName-tests in `test/` dat doen): opgeslagen `"OpenWhispr"` → na `migrateLegacyAgentName()` is `getAgentName() === "Meetscribe"` en het eigen woordenboek bevat "Meetscribe" en niet langer "OpenWhispr"; opgeslagen `"Jarvis"` → blijft `"Jarvis"`; niets opgeslagen → `getAgentName() === "Meetscribe"` en er wordt niets weggeschreven; tweede aanroep is een no-op.
  - `test/config/meetscribePromptCopy.test.js` (local-only: `delete globalThis.__OW_UPSTREAM_MODE` in `before`, terugzetten in `after`): `getAgentSystemPrompt(...)` met de standaardopties bevat geen `/openwhispr/i`; de tool-registry uit `src/services/tools/index.ts` bevat geen `search_openwhispr_help`, `read_openwhispr_help` of `get_openwhispr_context`; elke tekst die `resolveUnavailableCapabilities` teruggeeft bevat geen `/openwhispr/i`.
- [ ] **Step 2:** Run beide → FAIL.
- [ ] **Step 3: Implementeer.**
  - `agentName.ts`: `DEFAULT_AGENT_NAME = "Meetscribe"`; `migrateLegacyAgentName()` roept `setAgentName("Meetscribe")` aan als de opgeslagen waarde exact `"OpenWhispr"` is (dat vervangt het woordenboekwoord via `syncAgentNameToDictionary`). Roep hem aan direct vóór de bestaande `ensureAgentNameInDictionary()`-aanroep.
  - `tools/index.ts:61`: `if (!isLocalOnly() && settings.productHelpEnabled !== false)` — de helptools zoeken in OpenWhispr's eigen documentatie, die local-only geblokkeerd is.
  - `prompts.ts` r.42/52 en `agentCapabilities.ts` r.191/197/203: in local-only de zinnen over OpenWhispr-documentatie, -plannen en -aanmelding weglaten (via `isLocalOnly()`); de upstream-tekst blijft letterlijk zodat `test/config/agentSystemPrompt.test.js` en `agentCapabilities.test.js` ongewijzigd slagen.
- [ ] **Step 4: Overige string-literals.** Vervang "OpenWhispr" door "Meetscribe" in tekst die een gebruiker of het model kan zien:
  `src/AppRouter.jsx` (al in Task 3), `src/components/DictionaryEmptyIllustration.tsx:78`, `src/components/onboarding/PermissionGuideOverlay.tsx:84`, `src/components/LeaderboardShareDialog.tsx:58,77,120`, `src/components/SettingsPage.tsx:3766`, `src/components/ui/PromptStudio.tsx:46` (label), `src/helpers/audioStorage.js:34,37` (bestandsnaamprefix `Meetscribe-`; het uitlezen op r.118 werkt al voor elk prefix — pas alleen het commentaar aan), `src/helpers/downloadUtils.js:22` (`Meetscribe/1.0`), `src/helpers/audioManager.js:3487`, `src/helpers/clipboard.js:2472` (instructietekst), `src/helpers/connectors/slackConnector.js:126`, `src/helpers/linuxAutostart.js`, `src/helpers/gnomeShortcut.js:13–25` en `src/helpers/hyprlandShortcut.js:74` (alleen weergavenamen), `src/helpers/kdeShortcut.js` (nieuwe weergavenaam `Meetscribe ${slotName}`; behoud `OpenWhispr`-varianten in `friendlyToSlot` als legacy-compat), `src/helpers/skills/builtin/skill-creator/SKILL.md`, `src/helpers/ensureYdotool.js`, `src/helpers/globeKeyManager.js`, `src/helpers/dictationRouting.js`, `src/helpers/whisper.js`, `src/helpers/ffmpegUtils.js`, `src/helpers/urlAudioDownloader.js`, `src/helpers/safeTempDir.js` (alleen als het een zichtbare mapnaam is; een tijdelijke-mapprefix mag `meetscribe-` worden).
  Laat staan: alles uit "Bewust niet hernoemd", foutmeldingen in cloud-/enterprise-paden (`API URL not configured`, `EnterpriseIdentityService`, `enterpriseProviderErrors.js`, `inferenceProviders/openwhispr.ts`), en connector-teksten die de echte "OpenWhispr GitHub App" noemen (`githubConnector.js`, `githubTools.ts`), want die zijn local-only onbereikbaar en benoemen een bestaand extern ding. Controleer de lijst met:
  `git grep -n "OpenWhispr" -- src main.js preload.js ':!src/locales' | grep -v ":\s*\(//\|\*\)"` — elke resterende treffer valt onder een van de uitzonderingen.
- [ ] **Step 5:** Run de tests uit Step 1, daarna `npm test` → geen nieuwe fails; werk tests bij die een hier hernoemde literal verwachten (bv. audio-bestandsnaam, agent-standaardnaam). Run `npm run typecheck` en `npm run lint` → PASS.
- [ ] **Step 6:** Commit `feat: Meetscribe in app copy, prompts and the default agent name`.

---

### Task 5: Native helpers en installer

**Files:**
- Modify: `resources/macos-calendar-listener-Info.plist` (r.6 `CFBundleIdentifier` → `com.meetscribe.calendar-listener`, r.8 en r.10/12 → Meetscribe), `resources/macos-audio-tap.swift:116` (`kAudioAggregateDeviceNameKey` → `"Meetscribe Audio Tap"`; queue-labels en UID mogen blijven), `resources/nsis/installer.nsh:11,44` (firewallregel `Meetscribe Local Transcription Server (sherpa-onnx)`, `DetailPrint` → Meetscribe), overige `resources/*.swift`-bestanden alleen waar de tekst in een systeemdialoog of Audio MIDI Setup zichtbaar is

**Interfaces:** geen.

- [ ] **Step 1:** Breng de wijzigingen aan. In `installer.nsh`: verwijder bij installatie/verwijdering óók de oude regel `OpenWhispr Local Transcription Server (sherpa-onnx)` (extra `netsh advfirewall firewall delete rule name="..."` naast de bestaande), zodat een upgrade geen wees-regel achterlaat.
- [ ] **Step 2:** Run `npm run compile:native` → slaagt; `plutil -lint resources/macos-calendar-listener-Info.plist` → OK.
- [ ] **Step 3:** Run `npm run build:local:mac`; open na het opnemen van een testvergadering Audio MIDI Setup → het tijdelijke apparaat heet "Meetscribe Audio Tap". Noteer het resultaat in de commit-body.
- [ ] **Step 4:** Commit `feat: Meetscribe names in native helpers and the Windows installer`.

---

### Task 6: Documentatie

**Files:**
- Modify: `README.md` (titel `<h1>` → `Meetscribe`, eerste zin "Meetscribe is een desktopapp…"; de fork-zin en `NOTICE`-verwijzing blijven), `SECURITY.md`, `CLAUDE.md` (fork-sectie: één regel "Productnaam Meetscribe; zie de lijst *Bewust niet hernoemd* in `docs/superpowers/plans/2026-11-11-meetscribe-rebrand.md`" en de nieuwe identiteitswaarden), `docs/manual-acceptance.md`, `src/assets/fonts/yowza/README.md`
- Delete: upstream-documenten die over OpenWhispr's eigen product gaan en voor Meetscribe niet kloppen: `CHANGELOG.md`, `DEBUG.md`, `LOCAL_WHISPER_SETUP.md`, `TROUBLESHOOTING.md`, `docs/enterprise-audio-runbook.md`, `docs/integrations-compatibility.md`. Controleer vóór verwijderen met `git grep -n "<bestandsnaam>"` dat niets anders ernaar linkt; pas gevonden links aan of verwijder ze.

**Interfaces:** geen.

- [ ] **Step 1:** Voeg aan `docs/manual-acceptance.md` een sectie "Rebrand" toe met deze controles: (a) eerste start met bestaande `OpenWhispr`-data → notities, notulen en instellingen aanwezig, oude map verdwenen; (b) keychain-prompt geweigerd → app start, Instellingen vraagt om de Foundry-key, geen crash; (c) Dock, menubalk, venstertitel, permissiedialogen (microfoon, systeemaudio, agenda, toegankelijkheid) tonen Meetscribe; (d) Windows: Startmenu, installer, Taakbeheer → Meetscribe; oude OpenWhispr-installatie handmatig verwijderen; (e) microfoon-, toegankelijkheids- en agendapermissie opnieuw verlenen (nieuwe bundle-ID).
- [ ] **Step 2:** Run `git grep -n -i "openwhispr" -- README.md SECURITY.md docs/manual-acceptance.md` → alleen de fork-vermelding en links naar de upstream-repo.
- [ ] **Step 3:** Run `npm run format:check` → PASS (anders `npx prettier --write` op de gewijzigde bestanden).
- [ ] **Step 4:** Commit `docs: Meetscribe in the docs, drop upstream-only guides`.

---

### Task 7: Eindcontrole

- [ ] **Step 1:** Run `npm test`, `npm run lint`, `npm run quality-check` → geen nieuwe fails t.o.v. de baseline uit Task 2 Step 6.
- [ ] **Step 2:** Inventaris: `git grep -n -i "openwhispr" -- . ':!docs/superpowers' ':!docs/validation' ':!NOTICE' ':!package-lock.json' | grep -v -i "openwhispr\.com\|github\.com/OpenWhispr\|OPENWHISPR_\|cache/openwhispr\|com\.openwhispr\.App" | wc -l` en loop de resterende treffers door: elk valt onder "Bewust niet hernoemd" of een uitzondering uit Task 4 Step 4. Leg een onverwachte treffer vast en los hem op in de taak die het bestand bezit.
- [ ] **Step 3:** Start de gebouwde app (`dist/mac-arm64/Meetscribe.app`) met een kopie van een bestaande `OpenWhispr`-datamap en loop de Rebrand-checks (a)–(c) uit `docs/manual-acceptance.md` na. Rapporteer wat wel en niet handmatig is gecontroleerd.
