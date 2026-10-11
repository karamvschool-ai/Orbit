# Orbit

Orbit's animated frontend now connects to a local Mac companion. The deployed static page is separate; these assistant changes run on localhost.

## Run

Requires Node.js 20.19+ (Node 22+ recommended) and macOS for computer tools.

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173. Enter your **Groq Free-plan API key in Settings**, not in chat. The key is saved in `.orbit-data/config.json` with owner-only permissions. `.orbit-data/` is Git-ignored and never served as a static directory. Replace a key pasted into any chat with a newly generated key in Settings.

The current Mac's bundled Codex Node runtime can also start the server using `scripts/start-local.zsh`.

## Features

- Groq `openai/gpt-oss-120b` text chat and local tool calling. The current request, action status, actual tool results, and final reply drive the home UI.
- Voice input records up to 90 seconds, then uses Groq `whisper-large-v3-turbo`. Grant microphone permission when prompted. Recording is explicit: click the microphone to start and click again to submit.
- Kokoro 82M runs locally on CPU behind `/api/speech`. Its quantized model downloads from Hugging Face once (roughly 100 MB plus voice data), then uses the local cache. No hosted speech billing. Replies are spoken automatically; Settings selects the voice or disables speech. Response options offer Read aloud and Stop speaking.
- Persistent conversations, full chat history, continue/new/delete controls.
- Persistent workspace uploads (25 MB per file). Readable formats: text/code, Markdown, JSON, CSV, text PDFs, DOCX. Audio and audio tracks in supported videos are transcribed through Groq. Images can be previewed but **GPT-OSS does not interpret their visuals**; scanned PDFs and unsupported formats are retained with an explicit capability note. Selected extracted text/transcripts go to Groq. Text is limited to 1,000,000 stored characters; model context uses relevant excerpts.
- Real Mac tools: list/open installed apps, open HTTP(S) websites and workspace files, read/set output volume, control Music/Spotify playback. No arbitrary shell commands or general screen clicking. macOS may request Automation access for media controls.
- Natural-language reminders and scheduled supported computer actions. Upcoming tasks are sorted by due time. Add reminder also works without AI. When due, the server executes the action or sends a Mac notification and a browser event. Tasks persist across restarts, with missed reminders executed when the server resumes. Interrupted running actions are marked failed rather than silently retried.

## No-cost operation

Keep the Groq account on its **Free plan**. Orbit uses no paid built-in tools, paid speech endpoint, or automatic paid fallback. A quota error pauses model/transcription requests instead of switching accounts. Keys in a paid Groq organization can still incur that organization's charges: Orbit cannot verify the billing plan from an API key. The Settings screen explains this restriction.

The Groq key, chats, files, speech cache, and schedules remain in `.orbit-data/`. Requests to Groq send prompts, recent chat context, selected extracted text, tool results, or audio for transcription. Kokoro inference itself stays local.

The **local server must remain running and the Mac awake** for scheduled actions to execute on time. A static Cloudflare Pages page alone cannot control the computer. There is currently no cloud backend, remote access, general GUI automation, room-device integration, or preinstalled local chat-model fallback.

## Verification

```sh
pnpm test
pnpm build
```

Tests cover persistence/restarts, serialized saves, scheduling and failed actions, tool argument validation, workspace boundaries, quota stopping, and the model/tool/result loop. Build packages only allowlisted frontend assets; the local API, key and data are excluded.
