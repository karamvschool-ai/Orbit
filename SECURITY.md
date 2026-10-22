# Security and privacy

Orbit is a local personal assistant, not a multi-user service. Publishing its source code or static demo does not grant access to the developer’s computer or API account.

## Credentials and private files

Every user supplies their own Groq API key in local Settings. No shared provider key or public inference proxy is included. The key stays in the private configuration file; state responses report only whether a key is configured.

Development data lives in `.orbit-data/`. Desktop data lives in the application’s user-data directory, available through **Help → Open private data folder**. These folders contain chats, uploads, schedules, credentials, and voice caches. Imports create backups that are equally private.

Configuration and state files use owner-only permissions on macOS. They are local files, **not an encrypted vault**. Software running as your user, administrators, backups, or a compromised device may still access them. File permissions do not replace Windows account/ACL protections.

Do not commit or upload data folders, `.env` files, credentials, signing keys, personal screenshots, debug exports, or installers containing private data. `.gitignore` excludes common private artifacts; it cannot protect a file that is deliberately force-added or already tracked.

If a real key is exposed in chat, an issue, a commit, or a public log, revoke it at the provider and create a replacement. Removing it from the latest commit does not invalidate it or remove it from Git history.

## Local API boundary

- The engine listens on **127.0.0.1**, not the LAN or all network interfaces.
- Host checks reject unrelated hosts; Origin checks reject foreign websites and require an allowed Origin for mutations.
- Desktop mode additionally requires a random per-launch session credential, delivered to its window in an HttpOnly, SameSite=Strict cookie.
- The development server is intended for a single trusted local user. It is not authenticated against other local programs; Host/Origin headers are not a defense against malicious software on the same device.
- Static serving uses an allowlist. Private storage, server source, and configuration are not static assets.

**Do not expose the development or desktop engine to the internet**, add permissive CORS rules, or put it behind a public tunnel. Public hosting should contain only the generated `dist/` frontend. A shared hosted assistant would require a separate authentication, authorization, abuse-prevention, and billing design.

## App control and external processing

App interaction is off by default and requires explicit opt-in plus OS permission. It reads supported app interface text and sends relevant observations to Groq. Password fields are excluded, but ordinary controls can still contain private information. Avoid using it in sensitive applications or conversations you do not want processed externally.

Native adapters restrict available actions; model output is not executed as arbitrary shell code. Destination and outcome checks reduce mistakes, but they do not eliminate model errors or prompt injection. App/file contents are treated as untrusted data. Keep a human present for consequential actions.

Prompts, selected extracted file text, tool results, and audio for transcription can leave the device for Groq. Kokoro speech synthesis is local after its model download. Review provider policies before processing sensitive data.

## Reporting a vulnerability

Use GitHub’s private [Report a vulnerability](https://github.com/karamvschool-ai/Orbit/security/advisories/new) channel on this repository’s Security tab. Do not include exploit details, keys, or personal data in public issues. Do not test against someone else’s computer or provider account.

This is a personal project without a formal security certification or guaranteed response time. Automated tests and secret scans help detect problems; they are not proof that every vulnerability or secret has been found.

## Dependency maintenance

Run `pnpm audit --prod` before distributing a build. The October 22, 2026 review upgraded the transitive `sharp` dependency to 0.35.5 to address its reported high-severity advisories.

The same review found the unpatched moderate [sprintf-js precision-specifier denial-of-service advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), inherited through ONNX logging and Mammoth’s CLI argument parser. No shared public formatting endpoint is provided, but the dependency remains flagged; this is not a clean-audit claim. Recheck upstream fixes and rebuild installers after dependency updates. Previously built installers do not acquire dependency fixes automatically.
