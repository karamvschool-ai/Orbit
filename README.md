# Orbit

Orbit runs as a standalone macOS/Windows desktop app with its own private local engine, or as a browser frontend connected to the development server. The deployed Cloudflare static page remains separate.

## Desktop app

Install the Apple Silicon Mac DMG or Windows x64 EXE from `releases/`. Open Orbit normally: it starts its engine automatically, with no Node installation, terminal, or separate browser needed. Use Settings to enter your Groq **Free-plan** key on each computer. Internet is required for Groq and the initial Kokoro model download; Kokoro then runs locally.

To reuse the development app's chats, uploads, schedules, key and cached voice model, choose **Orbit → Import existing Orbit data…** (Mac) or **File → Import existing Orbit data…** (Windows), then select `/Users/karam/Orbit/.orbit-data` or your transferred `.orbit-data` folder. The app preserves a backup before importing and restarts. The installers contain no personal key, chats, or files.

Desktop data lives in `~/Library/Application Support/Orbit/assistant` on macOS and `%APPDATA%/Orbit/assistant` on Windows. **Help → Open private data folder** opens it. Closing the window keeps reminders running in the menu bar/tray; Quit stops them. The computer must remain awake. macOS may request microphone/Automation access; Windows media controls require an active player session.

Build locally:

```sh
pnpm install
pnpm desktop
pnpm package:mac   # Apple Silicon DMG
pnpm package:win   # Windows x64 NSIS installer; can be built on macOS
```

Mac builds use a free local ad-hoc signature bound to Orbit’s own app identifier; Windows builds are unsigned. Neither uses paid signing certificates or notarization. Operating systems may display an unsigned-app warning. Windows tools are adapter-tested on macOS; native Windows playback/permissions still need testing on a PC.

## Run in a browser

Requires Node.js 20.19+ (Node 22+ recommended) and macOS or Windows for computer tools.

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173. Enter your **Groq Free-plan API key in Settings**, not in chat. The key is saved in `.orbit-data/config.json` with owner-only permissions. `.orbit-data/` is Git-ignored and never served as a static directory. Replace a key pasted into any chat with a newly generated key in Settings.

The current Mac's bundled Codex Node runtime can also start the server using `scripts/start-local.zsh`.

## Features

- Settings shows reported daily-request and per-minute-token usage bars, remaining counts, reset estimates and the last update time. Missing headers remain unknown, voice quotas stay separate, and samples survive restart. Other Groq limits are available through the account limits link.
- App requests use a smaller task-specific tool list and short current observations. An action and its follow-up observation share one tool call. Settings also shows actual input/output token counts for the last AI step. Requests stop after repeated unchanged screens or failed controls, use at most 12 actions, and have a two-minute AI/action-loop deadline with at most 30 seconds of rate-limit waiting. Free limits still apply; there is no paid fallback.
- Version 1.2.4 sends no tool schemas for ordinary questions, uses only relevant domain instructions, removes redundant parameter descriptions and default observation fields, and retains only the last two complete action/response pairs plus a short outcome ledger. Local exact commands include current date/time, opening common apps, setting/reading volume and basic Music/Spotify controls. `app_search` verifies and submits a real search field locally, returning current results in one tool call; it cannot submit a message composer. Selected attachments retain retrieval tools and excerpted text. Short follow-ups retain the latest authored goal, without unrelated previous tasks. Provider validation errors are explained with credentials redacted.
- Run `node scripts/measure-token-efficiency.mjs` for a reproducible offline comparison with 1.2.3. Its figures measure serialized input characters, not provider token counts. Fixtures reduced simple-question input by 96% and six-step app input by 41%; “Open Spotify” changed from two model calls to zero. Real usage depends on the prompt and app contents.
- Playlist requests use the requested playlist's named Play control and require its Pause state plus active playback for verification. Generic player Play cannot substitute for a playlist. A requested new chat must be opened and verified blank before any prompt is typed; an unchanged existing conversation is refused.
- Clear commands such as “Play my Summer? playlist in Spotify” run the playlist workflow locally without a Groq call. The reader first looks in the visible library, opens the uniquely named playlist, and inspects the named Pause control separately from its long song list. An already-active requested playlist is verified without toggling it off.
- Direct messages use a dedicated workflow after opening the conversation: verify its recipient header and an empty composer, enter and read back the exact draft, submit only once, and check visible message evidence. A sidebar/profile match alone is refused. If delivery cannot be verified, Orbit does not automatically resend. New-chat and DM safeguards have regression coverage; actual third-party sending was not exercised during the 1.2.3 test.
- Groq `openai/gpt-oss-120b` text chat and local tool calling. The current request, action status, actual tool results, and final reply drive the home UI.
- Voice input records up to 90 seconds, then uses Groq `whisper-large-v3-turbo`. Grant microphone permission when prompted. Recording is explicit: click the microphone to start and click again to submit.
- Thinking fills the central black circle using real processing/tool milestones; Groq does not expose an exact percent complete. During speech, the gravitational waves and top equalizer follow actual audio amplitude and frequency bands.
- Kokoro 82M runs locally on CPU behind `/api/speech`. Its quantized model downloads from Hugging Face once (roughly 100 MB plus voice data), then uses the local cache. No hosted speech billing. The engine prewarms the model in a worker, generates a short first phrase and prefetches subsequent phrases during playback. Replies are spoken automatically; Settings selects the voice or disables speech. Response options offer Read aloud and Stop speaking.
- Persistent conversations, full chat history, continue/new/delete controls.
- Persistent workspace uploads (25 MB per file). Readable formats: text/code, Markdown, JSON, CSV, text PDFs, DOCX. Audio and audio tracks in supported videos are transcribed through Groq. Images can be previewed but **GPT-OSS does not interpret their visuals**; scanned PDFs and unsupported formats are retained with an explicit capability note. Selected extracted text/transcripts go to Groq. Text is limited to 1,000,000 stored characters; model context uses relevant excerpts.
- Mac and Windows tools: list/open installed apps, open HTTP(S) websites and workspace files, read/set output volume, control Music/Spotify playback. Semantic app interaction: inspect visible controls, press buttons, enter text and use keyboard shortcuts, with a new observation after every action. Spotify song requests search its desktop app, use the observed playback controls and verify the actual song/player state. No arbitrary shell commands or pixel-based screen clicking. macOS may request Automation access for media controls.
- Natural-language reminders and scheduled supported computer actions. Upcoming tasks are sorted by due time. Add reminder also works without AI. When due, the server executes the action or sends a desktop notification and a browser event. Tasks persist across restarts, with missed reminders executed when the server resumes. Interrupted running actions are marked failed rather than silently retried.

## Interact with applications

In **Settings → App control**, enable **Allow app interaction** and select **Check app access**. On Mac, grant Orbit **System Settings → Privacy & Security → Device Control and Data Access (Accessibility on older macOS)** access yourself, then restart Orbit if macOS requests it. Development runs may require the Node/terminal process instead. On Windows, normal desktop apps use UI Automation; elevated apps cannot be controlled by a normal Orbit process.

Try “Play [song] by [artist] in Spotify” or “Put this prompt into [named AI app/chat], but don’t send it.” Explicitly ask to send if that is what you want. Orbit reads an application’s exposed text and controls and checks the result after acting. Password fields are excluded. This is not universal visual control: games, canvas-only interfaces, custom controls without accessibility support, and account playback restrictions can prevent an action. GPT-OSS is text-only. No Spotify paid API or subscription is added. The reader enables Chromium accessibility, selects the focused window, groups track/artist controls, and preserves result context when trimming large trees. Incomplete or loading interface text is never evidence that a song is absent. **Check Spotify results** in Settings is a local diagnostic that uses no Groq quota.

The app-control permission is off by default. Visible interface text is sent to Groq while carrying out requests. Turn it off at any time in Settings. The composer changes to **Stop request** during a request; stopping prevents further actions but cannot undo actions already completed. **Test TextEdit control** runs a fixed local Mac diagnostic: create an unsaved blank document, type a test sentence and read it back. It uses no Groq quota and sends no app text externally. General app clicks/typing cannot be scheduled; reminders and the existing supported scheduled actions continue to work.

## No-cost operation

Keep the Groq account on its **Free plan**. Orbit uses no paid built-in tools, paid speech endpoint, or automatic paid fallback. Short free-plan chat quota waits are displayed and retried at most twice; longer or transcription quota errors pause requests instead of switching accounts. Use the composer Stop button to cancel pending requests. Keys in a paid Groq organization can still incur that organization's charges: Orbit cannot verify the billing plan from an API key. The Settings screen explains this restriction.

The Groq key, chats, files, speech cache, and schedules remain in `.orbit-data/`. Requests to Groq send prompts, recent chat context, selected extracted text, tool results (including visible app interface text when app control is enabled), or audio for transcription. Kokoro inference itself stays local.

The **engine must remain running and the computer awake** for scheduled actions to execute on time. A static Cloudflare Pages page alone cannot control the computer. There is currently no cloud backend, remote access, pixel-based GUI automation, room-device integration, or preinstalled local chat-model fallback.

## Verification

```sh
pnpm test
pnpm build
```

Tests also cover app-control opt-in, scoped dispatch, valid compacted snapshots, cancellation, Spotify search/playback verification, and native Mac permission status. Tests cover built desktop imports and session authentication, speech chunking, Windows tool dispatch, safe data import paths, persistence/restarts, serialized saves, scheduling and failed actions, tool argument validation, workspace boundaries, quota stopping, and the model/tool/result loop. Build packages only allowlisted frontend assets; the local API, key and data are excluded.
