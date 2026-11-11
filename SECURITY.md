# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it through [GitHub's private vulnerability reporting](https://github.com/LeonardSEO/meetscribe/security/advisories/new).
Only the latest version of Meetscribe receives security fixes.

## Scope

In scope:

- Code execution through a crafted audio file or transcription output
- Privilege escalation through the bundled native helpers
- Exposure of the stored API key for the AI endpoint
- Cross-site scripting (XSS) in the Electron renderer
- Insecure IPC between the main and renderer processes
- Supply chain attacks through dependencies or native compilation

Out of scope:

- Issues that require physical access to an already unlocked computer
- Denial of service against the local app
- Social engineering

## Security model

- **Local processing.** Recordings are transcribed on the computer itself with Orukeet. Only
  summaries, minutes and chat go to the AI endpoint the user configures.
- **Key storage.** The AI endpoint's API key is stored encrypted through the operating system's
  keychain (macOS Keychain, Windows DPAPI), never in the database, `.env` or localStorage. A new
  endpoint on a different origin deletes the stored key.
- **Native helpers** are compiled from source during the build.
- **Context isolation.** The renderer runs with context isolation and a restricted preload bridge.
