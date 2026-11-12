<p align="center">
  <img src="src/assets/logo.svg" alt="" width="96" height="96" />
</p>

<h1 align="center">Meetscribe</h1>

<p align="center">
  <strong>Your meetings recorded, transcribed and turned into minutes, on your own computer.</strong>
</p>

<p align="center">
  macOS (Apple Silicon) · Windows (x64) · no account · based on <a href="https://github.com/OpenWhispr/openwhispr">OpenWhispr</a>
</p>

---

Meetscribe is a desktop app that records meetings, transcribes them locally, turns them into structured minutes and answers questions about past meetings with references to what was actually said. There is no account and no cloud storage: recordings, transcripts and minutes stay on your computer. Meetscribe uses an AI endpoint only for summaries, minutes and chat, and you choose that endpoint yourself.

> **Meetscribe is a fork of [OpenWhispr](https://github.com/OpenWhispr/openwhispr)** (MIT license), an open-source dictation and notes app. We rebuilt OpenWhispr into a local meeting assistant: accounts, sync, teams, paid features and every OpenWhispr service have been removed or turned off. Most of the work under the hood, such as the recording and audio pipeline, the editor and the note storage, comes from the OpenWhispr team. Meetscribe is not an official OpenWhispr product and is not maintained by them.

## Features

|                                   |                                                                                                                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Recording**                     | Records your microphone and the meeting's system audio (Teams, Zoom, Meet in the browser) and tells speakers apart afterwards.                                                      |
| **Local transcription**           | Speech recognition with [Orukeet](https://huggingface.co/oruk/orukeet), entirely on your own computer. No audio goes to the cloud.                                                  |
| **Minutes**                       | The _Minutes_ template writes a summary, topics, decisions and action items. Edit them, regenerate them and export them as Markdown.                                                |
| **Questions about past meetings** | Ask, for example, _"What did we decide about project X last week?"_ The answer cites numbered passages with the meeting, speaker and time. If Meetscribe finds nothing, it says so. |
| **Your own AI endpoint**          | Azure AI Foundry or any other OpenAI-compatible server. Your API key is stored encrypted in your operating system's keychain.                                                       |

## Privacy

- **No account, no sync.** There is nothing to sign in to, and nothing is sent to a Meetscribe or OpenWhispr server. The app actively blocks OpenWhispr's hosts.
- **Audio stays local.** Recording, transcription and search happen on your computer.
- **One outgoing connection for AI.** For summaries, minutes and chat, text (never audio) goes to the endpoint you configure. Without an endpoint, everything except those three features works.
- **Verified downloads.** The speech model is downloaded on first launch and checked against a pinned SHA-256 checksum. If it is missing or corrupt, you get a message and your recording is kept; Meetscribe never falls back to a cloud service.

## Requirements

| Platform | Requires                           |
| -------- | ---------------------------------- |
| macOS    | Apple Silicon, macOS 15.5 or later |
| Windows  | Windows 10 or later, x64           |

Intel Macs and Linux are not supported. The interface is available in English and ten other languages, but not yet in Dutch; transcription does work in Dutch.

## Installation

There are no ready-made downloads yet. Build the app yourself (see [Development](#development)); the installer ends up in `dist/`.

The macOS build is signed ad-hoc (no Apple Developer ID, not notarized) and the Windows installer is not signed, so your operating system warns you on first launch:

- **macOS:** open Meetscribe once and dismiss the message. Go to **System Settings → Privacy & Security**, choose **Open Anyway** at the bottom and confirm. An ad-hoc signature changes with every build, so after installing a new build macOS asks again whether Meetscribe may use its keychain item ("Meetscribe Safe Storage", where the API key is kept encrypted) and may ask for microphone, system audio and accessibility access again. Meetscribe waits on the keychain question before its window opens; choose **Always Allow**.
- **Windows:** in the SmartScreen window, choose **More info** and then **Run anyway**.

With an Apple Developer ID certificate in the repository secrets (`APPLE_CERTIFICATE_BASE64`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID`), the release workflow signs with it and notarizes instead.

On first launch, Meetscribe asks for access to your microphone, system audio and (optionally) your calendar.

## Setting up the AI endpoint

Meetscribe works with Azure AI Foundry (the OpenAI-compatible v1 API) or any other OpenAI-compatible server.

1. Open **Settings** and go to the Foundry section, or fill it in during first launch.
2. Paste your endpoint. Any common Azure URL works: a resource URL or a project endpoint, with or without `/openai/deployments/...?api-version=...`. Meetscribe converts it to `/openai/v1` itself.
3. Choose the API style, enter the model name (deployment) and paste your API key.

Good to know:

- The API key is stored encrypted through macOS Keychain or Windows DPAPI, never in the database, a configuration file or browser storage.
- If you change the endpoint to a different domain, Meetscribe deletes the stored key, so a key is never sent to a host it wasn't meant for.
- Without a valid configuration, transcripts and existing minutes are left untouched, and the message points to Settings.
- Only API keys are supported; signing in with Entra ID is not yet.

## Development

Requires Node.js 24 (pinned in `.nvmrc`). Use `npm ci`, and don't regenerate `package-lock.json` with a different Node version.

```bash
npm ci
npm run dev                # start the app in development mode
npm test                   # test suite
npm run quality-check      # registry check, formatting and typecheck
npm run build:local:mac    # macOS Apple Silicon, ad-hoc signed
npm run build:local:win    # Windows x64, on a Windows computer, unsigned
```

What still needs to be tested by hand is listed in [docs/manual-acceptance.md](docs/manual-acceptance.md). For contributions and security reports, see [CONTRIBUTING](.github/CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Status

Meetscribe is under active development. A few things have not been verified by hand yet, including transcription without a network connection and long recordings on Windows; the full list is in [docs/manual-acceptance.md](docs/manual-acceptance.md).

## Licenses and attribution

- **Meetscribe** is based on [OpenWhispr](https://github.com/OpenWhispr/openwhispr), released under the MIT license. OpenWhispr's copyright notice and license text are in the [OpenWhispr repository](https://github.com/OpenWhispr/openwhispr/blob/main/LICENSE). Our thanks go to the OpenWhispr team.
- **Orukeet speech model** by Oruk AI ([huggingface.co/oruk/orukeet](https://huggingface.co/oruk/orukeet)), derived from NVIDIA Parakeet TDT 0.6B v3, under **CC BY-SA 4.0**. The model is downloaded on first launch and is not included in this repository.

See [NOTICE](NOTICE) for all notices.
