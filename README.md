# Orbit

**A personal AI assistant with a little gravity.**

Orbit pairs an interactive black-hole interface with voice and text conversations, a file workspace, scheduled tasks, and local desktop controls. The singularity bends around your cursor, its waves respond to speech, and the interface shows what you asked and what the assistant is doing.

[Explore the visual demo](https://myorbit.pages.dev/) · [Setup](#quick-start) · [Privacy and security](SECURITY.md)

<p align="center">
  <img src="assets/startup-black-hole.jpg" alt="Black-hole visualization used in Orbit’s monochrome opening sequence" width="800">
</p>

*Opening-sequence source: NASA’s Goddard Space Flight Center / Jeremy Schnittman. [Media credits](assets/STARTUP-CREDITS.md).*

> **The public website is a visual demo.** The working assistant runs on your computer. This repository does not provide a shared API key, a public AI proxy, or remote access to the developer’s computer. Each user supplies their own Groq key locally.

## What it does

| Feature | How it works |
| --- | --- |
| Text and voice conversations | GPT-OSS 120B through Groq; microphone recordings use Groq transcription. |
| Spoken replies | Kokoro generates speech locally after an initial model download. |
| App interaction | With explicit opt-in and OS permission, reads supported app controls, enters text, presses buttons, and checks the result. |
| Music controls | Searches Spotify, uses the requested song or playlist’s controls, and verifies supported playback state. |
| Tasks and reminders | Persists scheduled supported actions and displays upcoming work. Orbit must stay running and the computer awake. |
| Saved conversations | Stores chats locally so you can return to them. |
| File workspace | Stores your uploads and reads extracted document text or audio transcripts. |
| Reactive visuals | Animated gravitational strands, orbiting particles, cursor distortion, audio-reactive waves, and a cinematic opening. |

App control uses macOS Accessibility or Windows UI Automation. It depends on controls the application exposes: it is **not universal screen control**. Games, canvas interfaces, elevated windows, and custom controls may be unreadable. Orbit stops when it cannot verify a destination or outcome.

## Quick start

### Requirements

- Node.js **22 or newer** and [pnpm](https://pnpm.io/installation).
- macOS or Windows for computer-control features.
- Your own Groq account and API key. To stay within free usage, keep the account on the **Free plan**.
- Internet for Groq and the initial Kokoro model download. Speech synthesis runs locally after the model is cached.

```sh
git clone https://github.com/karamvschool-ai/Orbit.git
cd Orbit
pnpm install
pnpm dev
```

Open **http://localhost:5173**, then enter your key in **Settings → Groq API key**. Never paste a key into a conversation, issue, or source file. The key is stored privately on your device and is not returned by the state API.

Try:

- “Explain what an event horizon is in one sentence.”
- “Open Spotify.”
- “Set volume to 30%.”
- “Play my Summer? playlist in Spotify.”
- “Remind me tomorrow at 4 PM to review my notes.”

Scheduling currently uses **America/New_York**. Give a clear date and time; reminders only run while the engine is active.

### Run as a desktop app

```sh
pnpm desktop
```

The desktop app starts its own local engine. Once packaged, it does not need a separate Node installation or terminal. Enter your own key on each device.

To enable app interaction, turn on **Settings → Allow app interaction**. On macOS, grant Orbit the requested Accessibility / Device Control and Data Access permission in System Settings. Windows uses UI Automation and cannot control apps running with higher privileges than Orbit.

Closing the window keeps Orbit in the menu bar or tray so reminders can run. **Quit** stops the engine. There is currently no automatic updater.

### Build installers

```sh
pnpm package:mac   # Apple Silicon .dmg; requires macOS and Swift tools
pnpm package:win   # Windows x64 NSIS .exe
```

Installers are written to `releases/` and are excluded from Git. Mac builds use a local ad-hoc signature; Windows builds are unsigned. Neither is notarized or signed with a paid certificate. Native Windows control still needs verification on a Windows PC; adapter tests alone do not establish full Windows compatibility.

## Your data and API usage

- **No shared credentials:** cloning this repository does not give anyone access to the developer’s Groq account, chats, uploads, or computer.
- **Local storage:** development data lives in `.orbit-data/`. In the desktop app, **Help → Open private data folder** shows the actual location. Use **Import existing Orbit data…** to migrate your own data; Orbit makes a backup first. Do not publish that folder or its backups.
- **What goes to Groq:** prompts, recent chat context, selected file excerpts, tool results, and microphone/audio content for transcription. With app control enabled, relevant visible app text also goes to Groq. Kokoro synthesis stays local.
- **File support:** text/code, Markdown, JSON, CSV, text PDFs, and DOCX; supported audio/video uploads can yield audio transcripts. GPT-OSS does **not** interpret images, scanned PDFs, or video frames here. Unsupported files are retained with a capability note. Maximum upload: 25 MB per file.
- **Free limits still apply:** Orbit shows reported usage and limits repeated waits. Common exact commands run locally, and AI requests use compact context and relevant tools. There is no automatic paid fallback or account rotation. Orbit cannot determine the billing plan from a key: a key belonging to a paid organization can incur that organization’s charges.
- **Local service only:** the engine binds to `127.0.0.1`, checks request Host and Origin, and uses a private session token in desktop mode. It is not designed to be exposed through a tunnel, reverse proxy, or public server. See [SECURITY.md](SECURITY.md) for the trust boundaries.

## Development

```sh
pnpm test
pnpm build
node scripts/measure-token-efficiency.mjs
```

`pnpm build` produces an allowlisted static frontend in `dist/`. It excludes the local engine, API key, chats, uploads, and schedules. Publishing that directory does not publish a working AI or computer-control endpoint.

The offline efficiency fixture compares version 1.2.4 with 1.2.3: simple-question input text fell by 96%, and a six-step app simulation by 41%. “Open Spotify” changed from two model calls to zero. These are **serialized input-character measurements**, not exact token savings or a guarantee for every request.

Tests cover persistence, scheduling, file boundaries, quota handling, scoped app actions, search/playback verification, new-chat and message safeguards, cancellation, and desktop session authentication. They use isolated temporary data and mock model calls; they do not require a real Groq key or send real messages.

### Project layout

```text
app.js, style.css         Interface, conversations, tasks, settings
singularity.js           Black-hole scene and interaction
core-field.js            Field rendering
fluid-simulation.js      Fluid effects
startup.js               Opening sequence
speech-playback.js       Audio playback and reactive metering
server/                  Groq, local tools, storage, speech, platform adapters
native/                  macOS Accessibility helper source
desktop/                 Electron shell and app lifecycle
scripts/                 Development server, builds, packaging, measurements
tests/                   Automated regression tests
assets/                  Visual media and attribution
```

## Known limits

Orbit is a personal project under active development. App actions can fail when an interface changes or exposes incomplete controls. Finding a profile is not proof of message delivery, and the assistant should not be trusted to complete sensitive actions unattended. Stopping a request prevents subsequent actions but cannot undo completed ones.

Groq `429` errors indicate usage limits; `403` errors indicate access restrictions. VPNs or network policies may affect access. Orbit cannot override provider restrictions. There is no cloud scheduler, remote computer access, room-device integration, or bundled local chat-model fallback.

For a security concern, follow [the reporting guidance](SECURITY.md). Please remove credentials, personal messages, and identifying file contents from screenshots or logs before sharing them.
