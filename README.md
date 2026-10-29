<p align="center">
  <img src="assets/orbit-banner-v1.png" alt="Orbit — a black singularity surrounded by flowing gravitational waves and orbiting spheres" width="1000">
</p>

# ORBIT!!

### a personal AI assistant. with a BLACK HOLE in the middle.

I wanted an assistant that felt like something was actually there on my desktop. something I could talk to, ask to do things, and come back to later. and obviously it needed an unnecessarily dramatic opening sequence.

so… Orbit!!!

The center is an interactive singularity: move your cursor through it and the nearby black surface warps away. little spheres orbit around it, gravitational strands keep moving, and the waves react when it speaks. Above it is what you asked. Below it is what Orbit is doing. Tasks sit on the right, and everything else lives in the side menu.

**[LOOK AT IT →](https://myorbit.pages.dev/)** · [run it yourself](#okay-how-do-i-run-it) · [privacy + security](SECURITY.md)

> **QUICK THING BEFORE YOU START:** the website is the visual demo. The actual assistant runs locally on your computer and needs **your own Groq API key**. Visiting the site doesn't give you a working connection to my assistant, my account, or my computer.

## okay but does it actually DO anything??

YES. here's what's connected:

| Thing | What you get |
| --- | --- |
| **Talk or type** | Text chat through Groq’s GPT-OSS 120B, plus microphone input using Groq transcription. |
| **It talks back!!** | Kokoro speech generated locally after the initial model download. The waves and speaking indicator follow the audio. |
| **Use supported apps** | Read exposed interface controls, enter text, press buttons, and check what happened. Requires permission first. |
| **Spotify** | Search for music and use the requested song or playlist’s playback controls, with verification. |
| **Tasks + reminders** | See current work and schedule supported actions in Upcoming. |
| **Past chats** | Saved conversations you can reopen and continue. |
| **Workspace** | Upload files, keep them together, and ask about supported extracted text or transcripts. |
| **The whole black-hole situation** | Cursor distortion, moving strands, orbiting particles, speech reactions, and the opening sequence. because WHY NOT. |

**“supported apps” matters here.** Orbit uses macOS Accessibility or Windows UI Automation. If an app doesn't expose readable controls, Orbit can't magically see through it. Games, canvas interfaces, custom controls, and elevated windows can be unavailable. This isn't universal visual control of every app.

## getting it from “looks cool” to “actually works”

The visuals were the starting point. Making the assistant do the right thing was the harder part.

Spotify was a good example. Opening it was easy. Getting it to play the REQUESTED playlist instead of casually resuming whatever was already playing?? considerably less easy. The workflow now looks for the playlist’s own controls and checks playback instead of treating “button clicked” as success.

Then Groq’s free limits arrived to humble the whole operation. Sending the same huge app context over and over was expensive in tokens, so requests now carry smaller observations and only the relevant tools. Common exact commands can run locally without an AI request at all.

The offline comparison showed **41% less input text** across a six-step app simulation and **96% less** for a simple question. Those measure serialized input characters, **not exact token savings**. Real usage depends on what you're asking and what the app exposes.

## okay how do I run it?

You'll need:

- **Node.js 22+** and [pnpm](https://pnpm.io/installation).
- macOS or Windows for computer controls.
- Your own Groq account + API key. Keep the account on its **Free plan** if you want free usage.
- Internet for Groq and the first Kokoro model download. Once cached, speech synthesis happens locally.

```sh
git clone https://github.com/karamvschool-ai/Orbit.git
cd Orbit
pnpm install
pnpm dev
```

Open **http://localhost:5173**. Go to **Settings → Groq API key**, enter your key there, and save it.

**PLEASE don't paste the key into a chat, GitHub issue, screenshot, or source file.** Settings saves it privately on your device; the state API doesn't return it.

A few things to try:

- “Explain what an event horizon is in one sentence.”
- “Open Spotify.”
- “Set volume to 30%.”
- “Play my Summer? playlist in Spotify.”
- “Remind me tomorrow at 4 PM to review my notes.”

Scheduling currently uses **America/New_York**. Be clear about the date and time. Orbit needs to stay running, and your computer needs to stay awake, for reminders to happen on time.

### want the desktop app?

```sh
pnpm desktop
```

That starts the Electron app with its own local engine. A packaged installation doesn't need you to keep a terminal open or install Node separately. Each device still needs its own local setup with your Groq key.

For app interaction, enable **Settings → Allow app interaction**. On macOS, grant Orbit the requested Accessibility / Device Control and Data Access permission in System Settings. On Windows, Orbit can't control apps running with higher privileges than itself.

Closing the window keeps it in the menu bar or tray. **Quitting stops the engine.** There's no automatic updater yet.

### build an installer

```sh
pnpm package:mac   # Apple Silicon .dmg — requires macOS and Swift tools
pnpm package:win   # Windows x64 NSIS .exe
```

Output goes into `releases/`, which is excluded from Git. Mac builds use a local ad-hoc signature; Windows builds are unsigned. These aren't paid-certificate-signed or notarized releases, so OS warnings are possible.

**Windows note:** the adapters have automated coverage, but native app control still needs testing on an actual Windows PC. I'm not calling that fully verified just because a test passed on a Mac.

## files, keys, and the “free” part

A few things I want to be REALLY clear about:

- **Bring your own key.** There is no shared Groq key or hosted AI proxy in this repo. Cloning it doesn't give anyone access to my chats, files, quota, or computer.
- **Your data is local, but AI processing isn't entirely local.** Prompts, recent context, selected file excerpts, tool results, and audio for transcription go to Groq. With app control enabled, relevant visible app text goes there too. Kokoro synthesis stays on your device.
- **Free has limits.** Orbit displays reported quota, keeps requests smaller, and bounds retry waits. It doesn't rotate accounts or switch to a paid fallback. It also can't detect your billing plan from a key: keys from paid organizations can still incur charges.
- **The workspace has limits too.** Text/code, Markdown, JSON, CSV, text PDFs, and DOCX can be read. Supported audio/video files can produce audio transcripts. Images can be previewed, but GPT-OSS here does **not** understand image contents, scanned PDFs, or video frames. Upload limit: **25 MB per file**.
- **Keep your data folder PRIVATE.** Development data lives in `.orbit-data/`. In the desktop app, use **Help → Open private data folder**. That folder and its backups can contain keys, chats, uploads, and schedules. **Import existing Orbit data…** lets you migrate your own data, with a backup first.
- **The engine belongs on localhost.** It binds to `127.0.0.1`, checks Host and Origin, and uses a private session token in desktop mode. Don't expose it with a public tunnel or reverse proxy. The [security guide](SECURITY.md) explains the boundaries and known dependency advisory.

## for anyone looking through the code

The interface is HTML, CSS, and JavaScript. Node runs the local engine, Electron wraps the desktop app, and native adapters handle supported computer actions. Groq handles chat/transcription; Kokoro handles local speech.

```text
app.js, style.css         UI, conversations, tasks, settings
singularity.js           The black hole!!
core-field.js            Field rendering
fluid-simulation.js      Fluid effects
startup.js               The dramatic entrance
speech-playback.js       Audio playback + reactive metering
server/                  Groq, tools, storage, speech, platform adapters
native/                  macOS Accessibility helper source
desktop/                 Electron shell + app lifecycle
scripts/                 Local server, builds, packaging, measurements
tests/                   Regression tests
assets/                  Visuals + media credits
```

```sh
pnpm test
pnpm build
node scripts/measure-token-efficiency.mjs
```

Tests cover things like saved state, scheduling, file boundaries, quota handling, scoped app actions, Spotify verification, new-chat/message safeguards, cancellation, and desktop session access. They use isolated temporary data and mock model calls. **No real key or real message sending required.**

`pnpm build` creates the static frontend in `dist/` from an allowlist. It doesn't bundle your local engine, key, chats, uploads, or schedules. Deploying that folder gives you the visual website, not a public computer-control API.

## the unfinished bits

This is still a personal project. Interfaces change, controls can be unreadable, and AI can make mistakes. Finding a profile isn't the same as sending a message. Stopping a request prevents later actions, but **it can't undo something already done**. Keep a human around for consequential actions.

Groq `429` means usage limits; `403` means access restrictions. A VPN or network policy can affect access, and Orbit can't override that. There's no cloud scheduler, remote computer access, room-light integration, or bundled local chat-model fallback yet.

## credits!!

AI coding assistance was used throughout development. The Orbit banner is AI-generated brand artwork. The opening-sequence source media is credited to **NASA’s Goddard Space Flight Center / Jeremy Schnittman**, displayed in monochrome. [Full media credits](assets/STARTUP-CREDITS.md). No NASA endorsement is implied.

Found a bug? Tell me what you asked, what happened, and what should've happened. **Leave out keys, personal messages, and private file contents.** For a vulnerability, use the [private reporting instructions](SECURITY.md#reporting-a-vulnerability).
