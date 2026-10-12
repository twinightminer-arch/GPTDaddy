# GPTDaddy

GPTDaddy is a Windows companion for the official OpenAI Codex desktop app. The
current milestone focuses on a persistent Wallpaper Engine video background,
safe target discovery, local state recovery, and frame-level freeze detection.

This is a **preview**, not a finished native-startup wallpaper plugin. The
official production Codex client must already expose a verified CDP endpoint
for the current renderer integration to work. Ordinary Codex launch without
CDP is not yet supported; see the compatibility boundary below.

## Current MVP

- Discovers Wallpaper Engine projects from Steam libraries.
- Transfers MP4/WebM media to the renderer through an already-authorized CDP session;
  the loopback range server remains available for future supported transport paths.
- Injects one persistent, idempotent wallpaper host into the exact Codex main-page CDP target.
- Keeps the same video element across ordinary React route and conversation changes.
- Detects freezes using both `requestVideoFrameCallback` and media-time progress.
- Uses bounded, cooldown-based recovery instead of an infinite retry loop.
- Persists wallpaper and visual settings under `%LOCALAPPDATA%\GPTDaddy`.
- Exposes a Chinese-first visual control panel on `127.0.0.1`.
- Adds a draggable in-app floating control panel when the verified Codex CDP
  connection is available. Its status, library and settings use the same daemon
  state as the browser panel; no blocked localhost iframe is required.
- Provides an optional six-digit custom font color. Automatic mode follows the
  Codex theme, and disabling the wallpaper restores the original text styling.
- Allows a separately saved composer background color (white by default), with
  a Codex-original-color switch. The add menu and permissions menu use the same
  opaque color, with a contrast fallback for text on light backgrounds.

## Run locally

```powershell
npm test
npm run doctor
npm start
```

The daemon prints a local control-panel URL containing a random access token.

The in-app panel and new font-color control are loaded by the daemon at startup.
An already-running daemon must be restarted to pick up source changes. This is
not a way to enable CDP in a normally launched Codex process.
Use `scripts/restart-user-daemon.cmd` from a normal Windows desktop session;
it verifies and stops only this project's `node.exe ... src\cli.mjs daemon`
process, then waits for the user-level supervisor to bring it back.

For a one-time real-window test, close Codex normally and run
`scripts/validate-live-codex.cmd` from Windows Explorer. It opens the official
Codex executable with loopback CDP only for that test session, records actual
frame callbacks for ten minutes under `work/live-validation`, and leaves Codex
open. This is a validation tool, not the normal startup path.

## Important compatibility boundary

The current official Codex Windows build does not expose a documented plugin
API for renderer UI injection. CDP must already be enabled when Electron starts;
it cannot be safely enabled on an existing process. GPTDaddy never terminates or
restarts Codex automatically to hide this limitation. See
`docs/phase-1-compatibility.md` for evidence and proposed alternatives.

The startup registration script is non-mutating by default. Run it with
`-ValidateOnly` to inspect the exact user-level registry change. It registers
a hidden, per-user daemon at Windows sign-in, not a replacement Codex shortcut.
Do not use `-Install` until you have reviewed and approved it. This registration
alone does **not** make a normally launched production Codex expose CDP.

## License

AGPL-3.0-or-later. See `THIRD_PARTY_NOTICES.md`.

## Acknowledgments

- [WorkDaddy](https://github.com/babygoton/WorkDaddy), by **babygoton / WorkDaddy Contributors** (AGPL-3.0-or-later).
- [dsh-plugin-wallpaper-engine-codex](https://github.com/JonathandNidhog/dsh-plugin-wallpaper-engine-codex), by **JonathandNidhog** (MIT).

This project is independent of those repositories and of OpenAI. Their names,
authors, original links and license information are also recorded in
`THIRD_PARTY_NOTICES.md`.

## Preview archive

On Windows with PowerShell and Node.js 22 or newer, run
`npm run package:windows` to create `dist/GPTDaddy-0.1.0-windows-node22.zip`.
The ZIP contains the application source and runtime launch scripts, not a
self-contained executable. It excludes local state, Steam media, tests and
audit screenshots. Install the user-level startup entry only after reviewing
the limitations above and the `scripts/install-user-startup.ps1` script.
