# Lokale meeting-assistent op OpenWhispr — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OpenWhispr ombouwen tot een accountloze desktop-meeting-assistent die standaard lokaal met Orukeet transcribeert en notulen en chat via Azure Foundry of een andere OpenAI-compatible provider levert.

**Architecture:** Eén centrale `isLocalOnly()`-schakelaar zet account, sync, teamruimtes, betaling en cloud-engines uit, zodat de code dicht bij upstream blijft. Orukeet loopt via de bestaande sherpa-onnx-route. Eén nieuwe provider `foundry` hergebruikt de main-process streaming van de enterprise-route. Notulen zijn gevalideerde JSON die naar bewerkbare Markdown wordt gerenderd. Chat over de historie zoekt in een nieuwe FTS5-index op transcriptpassages.

**Tech Stack:** Electron 43, React 19, TypeScript, better-sqlite3 (FTS5), sherpa-onnx 1.13.8, AI SDK 6 (`@ai-sdk/openai`), zod 4, `node:test`.

**Spec:** "Ontwikkelplan: open-source AI Meeting Assistant" uit het verzoek van de gebruiker. Task 1 slaat die op als `docs/superpowers/specs/2026-11-10-ontwikkelplan.md`.

## Context

De app moet audio en transcripten op de computer houden en alleen tekst voor samenvattingen en chatvragen naar een zelfgekozen LLM sturen. Uit de verkenning van deze checkout (v1.11.1, geen git-repo, geen `node_modules`):

- Een gastroute zonder account bestaat al. Sync, policy en connectors blijven inactief zonder sessie. Wel staan alle defaults op de OpenWhispr-cloud en is er geen local-only-vlag.
- Orukeet is volledig bedraad (`orukeet-v0.1.0`, sherpa-onnx), maar heeft geen SHA-256 en is niet de default.
- De enterprise-route levert streaming via main al, maar de Azure-URL-afhandeling past niet op de v1-API en is beperkt tot Azure.
- Transcripten staan niet in FTS5 en zoekresultaten bevatten geen passages, sprekers of tijden. Daar zit het echte nieuwbouwwerk.

## Besluiten van de gebruiker

| Onderwerp | Besluit |
|---|---|
| Model | Download bij eerste start, met SHA-256-controle |
| Entra ID | Niet in v1. Alleen API-key, met één plek om later Entra toe te voegen |
| Dicteren en assistent | Blijven, lokaal. AI-opschoning van dictaat staat standaard uit |
| Signing en update-feed | OpenWhispr-configuratie blijft voorlopig staan. Zie de noot in Task 4 |
| Platforms | macOS Apple Silicon en Windows x64. Intel valt af |

## Global Constraints

- Node 24 (`npm ci`). `package-lock.json` nooit met een andere major regenereren.
- `src/models/modelRegistryData.json` en andere gevendorde registry-bestanden niet bewerken (`npm run model-registry:verify` faalt anders).
- Orukeet: id `orukeet-v0.1.0`, provider-waarde `nvidia` (niet `oruk`), archief-SHA-256 `f9191f30178cc9122ce2f023bf9fefafc822028307b0efa4caff645ba3fe8d0a`.
- Orukeet vereist macOS 15.5 of nieuwer (`parakeetCapability.js`).
- API-keys alleen via `SECRET_KEYS` in `environment.js` (Electron `safeStorage`: sleutel in macOS Keychain, DPAPI op Windows). Nooit in SQLite, `.env` of localStorage.
- Elke nieuwe UI-tekst via `t()` met een sleutel in alle mappen onder `src/locales/` (ar, de, en, es, fr, it, ja, pt, ru, zh-CN, zh-TW).
- Modeluitvoer en zoekresultaten zijn data, geen instructies.
- Test-shorthand `T <pad>` betekent: `node --import tsx --import ./test/setup/upstreamMode.js --test <pad>`.

## Review Focus

1. Gebruiker plakt een Azure-URL in een willekeurige vorm (met `/openai/deployments/x/chat/completions?api-version=…`, trailing slash, projectendpoint): de provider moet op `/openai/v1` uitkomen. Test in Task 7.
2. Opnemen terwijl het model ontbreekt of de download corrupt is: duidelijke melding, opname blijft bewaard, nooit terugval op een cloud-engine. Test in Task 5.
3. Notulen genereren zonder geldige configuratie of key: transcript en bestaande notulen blijven onaangeroerd, melding wijst naar Instellingen. Test in Task 10.
4. Zeer lange vergadering (`context_length_exceeded`): opdelen in delen in plaats van mislukken. Test in Task 8.
5. Zoekopdrachten met leestekens, FTS-woorden of accenten (`Q3-plan`, `"`, `AND`, `coördinatie` vs `coordinatie`): geen SQL-fout, wel treffers. Test in Task 11.

---

## Mijlpaal A — Accountloos (Fase 1)

### Task 1: Baseline en local-only-schakelaar

**Files:**
- Create: `src/config/localOnly.js`, `test/setup/upstreamMode.js`, `test/setup/localOnly.js`, `test/config/localOnly.test.js`, `docs/superpowers/specs/2026-11-10-ontwikkelplan.md`, `docs/superpowers/plans/2026-11-10-meeting-assistant.md`
- Modify: `package.json:78`

**Interfaces:**
- Produces: `isLocalOnly(): boolean`, bruikbaar vanuit main (`require`) en renderer (`import`), zelfde moduleformaat als `src/config/secretKeys`. `useLocalOnly()` uit `test/setup/localOnly.js` zet de modus aan binnen een testbestand.

- [ ] **Step 1:** `git init`, `.gitignore` controleren, alles committen als `chore: baseline OpenWhispr 1.11.1`. Spec en dit plan toevoegen op de paden hierboven.
- [ ] **Step 2:** `npm ci`, dan `npm test`. Noteer het aantal geslaagde en gefaalde tests in de commit van Step 7. Dit is de vergelijkingsbasis.
- [ ] **Step 3: Failing test** `test/config/localOnly.test.js`:

```js
test("defaults to local-only when the upstream marker is absent", () => {
  delete globalThis.__OW_UPSTREAM_MODE;
  assert.equal(isLocalOnly(), true);
});
test("the test setup marker restores upstream behaviour", () => {
  globalThis.__OW_UPSTREAM_MODE = true;
  assert.equal(isLocalOnly(), false);
});
```

- [ ] **Step 4:** `T test/config/localOnly.test.js`. Verwacht: FAIL, module ontbreekt.
- [ ] **Step 5:** Implementeer `isLocalOnly()` als `globalThis.__OW_UPSTREAM_MODE !== true`. `upstreamMode.js` zet de marker op `true`, zodat bestaande tests upstream-gedrag blijven pinnen. Voeg `--import ./test/setup/upstreamMode.js` toe aan het `test`-script.
- [ ] **Step 6:** `npm test`. Verwacht: dezelfde uitslag als Step 2, plus 2 geslaagd.
- [ ] **Step 7:** Commit `feat: add local-only mode switch`.

### Task 2: Geen account, geen sync

**Files:**
- Modify: `src/lib/auth.ts:16-22` en de directe `authClient`-aanroepen (48, 71, 183 e.v.), `main.js:978-992`, `src/services/syncPassPolicy.ts:26-45`, `src/components/onboarding/flow.ts`, `src/AppRouter.jsx:102-137`, `src/utils/requestSignIn.ts`
- Test: `test/services/localOnlySync.test.js`, `test/components/localOnlyOnboarding.test.js`, `test/helpers/localOnlyNotes.test.js`

**Interfaces:**
- Consumes: `isLocalOnly()`.
- Produces: in local-only is `authClient === null`, geeft `useAuth` de bestaande `useStaticSession`, en geeft `getOnboardingRoute` een route zonder `auth` en `setup-choice`.

- [ ] **Step 1: Failing tests** (met `useLocalOnly()`):
  - `resolveSyncConsent` met `signedIn: true, authValidated: true` geeft `shared`, backup en analytics alle drie `false`.
  - `getOnboardingRoute` van een nieuwe sessie bevat geen `"auth"` en geen `"setup-choice"`, wel `"permissions"` en de lokale setup-stap.
  - `saveNote` zonder ooit gezette account-scope gevolgd door `getNote` geeft de notitie terug (database-teststijl uit `test/helpers/noteSearch.test.js`).
- [ ] **Step 2:** `T` op de drie bestanden. Verwacht: FAIL op de eerste twee. De derde mag slagen; dan is het open punt rond de ongezette scope afgedekt.
- [ ] **Step 3:** `authClient` is `null` in local-only en elke directe aanroep gaat daar veilig mee om. Geen `get-session` meer vanuit renderer of `main.js`. `resolveSyncConsent` geeft alles `false`. `createOnboardingSession` start als gast en zet `authenticationSkipped`/`skipAuth`. `needsReauth` is `false`. `requestSignIn` doet niets.
- [ ] **Step 4:** Tests slagen. `npm test` en `npm run typecheck` tonen geen regressie.
- [ ] **Step 5:** Commit `feat: run without an account or cloud sync`.

### Task 3: Account-, betaal- en team-UI weg

**Files:**
- Modify: `src/lib/settingsNav.ts:80-124`, `src/lib/upsell.ts:21`, `src/components/ControlPanelSidebar.tsx`, `src/components/ProfileMenu.tsx:43-55`, `src/components/ControlPanel.tsx:417-422,1117,1218,1327,1417,1454,1480`, `src/components/ConnectorsSection.tsx`, `src/components/IntegrationsView.tsx`, `src/components/integrations/McpPane.tsx`, `src/components/dictionary/SharedDictionaryLocked.tsx`, `src/components/notes/UploadAudioView.tsx:397-410,614`, `src/hooks/usePolicy.ts:128-138`, `src/components/onboarding/setupEligibility.ts:45`
- Test: `test/lib/localOnlyNav.test.js`

**Interfaces:**
- Consumes: `isLocalOnly()`.

- [ ] **Step 1: Failing test:** `buildSettingsNav(...)` bevat geen `account`, `plansBilling` of workspace-items. `resolveSettingsSection("account")` geeft `"general"`. `decideUpsell(...)` geeft `"hide"`. `usePolicyModeOptions`' pure kern bevat geen `"openwhispr"`.
- [ ] **Step 2:** `T test/lib/localOnlyNav.test.js`. Verwacht: FAIL.
- [ ] **Step 3:** Implementeer de filters op de genoemde plekken. Connectors, MCP en gedeeld woordenboek verdwijnen uit Integraties zonder upsell. De bestandsgrootte-checks in `UploadAudioView` vervallen voor lokaal. Deep links naar verwijderde secties gaan naar `general`.
- [ ] **Step 4:** Test slaagt, `npm run typecheck` schoon.
- [ ] **Step 5:** Commit `feat: remove account, billing and team UI in local-only mode`.

### Task 4: Automatisch netwerkverkeer en builds

**Files:**
- Modify: `src/helpers/registryLoader.js:57`, `src/updater.js:30`, `package.json`, `.github/workflows/` alleen als de build dat vereist
- Test: `test/helpers/localOnlyNetwork.test.js`

**Noot signing en updates:** `electron-builder.json` en de `publish`-instelling blijven ongewijzigd, zoals afgesproken. De update-check gaat wél uit in local-only: de feed wijst naar `OpenWhispr/openwhispr`, dus een geïnstalleerde build zou zichzelf anders vervangen door de originele app zonder deze aanpassingen. Lokale builds zijn onondertekend, omdat de Gizmo Labs-certificaten niet beschikbaar zijn.

**Noot volledige ontkoppeling (besluit gebruiker):** cloud en account blijven achter de `isLocalOnly()`-schakelaar, maar de app mag in local-only geen enkele verbinding met OpenWhispr-diensten maken. Dat wordt afgedwongen met een blokkade op sessieniveau, ook voor code die een guard mist. Links naar OpenWhispr-sites in de UI (`OnboardingShell.tsx:386,395`, `SupportDropdown.tsx:57,77`, `menuManager.js:109`) verdwijnen. Modeldownloads van Hugging Face en het ingestelde LLM-endpoint blijven toegestaan.

- Create: `src/helpers/blockedHosts.js`. Produces: `isBlockedUrl(url: string): boolean`, dat in local-only blokkeert: `openwhispr.com` en subdomeinen, `gizmovoice.ai` en subdomeinen, en paden onder `github.com/OpenWhispr`, `api.github.com/repos/OpenWhispr` en `raw.githubusercontent.com/OpenWhispr`.

- [ ] **Step 1: Failing test:** in local-only geeft de registry-loader `bundled` als modus, ook zonder `OPENWHISPR_MODEL_REGISTRY_MODE`, en start `setupAutoUpdater` geen `setFeedURL` of check. `isBlockedUrl` is `true` voor `https://auth.openwhispr.com/x`, `wss://orukeet.gizmovoice.ai/`, `https://raw.githubusercontent.com/OpenWhispr/model-registry/x` en `https://api.github.com/repos/OpenWhispr/openwhispr/releases`, en `false` voor `https://huggingface.co/oruk/orukeet`, `https://x.openai.azure.com/openai/v1` en `https://notopenwhispr.com/`.
- [ ] **Step 2:** `T test/helpers/localOnlyNetwork.test.js`. Verwacht: FAIL.
- [ ] **Step 3:** Implementeer de guards en `isBlockedUrl`, en koppel die in `main.js` aan `session.webRequest.onBeforeRequest` voor elke gebruikte sessie (cancel en debug-log van alleen de host). Verwijder de genoemde links. Voeg scripts toe: `build:local:mac` (`electron-builder --mac --arm64 --config.mac.identity=null --config.mac.notarize=false`, met `prebuild:mac`) en `build:local:win` (met `electron-builder.unsigned-win.json`).
- [ ] **Step 4:** Test slaagt. `npm run build:local:mac` levert een arm64-DMG.
- [ ] **Step 5:** Start die build op een schone gebruikersmap. Acceptatie Fase 1: geen inlogscherm, een opname wordt lokaal opgeslagen, `nettop -p <pid>` toont geen `openwhispr.com` of `raw.githubusercontent.com`. Windows-build op een Windows-machine herhalen.
- [ ] **Step 6:** Commit `feat: stop automatic network calls, add local builds`.

---

## Mijlpaal B — Orukeet als enige engine (Fase 2)

### Task 5: Defaults, checksum en geen cloud-terugval

**Files:**
- Create: `src/config/localOnlyDefaults.js`, `src/config/pinnedModelHashes.js`
- Modify: `src/stores/settingsStore.ts:261-272,1707-1713,1732,1750,1914,1925,1940-1967,1977`, `src/helpers/parakeet.js:50,317`, `src/helpers/parakeetServer.js:131`, `src/helpers/audioManager.js:2303,2667-2673,2786-2792`, `src/helpers/meetingTranscriptionRouting.js:51`
- Test: `test/stores/localOnlyDefaults.test.js`, `test/helpers/pinnedModelHashes.test.js`, `test/helpers/localOnlyTranscriptionRouting.test.js`

**Interfaces:**
- Produces: `LOCAL_ONLY_DEFAULTS` (object met onderstaande waarden), `pinnedSha256(modelId): string | undefined`, `DEFAULT_LOCAL_SPEECH_MODEL = "orukeet-v0.1.0"`.

Waarden in `LOCAL_ONLY_DEFAULTS`: `useLocalWhisper`, `meetingUseLocalWhisper`, `uploadUseLocalWhisper` = `true`; `transcriptionMode`, `meetingTranscriptionMode`, `uploadTranscriptionMode` = `"local"`; `localTranscriptionProvider` en de meeting/upload-varianten = `"nvidia"`; `parakeetModel` en de meeting/upload-varianten = `"orukeet-v0.1.0"`; `allowOpenAIFallback`, `allowLocalFallback`, `useCleanupModel` = `false`; `cleanupMode`, `noteFormattingMode` = `"enterprise"`.

- [ ] **Step 1: Failing tests:**

```js
test("fresh settings route every scope to local Orukeet", () => {
  for (const key of ["parakeetModel", "meetingParakeetModel", "uploadParakeetModel"])
    assert.equal(LOCAL_ONLY_DEFAULTS[key], "orukeet-v0.1.0");
  assert.equal(LOCAL_ONLY_DEFAULTS.meetingTranscriptionMode, "local");
  assert.equal(LOCAL_ONLY_DEFAULTS.useCleanupModel, false);
});
test("Orukeet is pinned to the published archive hash", () => {
  assert.equal(pinnedSha256("orukeet-v0.1.0"),
    "f9191f30178cc9122ce2f023bf9fefafc822028307b0efa4caff645ba3fe8d0a");
});
test("a blank meeting model resolves to Orukeet, never another engine", () => { /* routing met leeg model → orukeet-v0.1.0, mode local */ });
test("a missing local model reports an error and never selects a cloud route", () => { /* dictation- en meetingroute met allowOpenAIFallback uit */ });
```

- [ ] **Step 2:** `T` op de drie bestanden. Verwacht: FAIL.
- [ ] **Step 3:** Pas de defaults toe als `isLocalOnly()` waar is. Vervang de vier stille `parakeet-tdt-0.6b-v3`-terugvallen. `parakeet.js:50` gebruikt `pinnedSha256(id) ?? modelInfo.sha256`; de bestaande `verifyFileSha256` doet de rest. De cloud-takken in `audioManager.js` zijn in local-only onbereikbaar. Schrijf ook `LOCAL_TRANSCRIPTION_PROVIDER=nvidia` en `PARAKEET_MODEL=orukeet-v0.1.0` weg voor de pre-warm.
- [ ] **Step 4:** Tests slagen, `npm test` geen regressie.
- [ ] **Step 5:** Commit `feat: make Orukeet the checked local default`.

### Task 6: Engine-keuze uit de UI, eerste start

**Files:**
- Modify: `src/helpers/localASROrganization.ts:5-10`, `src/components/TranscriptionModelPicker.tsx:281,382,474,584-603,1507`, `src/components/SettingsPage.tsx:~576`, `src/components/settings/MeetingSettings.tsx:133`, `src/components/settings/UploadSettings.tsx:85`, `src/config/localSetup.ts:232-239`, `src/components/notes/UploadAudioView.tsx:1061-1063`, `NOTICE` (of bestaand licentiebestand), `src/locales/*/translation.json`
- Test: `test/config/localOnlySetup.test.js`, `test/components/localOnlyPicker.test.js`

**Interfaces:**
- Consumes: `LOCAL_ONLY_DEFAULTS`, `isLocalOnly()`.

- [ ] **Step 1: Failing tests:** `localSetup` kiest in local-only `orukeet-v0.1.0` voor elk machinetype dat Orukeet aankan, ook `english`, `hindi` en `other`. `LOCAL_ASR_ORGANIZATIONS` bevat alleen `oruk`. De modeselectie levert voor dictaat, meeting en upload alleen `local`.
- [ ] **Step 2:** `T` op beide bestanden. Verwacht: FAIL.
- [ ] **Step 3:** Implementeer de filters. Verwijder de drie mode-kaarten (alleen het lokale paneel blijft). Fix de picker-paden die `whisper` kunnen vastleggen. Het eerste-start-scherm downloadt Orukeet, toont "CC BY-SA 4.0, oruk/orukeet" en meldt op macOS onder 15.5 dat het systeem niet wordt ondersteund. Verwijder de overstap-naar-cloud-knop in Upload.
- [ ] **Step 4:** Tests slagen. In de dev-app zijn alleen Orukeet-keuzes zichtbaar voor dicteren, meetings en upload.
- [ ] **Step 5:** Acceptatie Fase 2: dezelfde Nederlandse testopname als live-opname en als upload, Wi-Fi uit, op macOS en Windows. Beide leveren tekst met sprekers.
- [ ] **Step 6:** Commit `feat: show Orukeet as the only speech engine`.

---

## Mijlpaal C — Foundry-provider (Fase 3)

### Task 7: Provider in het main process

**Files:**
- Create: `src/helpers/foundryProvider.js`
- Modify: `src/helpers/enterpriseAiProviders.js:13-24`, `src/helpers/enterpriseProviderErrors.js:503,pickEnterpriseConfig,mapEnterpriseError`, `src/helpers/ipcHandlers.js:5979-5985,7443`, `src/helpers/environment.js:10-21`, `src/helpers/providerHttpErrors.js`, `preload.js`, `src/types/electron.ts`
- Test: `test/helpers/foundryProvider.test.js`, `test/helpers/foundryKeyIpc.test.js`

**Interfaces:**
- Produces:
  - `normalizeFoundryBaseUrl(raw: string): string` (gooit bij ongeldige invoer)
  - `validateFoundryEndpoint(url: string): void`
  - `createFoundryModel(modelId, apiKey, { foundryBaseUrl, foundryWireApi: "responses" | "chat" })`
  - `getFoundryCredential(env): { apiKey: string }`, de enige plek die Entra later vervangt
  - IPC `save-foundry-api-key(key)`, `has-foundry-api-key(): boolean`. De key komt nooit terug naar de renderer.
  - Foutcodes `CONTEXT_TOO_LARGE` (`context_length_exceeded`) en `PROVIDER_CONTENT_FILTERED`.

- [ ] **Step 1: Failing tests** (stub `global.fetch`, zoals `enterpriseAiProviders.test.js`):

```js
for (const raw of [
  "https://x.openai.azure.com",
  "https://x.openai.azure.com/openai/v1/",
  "https://x.openai.azure.com/openai/deployments/gpt/chat/completions?api-version=2024-10-21",
  "https://x.services.ai.azure.com/api/projects/p",
]) test(`normalizes ${raw}`, () =>
  assert.equal(normalizeFoundryBaseUrl(raw), `${new URL(raw).origin}/openai/v1`));

test("keeps a non-Azure base URL as given, without trailing slash", () =>
  assert.equal(normalizeFoundryBaseUrl("https://api.example.com/v1/"), "https://api.example.com/v1"));
test("responses wire posts to /responses with store:false and no temperature", async () => { /* body.store === false, !("temperature" in body), model === deployment */ });
test("chat wire posts to /chat/completions", async () => { /* url eindigt op /chat/completions */ });
test("Azure chat wire sends max_completion_tokens, not max_tokens", async () => {});
test("generic chat wire keeps max_tokens", async () => {});
test("sends the key as a bearer token", async () => { /* authorization === "Bearer k" */ });
test("rejects http on a public host and cloud metadata hosts", () => {});
test("allows http on localhost and private ranges", () => {});
test("context_length_exceeded maps to CONTEXT_TOO_LARGE", () => {});
test("the renderer-supplied apiKey is ignored for foundry", async () => {});
```

- [ ] **Step 2:** `T` op beide bestanden. Verwacht: FAIL.
- [ ] **Step 3:** Implementeer `foundryProvider.js` met `createOpenAI({ apiKey, baseURL })` en `.responses()` of `.chat()`, verpakt met `wrapLanguageModel`: de middleware verwijdert `temperature` en zet op de Responses-route `providerOptions.openai.store = false`, plus `include: ["reasoning.encrypted_content"]`, omdat Azure responses anders 30 dagen bewaart. Een `fetch`-wrapper hernoemt `max_tokens` op Azure-hosts. Voeg `foundry` toe aan `ENTERPRISE_PROVIDERS` en `FOUNDRY_API_KEY` aan `SECRET_KEYS`. `resolveEnterpriseRuntime` krijgt een vroege `foundry`-tak die de key uit `EnvironmentManager` leest. `foundry` krijgt een eigen foutafbeelding via `asProviderError`, niet `mapAzureError`. Het stream-foutbericht draagt voortaan ook `messageKey`.
- [ ] **Step 4:** Tests slagen.
- [ ] **Step 5:** Commit `feat: add Foundry and OpenAI-compatible provider`.

### Task 8: Instellingen, routering en tokenlimieten

**Files:**
- Create: `src/components/settings/FoundrySection.tsx`, onboarding-stap `src/components/onboarding/FoundrySetupStep.tsx`
- Modify: `src/models/ModelRegistry.ts:266-268,274`, `src/services/ai/enterpriseSettings.ts`, `src/services/ai/enterpriseChatModel.ts:74-84`, `src/stores/settingsStore.ts:2925-2954`, `src/helpers/reasoningRouting.js:35-49`, `src/stores/actionProcessingStore.ts:231,329`, `src/components/SettingsPage.tsx:1052-1058`, `src/components/onboarding/flow.ts`, `src/locales/*/translation.json`
- Test: `test/stores/foundryRouting.test.js`, `test/stores/foundryContextBudget.test.js`

**Interfaces:**
- Consumes: `createFoundryModel`, `save-foundry-api-key`, `has-foundry-api-key`, `test-enterprise-connection`.
- Produces: store-velden `foundryBaseUrl`, `foundryModel`, `foundryWireApi` (default `"responses"`), `foundryMaxInputTokens` (default `100000`), `foundryMaxOutputTokens` (default `8000`); `setFoundryConfig(patch)`, die alle LLM-scopes via `buildReasoningScopePatches` op `enterprise`/`foundry` zet, plus de vision-scopes.

- [ ] **Step 1: Failing tests:**
  - Na `setFoundryConfig({ foundryModel: "gpt-x" })` geeft `selectResolvedLLMConfig` voor `dictationCleanup`, `dictationAgent`, `noteFormatting` en `chatIntelligence` `{ mode: "enterprise", provider: "foundry", model: "gpt-x" }`.
  - `getEnterpriseCallSettings("foundry", …)` bevat `foundryBaseUrl` en `foundryWireApi`, en `apiKey` is `""`.
  - Een Foundry-weigering met code `CONTEXT_TOO_LARGE` op een lang transcript start `runInParts` met `maxContextTokens === foundryMaxInputTokens`.
  - `getOnboardingRoute` bevat in local-only de Foundry-stap, na de lokale setup.
- [ ] **Step 2:** `T` op beide bestanden. Verwacht: FAIL.
- [ ] **Step 3:** Implementeer. `FoundrySection` heeft velden voor base URL, deployment/model, API-key (alleen schrijven, toont "opgeslagen"), Responses/Chat Completions en de twee limieten, plus `TestConnectionButton`. Foutmeldingen wijzen naar het foutieve veld. `readLocalContextBudget` wordt `readContextBudget`, met de Foundry-limiet voor deze provider. `foundryMaxOutputTokens` gaat mee als `maxTokens`. De onboarding-stap is overslaanbaar, want transcriberen werkt zonder LLM.
- [ ] **Step 4:** Tests slagen, `npm run typecheck` schoon.
- [ ] **Step 5:** Acceptatie Fase 3: een samenvatting met stream via een Azure Foundry-deployment én via één andere provider, met echte keys van de gebruiker. Controleer dat de key niet in `localStorage` of `.env` staat.
- [ ] **Step 6:** Commit `feat: configure one LLM provider for all AI tasks`.

---

## Mijlpaal D — Notulen (Fase 4)

### Task 9: Notulenschema en Markdown-weergave

**Files:**
- Create: `src/utils/meetingMinutes.ts`
- Test: `test/utils/meetingMinutes.test.js`

**Interfaces:**
- Produces:
  - `MeetingMinutes = { language: string; summary: string; topics: { title: string; points: string[] }[]; decisions: string[]; actionItems: { task: string; owner: string | null; deadline: string | null }[] }`
  - `parseMinutes(reply: string): { ok: true; minutes: MeetingMinutes } | { ok: false; reason: string }`
  - `renderMinutesMarkdown(minutes: MeetingMinutes): string`

- [ ] **Step 1: Failing tests:**

```js
test("accepts JSON wrapped in a code fence", () => assert.equal(parseMinutes(fenced(valid)).ok, true));
test("rejects missing fields and non-JSON", () => {
  assert.equal(parseMinutes('{"summary":"x"}').ok, false);
  assert.equal(parseMinutes("Hier zijn de notulen").ok, false);
});
test("renders Dutch headings for language nl", () => {
  const md = renderMinutesMarkdown({ ...valid, language: "nl" });
  for (const h of ["## Samenvatting", "## Bespreekpunten", "## Besluiten", "## Actiepunten"]) assert.ok(md.includes(h));
});
test("falls back to English headings for an unknown language", () => {});
test("omits owner and deadline when not mentioned", () => {
  assert.ok(render({ task: "Offerte sturen", owner: null, deadline: null }).includes("- [ ] Offerte sturen\n"));
});
test("output works with tagActionItemOwners", () => { /* eigenaar "Sam" wordt een mention */ });
```

- [ ] **Step 2:** `T test/utils/meetingMinutes.test.js`. Verwacht: FAIL.
- [ ] **Step 3:** Implementeer met zod. Parsen stript codefences. Actiepunten renderen als `- [ ] Taak — Eigenaar (deadline)`; zonder eigenaar of deadline vervalt dat deel. Lege lijsten laten hun kop weg.
- [ ] **Step 4:** Test slaagt.
- [ ] **Step 5:** Commit `feat: validate and render structured minutes`.

### Task 10: Notulen genereren en bewaren

**Files:**
- Modify: `src/helpers/builtinActions.js:526`, `src/helpers/templatePrompts.js`, `src/stores/actionProcessingStore.ts:520-677`, `src/helpers/database.js:80-92,~1800,4410-4420`, `src/types/electron.ts:454`, `src/stores/settingsStore.ts:2149`, `src/locales/*/translation.json`
- Test: `test/stores/minutesAction.test.js`, `test/helpers/minutesColumns.test.js`

**Interfaces:**
- Consumes: `parseMinutes`, `renderMinutesMarkdown`.
- Produces: built-in template `minutes` met `structured: true`; kolommen `notes.minutes_json TEXT`, `notes.minutes_model TEXT`.

Het model krijgt geen `response_format`: prompt plus validatie werkt op elke OpenAI-compatible server. Het transcript blijft in zijn eigen kolom; `enhanced_content` is de bewerkbare weergave en voedt de bestaande export, undo en hergeneratie.

- [ ] **Step 1: Failing tests:**
  - Geldig antwoord: `enhanced_content` is de gerenderde Markdown, `minutes_json` de JSON, `minutes_model` de deployment, `transcript` ongewijzigd.
  - Ongeldig eerste antwoord: één extra verzoek met de validatiefout erbij, daarna opgeslagen.
  - Twee keer ongeldig: fout `notes.actions.errors.minutesInvalid`, notitie onaangeroerd.
  - Provider-authfout: notitie onaangeroerd, fout heeft `settingsTarget: "llms"`.
  - `NOTHING_TO_SUMMARIZE`: geen parse-fout, bestaande neutrale melding.
  - Undo herstelt `enhanced_content`, `minutes_json` en `minutes_model`.
  - Hergenereren na een modelwissel werkt `minutes_model` bij.
  - Prompttest: bevat de regel dat eigenaar en deadline `null` zijn als ze niet zijn genoemd, en het JSON-model.
- [ ] **Step 2:** `T` op beide bestanden. Verwacht: FAIL.
- [ ] **Step 3:** Implementeer in `runBackgroundAction`, ná `isNothingToSummarizeReply`. Volg het `ALTER`-patroon en werk de kolomlijsten en `NoteSummarySnapshot` bij. `compileMinutesPrompt` gebruikt `SOURCE_FIDELITY_RULE`. Maak `minutes` de `defaultSummaryTemplateId` in local-only. Controleer dat `runInParts` de JSON-instructie in de merge-stap behoudt.
- [ ] **Step 4:** Tests slagen, `npm test` geen regressie.
- [ ] **Step 5:** Acceptatie Fase 4 in de dev-app: bewerken, opnieuw genereren en Markdown-export. Plak de geëxporteerde kop en actiepunten ter controle in een viewer.
- [ ] **Step 6:** Commit `feat: generate structured meeting minutes`.

---

## Mijlpaal E — Chat over vergaderingen (Fase 5)

### Task 11: Passage-index

**Files:**
- Create: `src/helpers/transcriptPassages.js`
- Modify: `src/helpers/database.js` (tabellen, triggers, methode), `src/helpers/ipcHandlers.js`, `preload.js`, `src/types/electron.ts`
- Test: `test/helpers/transcriptPassages.test.js`, `test/helpers/transcriptPassageSearch.test.js`

**Interfaces:**
- Produces:
  - `buildPassages(transcript: string, speakerNames: Record<string, string>): { seq, speaker, startSeconds, endSeconds, text }[]`
  - `db.searchTranscriptPassages({ query, limit = 8, dateFrom?, dateTo?, noteId? }): { passageId, noteId, noteTitle, noteDate, speaker, startSeconds, endSeconds, text }[]`
  - IPC `db-search-transcript-passages`

Schema: `transcript_passages(id INTEGER PRIMARY KEY, note_id, seq, speaker, start_seconds, end_seconds, text)`; `transcript_passages_fts USING fts5(text, speaker, content='transcript_passages', content_rowid='id', tokenize="unicode61 remove_diacritics 2")`; `pending_transcript_index(note_id PRIMARY KEY)`. Triggers op `notes` (`INSERT`, `UPDATE OF transcript, deleted_at`, `DELETE`) en `speaker_mappings` vullen de journaaltabel, zoals `pending_vector_changes`. De migratie zet alle bestaande notities met transcript erin. De zoekmethode verwerkt eerst de journaaltabel, zodat resultaten altijd actueel zijn.

- [ ] **Step 1: Failing tests:**
  - `buildPassages`: opeenvolgende segmenten van één spreker worden samengevoegd tot maximaal 800 tekens; een sprekerwissel start een passage; tijden komen uit eerste en laatste segment; platte tekst geeft passages met `null`-tijden; ongeldige JSON geeft platte-tekstverwerking, geen exception.
  - Zoeken: vindt een woord dat alleen in het transcript staat, met spreker en starttijd.
  - `coordinatie` vindt `coördinatie`. `Q3-plan`, `"`, `AND` en `*` geven geen fout.
  - `dateFrom`/`dateTo` filteren op vergaderdatum; een verwijderde notitie komt niet terug; een gewijzigd transcript vervangt de oude passages; een hernoemde spreker is vindbaar; `limit` is begrensd op 20.
- [ ] **Step 2:** `T` op beide bestanden. Verwacht: FAIL.
- [ ] **Step 3:** Implementeer. Hergebruik de sanitizer uit `noteSearch.js`, met termen verbonden door `OR` en rangschikking op `bm25`. Sprekerlabels zoals `get_note` ze toont, met `Note taker` voor de opnemer.
- [ ] **Step 4:** Tests slagen.
- [ ] **Step 5:** Commit `feat: index transcript passages for search`.

### Task 12: Tool en bronverwijzingen in chat

**Files:**
- Create: `src/services/tools/searchMeetingsTool.ts`, `src/components/chat/MeetingSources.tsx`
- Modify: `src/services/tools/index.ts:62-68`, `src/config/prompts.ts` (`getAgentSystemPrompt`), `src/components/chat/ChatMessage.tsx:398,464`, `src/components/chat/useChatPersistence` en `chatPersistence.ts`, `src/locales/*/translation.json`
- Test: `test/services/searchMeetingsTool.test.js`, `test/components/meetingSources.test.js`

**Interfaces:**
- Consumes: IPC `db-search-transcript-passages`.
- Produces: tool `search_meetings({ query, date_from?, date_to?, limit? })` met `data: { ref: number, noteId, title, date, speaker, time: "mm:ss" | null, text }[]`; berichtmetadata `meetingSources` (maximaal 8, tekst maximaal 800 tekens); `parseCitations(text, sources)`.

- [ ] **Step 1: Failing tests:**
  - De tool nummert resultaten vanaf `1`, formatteert de tijd en markeert de inhoud als niet-vertrouwd.
  - Promptregels: antwoord alleen uit passages, citeer met `[n]`, zeg het als niets gevonden is, probeer ook woordvarianten (`besluit`, `besloten`).
  - `parseCitations`: `[1]` wordt een link, `[9]` zonder bron blijft platte tekst.
  - `meetingSources` overleeft opslaan en heropenen van het gesprek.
  - De tool is beschikbaar in zowel hoofdchat als notitiechat, zonder account, en verstuurt alleen de gevonden passages.
- [ ] **Step 2:** `T` op beide bestanden. Verwacht: FAIL.
- [ ] **Step 3:** Implementeer. `MeetingSources` toont per bron titel, datum, spreker en tijd; uitklappen toont de passage, en "Open vergadering" opent de notitie. Bronnen staan op het bericht, naar het patroon van `noteCards.ts`. Het model krijgt de huidige datum al via `buildMessageContext`, dus "vorige week" wordt door het model omgezet naar `date_from`/`date_to`.
- [ ] **Step 4:** Tests slagen, `npm run typecheck` schoon.
- [ ] **Step 5:** Acceptatie Fase 5: met drie opgenomen vergaderingen de vraag "Wat hebben we vorige week over project X besloten?" stellen. Het antwoord bevat bronnen met vergadering, spreker en tijd, en elke passage staat echt in dat transcript.
- [ ] **Step 6:** Commit `feat: chat over past meetings with sources`.

---

## Mijlpaal F — Testen en opleveren (Fase 6)

### Task 13: Eindcontrole en documentatie

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `NOTICE`

- [ ] **Step 1:** Volledige controle: `npm test` en `npm run quality-check`. Verwacht: uitslag gelijk aan de baseline plus de nieuwe tests.
- [ ] **Step 2:** `npm run build:local:mac` en `build:local:win`, elk geïnstalleerd op een schone gebruikersmap.
- [ ] **Step 3:** Handmatige matrix op macOS arm64 en Windows x64: vergadering met meerdere sprekers; opname van minstens 60 minuten; geweigerde microfoonrechten; transcriptie offline; Nederlands en Engels door elkaar; app geforceerd afsluiten tijdens opname en daarna herstellen; opname-tot-chat van begin tot eind.
- [ ] **Step 4:** Leg in `CLAUDE.md` en `README.md` de local-only-modus, Foundry-instellingen, passage-index en modellicentie vast.
- [ ] **Step 5:** Commit `docs: describe the local meeting assistant`.

## Bekende beperkingen

- **Acceptatie "ondertekende installers" blijft open** zolang er geen eigen certificaten zijn. Eigen signing en een eigen update-feed zijn later alleen configuratie plus het weghalen van de updater-guard.
- Live meeting-transcriptie knipt audio om de 5 seconden zonder overlap, dus woorden op een grens kunnen wegvallen. Beoordeel dit in de matrix van Task 13 voordat je het aanpakt.
- De diarization-modellen worden bij de eerste start van GitHub gedownload, zonder checksum. Mislukt dat, dan werkt transcriptie wel, maar zonder sprekers na afloop.
- Niet in scope: een Nederlandse app-interface, Entra ID, en vector search voor de passage-index.

## Verificatie van het geheel

1. `npm test` en `npm run quality-check` zijn groen ten opzichte van de baseline uit Task 1.
2. Een schone installatie op beide platforms vraagt geen account en downloadt Orukeet met SHA-256-controle.
3. Met het netwerk uit lukken opnemen, transcriberen en lokaal terugvinden. Met het netwerk aan gaat alleen verkeer naar het ingestelde LLM-endpoint.
4. Notulen werken op Azure Foundry en één andere provider, en zijn bewerkbaar, opnieuw te genereren en als Markdown te exporteren.
5. Een historische chatvraag geeft een antwoord met controleerbare bronnen.
