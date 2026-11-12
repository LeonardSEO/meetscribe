# Meetscribe macOS ad-hoc build & GUI-test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (one session, the GUI cannot be shared between subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Meetscribe for macOS arm64 ad-hoc signed, test it through the real GUI against a fictional (mock) LLM endpoint, fix every failure found on the spot, and push everything to `main`.

**Architecture:** The signing changes from this session (uncommitted on `main`: `identity: "-"`, no notarization, Azure signing removed) are the base. A full `npm run build:local:mac` produces the DMG/ZIP. A local mock OpenAI-compatible server on `127.0.0.1` stands in for Foundry. The app is launched normally (`open`), with a visible window, and driven with the computer-use skill (screenshots + clicks). All output goes to one log folder.

**Tech Stack:** Electron 41, electron-builder 26.15.3, Node 24, macOS 27.3 (Apple Silicon), `say` + ffmpeg for test audio, Node `http` for the mock server.

**Spec:** the user's request in this session (Dutch): ad-hoc sign, build, check everything, test the app thoroughly with a visible GUI (not headless), keep logs, fix failures immediately, push to main. Answers: back up the old data folder and then test the real migration. Everything is fictional or a mockup: no real API. I click and test everything myself; the user does not take part.

## Global Constraints

- Product name **Meetscribe** (never MeetScribe). Bundle ID `com.meetscribe.app`. User data folder `~/Library/Application Support/Meetscribe`.
- No real API calls. The LLM is a mock on `http://127.0.0.1:<port>/v1` with the fictional key `sk-mock-meetscribe`. Never a real provider host.
- **I do not grant macOS privacy permissions** (Microphone, Accessibility, Screen/System Audio Recording, Calendar). Clicking "Allow" in a TCC dialog or toggling it in System Settings counts as changing security settings, which I am not allowed to do, even with the user's consent. Recording via the microphone therefore gets tested in its _refused/not granted_ path. Transcription is tested through **Upload audio**, which needs no microphone.
- Node 24 for `npm` commands. Do not regenerate `package-lock.json`.
- The Orukeet model is already in `~/.cache/openwhispr/parakeet-models/orukeet-v0.1.0`. Do not delete it (the download path is not part of this run, see Review Focus).
- Log folder: `/private/tmp/claude-501/-Users-leonard--claude-spares-spare-vvksvT/2e848953-5bed-4747-80b4-d22338ce7016/scratchpad/testrun/`, with `build.log`, `mock-llm.log`, `app-stdout.log`, `results.md` (one row per test: ID, result, evidence, fix commit).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push directly to `origin/main` (explicitly requested).

## Review Focus

1. **Migration of the real data folder:** `open-whispr` must be moved to `Meetscribe` exactly once, with no empty start. Check: the note count before and after is equal (T4).
2. **Ad-hoc signature on every nested Mach-O:** a helper without a valid signature only crashes once it is used (audio tap, sherpa, qdrant). Check: `codesign --verify --deep --strict` plus a per-file check (T2).
3. **Gatekeeper/quarantine:** a DMG that went through the internet gets `com.apple.quarantine`. Check: open the app from the DMG with a quarantine attribute set, expect a block and no crash (T2 step 4).
4. **LLM endpoint unreachable or returning garbage:** the transcript and existing minutes stay untouched, and the message points to Settings (T7).
5. **Microphone not granted:** a clear message, no crash, and the explanation of the permission works (T6).

---

### Task 1: Prepare the test run (backup, logs, baseline)

**Files:**

- Create: the log folder above, plus `results.md`
- Create: the backup `~/Library/Application Support/open-whispr.backup-2026-11-11` (via `ditto`)

- [ ] **Step 1:** `ditto "~/Library/Application Support/open-whispr" "~/Library/Application Support/open-whispr.backup-2026-11-11"`. Check: `du -sh` of both folders is equal.
- [ ] **Step 2:** Record the baseline from the old database. Find the SQLite file in `open-whispr`, and write the number of notes (`SELECT count(*) FROM notes`) and transcriptions (`SELECT count(*) FROM transcriptions`) to `results.md`.
- [ ] **Step 3:** `npm test 2>&1 | tee testrun/unit.log` and `npm run quality-check 2>&1 | tee testrun/quality.log`. Expected: everything green. Fix any failure first (systematic-debugging), then commit separately.
- [ ] **Step 4:** Commit the signing changes that are already there: `git add electron-builder.json package.json .github/workflows/*.yml README.md CLAUDE.md docs/manual-acceptance.md` → `fix: ad-hoc sign macOS and drop upstream signing identities`.

### Task 2: Build ad-hoc and check the signature

- [ ] **Step 1:** `npm run build:local:mac 2>&1 | tee testrun/build.log`. Expected: exit 0, `dist/Meetscribe-*-arm64.dmg` and `-mac.zip`, and the log contains `identityName=-`.
- [ ] **Step 2:** On `dist/mac-arm64/Meetscribe.app`:
  - `codesign --verify --deep --strict --verbose=2` → `valid on disk`
  - `codesign -dv` → `Signature=adhoc`, `flags=…(adhoc,runtime)`, `Identifier=com.meetscribe.app`
  - Entitlements contain `disable-library-validation`, `allow-jit` and `audio-input`
  - `Info.plist`: `CFBundleName`/`CFBundleDisplayName` = Meetscribe, and the usage descriptions mention Meetscribe
- [ ] **Step 3:** Run `codesign --verify` on every Mach-O under `Contents/Resources` and `app.asar.unpacked` (`find … -type f | xargs file | grep Mach-O`). Expected: 0 failures. Also `spctl -a -vv` → `rejected` (expected without notarization; record it).
- [ ] **Step 4:** Mount the DMG, copy the app to `/Applications/Meetscribe.app` (overwriting an older Meetscribe after checking it), and verify the signature of the copy too. Simulate a quarantine on a separate copy (`xattr -w com.apple.quarantine "0081;…;Safari;"`), open it, and take a screenshot of the Gatekeeper dialog. Expected: a block, no crash. Close the dialog with **Done/Cancel** (not "Open Anyway": that is a security setting). The rest of the test uses the copy without quarantine.

### Task 3: Mock LLM server and test audio

**Files:**

- Create: `testrun/mock-llm.mjs` (scratchpad, not in the repo)
- Create: `testrun/audio/nl-vergadering.wav`, `testrun/audio/en-meeting.wav`

**Interfaces:**

- Produces: `http://127.0.0.1:18181/v1` with `GET /v1/models` → `{data:[{id:"mock-gpt"}]}`; `POST /v1/chat/completions` (with and without `stream:true`, SSE `data:` chunks + `[DONE]`); `POST /v1/responses` (non-streaming, plus streaming events `response.output_text.delta`/`response.completed`). Every request is logged to `mock-llm.log` (path, model, first 200 characters of the last user message, Authorization header masked).
- Behaviour: a request whose system prompt asks for the minutes JSON contract gets a valid JSON object that `parseMinutes` (`src/utils/meetingMinutes.ts`) accepts; read the contract there and in `MINUTES_KEY` (`src/helpers/builtinActions.js`). For a chat with tools, call `search_meetings` once, then reply with text that cites `[1]`. Otherwise reply with a fixed text: "Mock-antwoord van Meetscribe-test."
- Error mode: the env var `MOCK_MODE=500` makes every request return HTTP 500; `MOCK_MODE=garbage` returns invalid JSON for the minutes.

- [ ] **Step 1:** Write the server and start it in the background. Check: `curl -s 127.0.0.1:18181/v1/models` gives `mock-gpt`.
- [ ] **Step 2:** Make the audio: `say -v Xander -o nl.aiff "<Dutch meeting text of about 40 seconds with two decisions and an action point for Sanne>"` plus an English variant (`-v Samantha`), then `ffmpeg -i x.aiff -ar 16000 -ac 1 x.wav`. Check: `ffprobe` shows 16 kHz mono with a duration above 20 s.

### Task 4: First launch, migration and onboarding (GUI)

- [ ] **Step 1:** Quit any running Meetscribe/OpenWhispr instance. Launch with `open -a /Applications/Meetscribe.app --args --log-level=debug`. Screenshot after 5 s.
- [ ] **Step 2:** Check: `~/Library/Application Support/open-whispr` is gone and `Meetscribe` exists; the app log (`Meetscribe/logs/`) shows the migration; the Dock and menu bar say Meetscribe.
- [ ] **Step 3:** Go through onboarding, if shown: no account step and no OpenWhispr text. In the Foundry step, enter base URL `http://127.0.0.1:18181/v1`, API style Chat, model `mock-gpt` and key `sk-mock-meetscribe`. Skip permission steps that ask for a system grant, and screenshot each step.
- [ ] **Step 4:** Check: the number of notes and transcriptions in the History/Notes UI and in the new database matches the baseline from T1.
- [ ] **Step 5:** Check the keychain: if macOS asks for keychain access, record that and click **Deny** (that is an app dialog, not a security setting; it tests the "after Deny, Settings asks for the key and nothing crashes" path). Then enter the key again in Settings.

### Task 5: Settings and Foundry configuration (GUI)

- [ ] **Step 1:** In Settings → Foundry, paste an Azure-style URL (`https://example-mock.openai.azure.com/openai/deployments/x/chat/completions?api-version=2024-10-21`) and save, without sending anything. Check: the URL is shown normalised to `/openai/v1`, and the saved key is gone (another origin). Then set the mock URL back and enter the key again.
- [ ] **Step 2:** "Load models" lists `mock-gpt`. `mock-llm.log` shows `GET /v1/models` with `Authorization: Bearer sk-m…`.
- [ ] **Step 3:** Check every settings page once (open it, screenshot, no error toast or blank page). This includes the hotkeys, language, privacy and about pages: no "OpenWhispr" in user-visible text and no account or billing options.

### Task 6: Transcription, permission paths and notes (GUI)

- [ ] **Step 1:** Upload audio → `nl-vergadering.wav`. Expected: an Orukeet transcript in a new note, with recognisable Dutch words from the text, and speakers if diarization is available (record the result either way).
- [ ] **Step 2:** The same with `en-meeting.wav`.
- [ ] **Step 3:** Start a meeting recording or dictation without microphone permission. Expected: a clear message, the explanation of the permission opens, and no crash. If macOS shows its own microphone dialog, I click **Don't Allow** (refusing grants nothing; it is the refused path).
- [ ] **Step 4:** Note editing: change the title and text, restart the app, and check that the changes are saved. Search (the FTS bar) finds a word from the transcript.

### Task 7: Minutes and meeting chat against the mock (GUI)

- [ ] **Step 1:** Generate minutes for the Dutch note. Expected: structured minutes (decisions, action point for Sanne from the mock JSON), editable, and exportable as Markdown (save the file in `testrun/`, then check its content).
- [ ] **Step 2:** Regenerate them. Expected: the mock receives a new request and the minutes are replaced.
- [ ] **Step 3:** Meeting chat: "Wat hebben we besloten?" Expected: a `search_meetings` tool step, then an answer with `[1]` and sources (`MeetingSources`) that show note, date, speaker and time. A question with no match ("project Zebra") → "niets gevonden" wording from the model or the tool.
- [ ] **Step 4:** Error paths: restart the mock with `MOCK_MODE=500` → generating minutes gives a message that points to Settings, and the transcript and existing minutes are unchanged (compare the text). Then `MOCK_MODE=garbage` → no broken minutes are saved. Then stop the mock entirely → the same, with no crash.
- [ ] **Step 5:** Network discipline: `lsof -i -n -P | grep Meetscribe` during T6/T7, plus `mock-llm.log`. Expected: only `127.0.0.1` (plus local sidecars); no `openwhispr.com` or other hosts. Record every exception in `results.md`.

### Task 8: Robustness and quit

- [ ] **Step 1:** Force quit (`kill -9`) during an upload transcription, then restart. Expected: the app starts, there is no corrupt database, and the note is there or the upload can be retried.
- [ ] **Step 2:** Quit normally via the menu. Expected: no orphan sidecars (`pgrep -fl 'qdrant|sherpa|llama-server'` is empty after 5 s).
- [ ] **Step 3:** Go through the whole app log for `error`/`uncaught`/`crash` (`grep -i`) and through `~/Library/Logs/DiagnosticReports/Meetscribe*`. Every entry is either explained in `results.md` or fixed.

### Task 9: Fix loop (runs alongside T2–T8)

For every failure: write a row in `results.md` and apply superpowers:systematic-debugging (root cause first). Add a failing test where unit-testable (`node --test`, in `test/…`). Fix it, run the relevant test and `npm test`, then commit with `fix: …`. Rebuild (T2 step 1 to 3) and repeat the failed GUI step plus the steps that depend on it.

### Task 10: Close out and push

- [ ] **Step 1:** `npm test` and `npm run quality-check` green on the final state.
- [ ] **Step 2:** Copy this plan to `docs/superpowers/plans/2026-11-11-macos-adhoc-gui-test.md`. Tick the macOS checks that were really done in `docs/manual-acceptance.md`, with date, platform and build. Only tick what was done: not the real mic, not a 60-minute recording, not real Foundry.
- [ ] **Step 3:** Commit `docs: macOS ad-hoc GUI test results`, then `git push origin main`. Check: `git status` is clean and `git log origin/main -1` equals the local HEAD.
- [ ] **Step 4:** Clean up: stop the mock server. Keep the backup `open-whispr.backup-2026-11-11` (the user deletes it).

## Verification

Done when: the build is ad-hoc signed and every Mach-O verifies; T4–T8 have a result with a screenshot or log evidence in `results.md`; every failure has a fix commit and a re-test; tests and quality-check are green; and `origin/main` contains all commits. In my report I name explicitly what was not tested, and why: real microphone recording and system audio (no permission grant), real Foundry, Gatekeeper without "Open Anyway", Windows, and the Orukeet download with checksum.

---

## Results (2026-11-12, macOS 27.3 arm64, builds 1-8)

GUI driven through the visible app windows over the Chrome DevTools protocol (no computer-use tool in this session); native file and save dialogs answered through the main-process inspector; LLM a mock OpenAI-compatible server on 127.0.0.1 with a fictional key. Final build 8: ad-hoc + hardened runtime, 85 Mach-O files verified, app.asar identical to source (497 files), `npm test` 13 728 pass / 0 fail, `npm run quality-check` green.

Build: Meetscribe 1.11.1 arm64, macOS 27.3, Electron 43.8.3 (from electron-builder log)

| ID    | Test                                                                   | Result                 | Evidence                                                                                         | Fix                        |
| ----- | ---------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ | -------------------------- |
| T1.1  | Backup open-whispr                                                     | PASS                   | ditto, du 13640 KB = 13640 KB                                                                    | —                          |
| T1.2  | Baseline DB                                                            | PASS                   | notes 0, transcriptions 0, agent_conversations 0                                                 | —                          |
| T1.3a | npm test (better-sqlite3 built for Electron)                           | ENV                    | 29 failures from ABI 148 vs 137                                                                  | npm rebuild better-sqlite3 |
| T1.3b | npm test: parakeet download (4)                                        | FAIL→PASS              | macOS tar adds AppleDouble `._` entries (com.apple.provenance)                                   | 0dfc88dc                   |
| T1.3c | npm test: upsertNoteFromCloud UNIQUE pending_transcript_index          | FAIL→PASS              | UPSERT overrides OR IGNORE in triggers                                                           | a59737ff                   |
| T1.3d | npm test / quality-check                                               | PASS                   | 13715 pass, 0 fail; quality exit 0                                                               | —                          |
| T2.1  | Ad-hoc build                                                           | PASS                   | identityName=-, DMG+ZIP                                                                          | 6bcb0468                   |
| T2.2  | Signature app                                                          | PASS                   | valid on disk, adhoc,runtime, com.meetscribe.app, entitlements ok                                | —                          |
| T2.3  | All 85 Mach-O signed                                                   | PASS                   | codesign per file (universal checked separately)                                                 | —                          |
| T2.4  | Gatekeeper quarantine copy                                             | PASS (expected reject) | syspolicy_check: Adhoc Signed App + Notary Ticket Missing; spctl rejected                        | 44490cc2 (CI warning)      |
| T4.1  | First launch                                                           | FAIL→fix               | Startup Error: better_sqlite3.node NODE_MODULE_VERSION 137 vs 148 (user screenshot)              | 4a289168                   |
| T4.2  | Migration open-whispr → Meetscribe                                     | PASS                   | old folder gone, all backup files present in Meetscribe                                          | —                          |
| T4.3  | Build 2 start: Orukeet stopped during pre-warm                         | FAIL→fix               | sync-startup-preferences sent raw upstream profile (useLocalWhisper false) → main stopped sherpa | e4a48200                   |
| T4.4  | Start logs ERROR for stt-config / note-recording-config                | FAIL→fix               | "OpenWhispr API URL not configured" each start                                                   | f3779038                   |
| T5.0  | Privacy page shows account/blocked-host toggles                        | FAIL→fix               | Insights sync, leaderboard (sign in), analytics (unused), model list (blocked host, ON)          | c9719453                   |
| T5.1  | Azure URL normalised, key cleared on origin change                     | PASS                   | /openai/v1 shown; "stored key was removed" message                                               | —                          |
| T5.2  | Load models via mock, key as Bearer, key encrypted only                | PASS                   | GET /v1/models auth=Bearer sk-mo…; 0 plaintext hits; FOUNDRY_API_KEY.enc                         | —                          |
| T2.5  | Build 3 corrupt asar (xwayland.js SyntaxError, user screenshot)        | ENV (tester)           | file edited during packaging shifted 431 asar entries; rebuilt clean, verify-asar 0 diff         | —                          |
| T6.0  | Upload via drag-and-drop / audio URL                                   | N/A                    | CDP drop gives no files; loopback URL blocked by SSRF guard (correct)                            | —                          |
| T6.1  | Upload NL wav + speaker detection (dialog answered via main inspector) | PASS                   | Orukeet NL transcript, 1 speaker, 0:00-0:24                                                      | —                          |
| T6.1b | Upload note title "[Speaker 1] 0:00 - 0:24 Goedemorgen..."             | FAIL→fix               | fallback used diarization header                                                                 | 918cf9e2                   |
| T6.2  | Notes intro offers upstream BYOK providers, ignores Foundry            | FAIL→fix               | Configure an AI model: OpenAI/Anthropic/...                                                      | 1c44552c                   |
| T7.1  | Generate meeting minutes                                               | FAIL→fix               | toast "Unsupported reasoning provider: foundry"                                                  | 279eb0b9                   |
| T7.3  | Meeting chat with citations, no-match question                         | PASS                   | search_meetings 1 passage, answer [1], Sources: note/date/speaker/time; Zebra → niets gevonden   | —                          |
| T8.2  | Quit: no orphan sidecars (builds 2,4)                                  | PASS                   | no sherpa/qdrant/llama-server after quit                                                         | —                          |
| T7.1b | Minutes on build 5                                                     | PASS                   | Samenvatting/Bespreekpunten/Besluiten/Actiepunten; minutes_json 480 B, minutes_model mock-gpt    | —                          |
| T7.4a | Minutes, endpoint 500                                                  | PASS                   | "Your server is having problems right now"; minutes_json unchanged                               | —                          |
| T7.4b | Minutes, invalid JSON                                                  | PASS                   | "could not be read as meeting minutes ... Settings → Language Model"; unchanged                  | —                          |
| T7.4c | Minutes, endpoint down                                                 | PASS                   | "Couldn't reach your server"; unchanged; no crash                                                | —                          |
| T6.2  | Upload EN wav                                                          | PASS                   | English transcript; title "Good morning everyone. Thanks for joining..." (title fix)             | —                          |
| T6.4  | Edit title/own notes, search                                           | PASS                   | DB saved; ⌘K finds "zebrapad" (own text) and "testgebruikers" (transcript)                       | —                          |
| T7.2  | Export minutes as Markdown                                             | PASS                   | save dialog answered via main inspector; clean .md with checkbox                                 | —                          |
| T7.5  | Network discipline                                                     | PASS*                  | only 127.0.0.1 sockets; *sherpa listens on *:6006 (all interfaces), no bind flag → follow-up     | —                          |
| T5.3  | Settings pages scan                                                    | FAIL→fix               | "Account" heading in local-only                                                                  | 85816219                   |
| T5.4  | Share dialog: "Sync note" to Meetscribe cloud, Copy link               | FAIL→fix               | cloud sharing in local-only                                                                      | 640593c4                   |
| T5.5  | Calendars: Google/Microsoft without client id                          | FAIL→fix               | Google opens client_id=undefined OAuth                                                           | f55840ed                   |
| T8.1  | Force quit during transcription, restart                               | PASS                   | reaper killed stale sherpa; integrity_check ok; edits kept                                       | —                          |
| T8.1b | Orphan macos-mic-listener after force quit                             | FAIL→fix               | ran 10 min with PPID 1; now exits within 5 s                                                     | 0b109674                   |
| T8.2b | Clean quit via app.quit()                                              | PASS                   | no sidecars left                                                                                 | —                          |
| T6.3  | Mic permission refused path                                            | NOT RUN                | needs answering a macOS TCC dialog; no computer-use tool and TCC is a security setting           | —                          |
| T5.6  | Notes intro: Foundry form, status after restart                        | FAIL→fix               | base URL lives in main, intro read the store                                                     | 813d47e0                   |
| T2.6  | Build 7: native module check failed with no output                     | FAIL→fix               | first run of a fresh binary outlasted the 30 s timeout; module loaded in 48 ms afterwards        | 21ea742b                   |

Not run: microphone and system-audio recording (needs macOS privacy grants, which this test does not give), a 60-minute recording, a real Foundry endpoint, Windows, the Orukeet download with checksum, and Gatekeeper's Open Anyway.

Follow-ups: sherpa-onnx's websocket server listens on every interface (`*:6006`) and has no bind option; every new ad-hoc build asks again for the keychain item and the privacy permissions.
