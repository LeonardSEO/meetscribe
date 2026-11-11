<h1 align="center">Lokale vergaderassistent</h1>

<p align="center">
  Een desktopapp voor macOS (Apple Silicon) en Windows (x64) die vergaderingen opneemt, lokaal transcribeert, er gestructureerde notulen van maakt en vragen over eerdere vergaderingen beantwoordt, met bronvermelding.
</p>

---

## Wat is dit

Deze app is een fork van [OpenWhispr](https://github.com/OpenWhispr/openwhispr) (MIT), omgebouwd tot een lokale vergaderassistent zonder account.

- **Local-only.** Er is geen account, geen synchronisatie, geen team- of betaalfunctie en geen verkeer naar OpenWhispr-diensten; die hosts worden geblokkeerd. Opnames, transcripten en notulen blijven in een lokale database op je computer.
- **Spraakherkenning: Orukeet.** Dit is de enige spraakengine. Het model wordt bij de eerste start gedownload en gecontroleerd met een SHA-256-checksum. Transcriptie is bedoeld om offline te werken; dat is nog niet handmatig geverifieerd. Op macOS vereist Orukeet macOS 15.5 of nieuwer. Ontbreekt het model of is de download corrupt, dan krijg je een melding en blijft de opname bewaard; er is nooit een terugval op een clouddienst.
- **Notulen.** Het ingebouwde sjabloon Minutes maakt samenvatting, onderwerpen, besluiten en actiepunten. Je kunt ze bewerken, opnieuw laten genereren en als Markdown exporteren.
- **Chat over vergaderingen.** Transcripten worden lokaal in passages geïndexeerd (FTS5, geen vectorzoekopdracht). Vraag bijvoorbeeld "Wat hebben we vorige week besloten over project X?" en het antwoord noemt genummerde bronpassages die je kunt controleren. Als er niets gevonden wordt, zegt de assistent dat.
- **Alleen het AI-endpoint gebruikt het netwerk.** Samenvattingen, notulen en chat gaan naar het LLM-endpoint dat jij instelt. Opnemen, transcriberen en zoeken zijn bedoeld om zonder netwerk te werken; dat is nog niet handmatig geverifieerd (zie [docs/manual-acceptance.md](docs/manual-acceptance.md)).

## AI-endpoint instellen (Azure AI Foundry)

Alle AI-functies gebruiken één provider, `foundry`: Azure AI Foundry via de OpenAI-compatibele v1-API, of een andere OpenAI-compatibele server.

1. Open Instellingen en ga naar het Foundry-onderdeel (of vul het in tijdens de eerste start).
2. Plak het endpoint. Elke gangbare Azure-vorm werkt (resource-URL, projectendpoint, met of zonder `/openai/deployments/...?api-version=...` of slash aan het eind); de app maakt er `/openai/v1` van.
3. Kies de wire-API en vul de modelnaam (deployment) en je API-key in.
4. De key wordt versleuteld opgeslagen via de sleutelhanger van het besturingssysteem (macOS Keychain, Windows DPAPI), nooit in de database, een `.env`-bestand of localStorage. Het endpoint en de wire-API staan (niet geheim) in het `.env`-bestand van het hoofdproces.
5. Wijzig je het endpoint naar een andere herkomst (origin), dan wordt de opgeslagen key gewist en moet je de key opnieuw invoeren, zodat een key nooit naar een nieuwe host gaat.

Zonder geldige configuratie blijven transcript en bestaande notulen ongemoeid; de melding wijst naar Instellingen. Entra ID wordt in deze versie niet ondersteund, alleen een API-key.

## Bouwen

Vereist Node.js 24 (zie `.nvmrc`; gebruik `npm ci`, regenereer `package-lock.json` niet met een andere major).

```bash
npm ci
npm run dev                # ontwikkelen
npm test                   # testsuite
npm run quality-check      # registry-controle, formattering, typecheck
npm run build:local:mac    # macOS Apple Silicon, niet ondertekend
npm run build:local:win    # Windows x64, op een Windows-machine, niet ondertekend
```

De lokale builds zijn niet ondertekend en niet genotarieerd; ondertekende installers en een eigen update-feed vragen om eigen certificaten. Wat nog handmatig getest moet worden staat in [docs/manual-acceptance.md](docs/manual-acceptance.md).

## Licenties en toeschrijving

- **Software:** gebaseerd op OpenWhispr, MIT-licentie. De licentietekst en het copyright van OpenWhispr staan in de [OpenWhispr-repository](https://github.com/OpenWhispr/openwhispr/blob/main/LICENSE).
- **Spraakmodel Orukeet** door Oruk AI ([huggingface.co/oruk/orukeet](https://huggingface.co/oruk/orukeet)), afgeleid van NVIDIA Parakeet TDT 0.6B v3, onder **CC BY-SA 4.0**. Het model wordt gedownload, niet in de broncode meegeleverd. Wijzigingen aan het model vallen onder dezelfde licentie. Zie [NOTICE](NOTICE).

---

# Oorspronkelijke OpenWhispr-documentatie

De rest van dit bestand is de README van het upstream-project. Functies als accounts, cloudsynchronisatie, teams en cloudproviders zijn in deze fork uitgeschakeld.

<p align="center">
  <img src="src/assets/logo.svg" alt="OpenWhispr" width="120" />
</p>

<h1 align="center">OpenWhispr</h1>

<p align="center">
  <a href="https://github.com/OpenWhispr/openwhispr/blob/main/LICENSE"><img src="https://img.shields.io/github/license/OpenWhispr/openwhispr?style=flat" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat" alt="Platform" />
  <a href="https://github.com/OpenWhispr/openwhispr/releases/latest"><img src="https://img.shields.io/github/v/release/OpenWhispr/openwhispr?style=flat&sort=semver" alt="GitHub release" /></a>
  <a href="https://github.com/OpenWhispr/openwhispr/releases"><img src="https://img.shields.io/github/downloads/OpenWhispr/openwhispr/total?style=flat&color=blue" alt="Downloads" /></a>
  <a href="https://github.com/OpenWhispr/openwhispr/stargazers"><img src="https://img.shields.io/github/stars/OpenWhispr/openwhispr?style=flat" alt="GitHub stars" /></a>
</p>

<p align="center">
  The open-source and free alternative to WisprFlow and Granola.<br/>
  Privacy-first voice-to-text dictation with AI agents, meeting transcription, and notes. Cross-platform for macOS, Windows, and Linux.
</p>

<p align="center">
  <a href="https://openwhispr.com">Website</a> &middot;
  <a href="https://docs.openwhispr.com">Docs</a> &middot;
  <a href="https://github.com/OpenWhispr/openwhispr/releases/latest">Download</a> &middot;
  <a href="https://docs.openwhispr.com/api/overview">API</a> &middot;
  <a href="https://github.com/OpenWhispr/openwhispr/blob/main/CHANGELOG.md">Changelog</a>
</p>

---

OpenWhispr turns your voice into text, notes, and actions from your desktop. Press a hotkey, speak, and your words appear at your cursor. Choose between fully private offline transcription with local speech-to-text models like Orukeet, Whisper, NVIDIA Parakeet, and Cohere Transcribe — where your audio never leaves your device — or cloud processing for speed. No data collection, no telemetry, fully open source.

## Download

| Platform              | Download                                                                                                                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS (Apple Silicon) | [`.dmg`](https://github.com/OpenWhispr/openwhispr/releases/latest)                                                                                                                                                                                                                        |
| macOS (Intel) \*      | [`.dmg`](https://github.com/OpenWhispr/openwhispr/releases/latest)                                                                                                                                                                                                                        |
| Windows               | [`.exe`](https://github.com/OpenWhispr/openwhispr/releases/latest)                                                                                                                                                                                                                        |
| Linux                 | [`.AppImage`](https://github.com/OpenWhispr/openwhispr/releases/latest) / [`.deb`](https://github.com/OpenWhispr/openwhispr/releases/latest) / [`.rpm`](https://github.com/OpenWhispr/openwhispr/releases/latest) / [`.tar.gz`](https://github.com/OpenWhispr/openwhispr/releases/latest) |

\* On Intel Macs, live speaker identification and voice fingerprinting are unavailable: they depend on ONNX Runtime, which [stopped shipping macOS x86_64 binaries in 1.24](https://github.com/microsoft/onnxruntime/releases/tag/v1.24.1). Meetings still record and transcribe normally, and notes search falls back to keyword matching instead of semantic search.

On macOS or x86_64 Linux, you can also install the community-maintained [Homebrew cask](https://formulae.brew.sh/cask/openwhispr):

```bash
brew install --cask openwhispr
```

## Features

- **Voice dictation** — global hotkey to dictate into any app with automatic pasting
- **Dictation translation** — dedicated hotkey to dictate in one language and paste the text in another
- **AI agent** — talk to GPT-5, Claude, Gemini, Groq, Tinfoil, OpenRouter, or local models with a named voice assistant
- **Voice Assistant hotkey** — dedicated hotkey that sends what you say straight to your AI assistant as a command, no wake word needed and no cleanup pass; highlighted text is edited in place. With auto-paste enabled, answers paste at a focused text cursor or stream into a floating panel and copy to the clipboard when no writable cursor is available. You can also opt in to sending a screenshot of your current screen as context
- **Meeting transcription** — auto-detect Zoom, Teams, and FaceTime calls with live speaker diarization, voice fingerprinting, and Google, Microsoft, or Apple Calendar integration
- **Local speaker diarization** — on-device speaker labelling with voice fingerprint recognition across meetings, no cloud required
- **Notes** — create, organize, and search notes with folders, semantic search, cloud sync, and AI actions
- **Team spaces & sharing** — free for signed-in users; share notes on the web with link, domain, or invite-only visibility, and collaborate in team spaces with roles, invitations, and server-enforced membership
- **Audio import** — transcribe existing audio and video: drag in files, batch-upload, or paste a YouTube/audio URL, with optional speaker detection
- **Local or cloud — your choice** — all core features (transcription, AI reasoning, speaker diarization, semantic search) work with local models or cloud providers — including GPU-accelerated local Whisper on Metal, CUDA, and Vulkan (AMD/Intel)
- **Enterprise controls** — enforce organization policy, company SSO and SCIM, and centrally managed Amazon Bedrock or Azure OpenAI access without distributing cloud keys
- **Public API & MCP** — manage notes and transcriptions programmatically or connect your AI assistant via the [MCP server](https://docs.openwhispr.com/integrations/mcp)

## Quick start

```bash
git clone https://github.com/OpenWhispr/openwhispr.git
cd openwhispr
npm install
npm run dev
```

Requires Node.js 24+. See the [full documentation](https://docs.openwhispr.com/quickstart) for setup guides, platform-specific instructions, and build details.

The commands above run the desktop application, which remains at the repository root. The Expo mobile application lives in [`openwhispr-mobile`](openwhispr-mobile/) with its own dependencies, lockfile, build configuration, and release process. See the [mobile README](openwhispr-mobile/README.md) for its setup instructions.

## Documentation

Visit **[docs.openwhispr.com](https://docs.openwhispr.com)** for:

- [Getting started](https://docs.openwhispr.com/quickstart)
- [Platform guides](https://docs.openwhispr.com/platform/macos) (macOS, Windows, Linux)
- [API reference](https://docs.openwhispr.com/api/overview)
- [MCP server setup](https://docs.openwhispr.com/integrations/mcp)
- [Troubleshooting](https://docs.openwhispr.com/troubleshooting)

Repo examples:

- [Custom ASR shim](examples/custom-asr-shim/) for Self-Hosted transcription against non-OpenAI-compatible ASR APIs

## Tech stack

React 19, TypeScript, Tailwind CSS v4, Electron 41, better-sqlite3, whisper.cpp, sherpa-onnx, shadcn/ui

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=OpenWhispr/openwhispr&type=date&legend=top-left)](https://www.star-history.com/#OpenWhispr/openwhispr&type=date&legend=top-left)

## Sponsors

<p align="center">
  <a href="https://console.neon.tech/app/?promo=openwhispr">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
      <img width="250" alt="Neon" src="https://neon.com/brand/neon-logo-light-color.svg">
    </picture>
  </a>
</p>

<p align="center"><a href="https://console.neon.tech/app/?promo=openwhispr">Neon</a> is the serverless Postgres platform powering OpenWhispr Cloud.</p>

## Contributing

We welcome contributions. Fork the repo, create a feature branch, and open a pull request. See the [contributing guide](https://docs.openwhispr.com/contributing) for development setup and guidelines.

## License

Based on OpenWhispr, [MIT](https://github.com/OpenWhispr/openwhispr/blob/main/LICENSE).

## Acknowledgments

- **[OpenAI Whisper](https://github.com/openai/whisper)** — speech recognition model powering local and cloud transcription
- **[whisper.cpp](https://github.com/ggerganov/whisper.cpp)** — high-performance C++ implementation for local processing
- **[NVIDIA Parakeet](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)** — fast multilingual ASR model
- **[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)** — cross-platform ONNX runtime for Parakeet inference
- **[Hugging Face](https://huggingface.co/)** — model hub hosting Whisper, Parakeet, and embedding model weights
- **[llama.cpp](https://github.com/ggerganov/llama.cpp)** — local LLM inference for AI text processing
- **[Electron](https://www.electronjs.org/)** — cross-platform desktop framework
- **[React](https://react.dev/)** — UI component library
- **[shadcn/ui](https://ui.shadcn.com/)** — accessible components built on Radix primitives
- **[Neon](https://console.neon.tech/app/?promo=openwhispr)** — serverless Postgres powering OpenWhispr Cloud
