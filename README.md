# GPTDaddy

GPTDaddy is a Windows companion for the official OpenAI Codex desktop app. The
current 0.2.1 release adds local wallpaper imports, cached startup, theme
controls, and bounded recovery across normal Codex restarts.

The verified package-activation path restored the wallpaper without adding a
second taskbar icon. The native startup splash still appears before CDP
attachment and cannot yet be styled; this limitation is not hidden by the
release label.

## Current MVP

- Discovers Wallpaper Engine projects from Steam libraries.
- Caches the last successful Wallpaper Engine index and scans updates in a
  background worker so the control panel does not wait for a full scan.
- Imports PNG, JPEG, WebP, BMP, GIF and supported video files into a separate
  managed directory without moving or deleting the originals. Imported items
  can be previewed, renamed, made the default, or removed.
- Transfers MP4/WebM media to the renderer through an already-authorized CDP session;
  the loopback range server remains available for future supported transport paths.
- Injects one persistent, idempotent wallpaper host into the exact Codex main-page CDP target.
- Keeps the same video element across ordinary React route and conversation changes.
- Detects freezes using both `requestVideoFrameCallback` and media-time progress.
- Uses bounded, cooldown-based recovery instead of an infinite retry loop.
- Persists wallpaper and visual settings under `%LOCALAPPDATA%\GPTDaddy`.
- Includes an optional, bounded package-activation recovery for a newly launched
  verified Codex process without CDP. It asks Codex to quit normally and opens
  the same official package with loopback CDP; an existing process is never
  restarted merely because GPTDaddy started. If the window is not ready, it
  retries with a cooldown; a failure blocks only that process, not later Codex
  launches. Process creation time distinguishes a newly launched instance from
  a reused Windows PID.
- Exposes a Chinese-first visual control panel on `127.0.0.1`.
- Adds a draggable in-app floating control panel when the verified Codex CDP
  connection is available. Its status, library and settings use the same daemon
  state as the browser panel; no blocked localhost iframe is required.
- Provides an optional six-digit custom font color. Automatic mode follows the
  Codex theme, and disabling the wallpaper restores the original text styling.
- Allows a separately saved composer background color (white by default), with
  a Codex-original-color switch. The add menu and permissions menu use the same
  opaque color, with a contrast fallback for text on light backgrounds.
- Gives the full-access confirmation dialog an opaque composer-colored surface
  and contrasting text, without changing Codex permission settings.
- Saves a separate GPTDaddy control-panel background color across its pages.
- Applies the saved background color to the verified profile menu and editor,
  keeps the new-chat composer surface continuous, and removes the opaque
  settings cards and Library/Plugins/Skills header strips seen in the tested
  Codex build. These selectors are scoped to observed page structures; they
  require revalidation after Codex updates.

## Run locally

```powershell
npm test
npm run doctor
npm run audit:launch
npm start
```

The daemon prints a local control-panel URL containing a random access token.

The in-app panel and new font-color control are loaded by the daemon at startup.
An already-running daemon must be restarted to pick up source changes.
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
it cannot be safely enabled on an existing process. With the saved automatic
recovery option enabled, GPTDaddy may ask a **newly launched, verified** Codex
instance to quit normally, then reactivate its original package identity with
loopback CDP. This can cause one visible restart. The native splash before CDP
attachment is not yet wallpapered. See
`docs/phase-1-compatibility.md` for evidence and proposed alternatives.
The current shortcut/package/taskbar identity audit and the distinction between
verified facts and a likely duplicate-icon cause are recorded in
`docs/native-launch-audit-2026-10-13.md`. The existing pinned icon is untouched.

The startup registration script is non-mutating by default. Run it with
`-ValidateOnly` to inspect the exact user-level registry change. It registers
a hidden, per-user daemon at Windows sign-in, not a replacement Codex shortcut.
This registration alone does **not** make a normally launched production Codex
expose CDP; the bounded package-activation recovery is a separate mechanism.

## License

AGPL-3.0-or-later. See `THIRD_PARTY_NOTICES.md`.

## Acknowledgments

- [WorkDaddy](https://github.com/babygoton/WorkDaddy), by **babygoton / WorkDaddy Contributors** (AGPL-3.0-or-later).
- [dsh-plugin-wallpaper-engine-codex](https://github.com/JonathandNidhog/dsh-plugin-wallpaper-engine-codex), by **JonathandNidhog** (MIT).

This project is independent of those repositories and of OpenAI. Their names,
authors, original links and license information are also recorded in
`THIRD_PARTY_NOTICES.md`.

## Windows packages

`GPTDaddy-0.2.1-Setup.exe` installs a bundled Node runtime and registers the
per-user GPTDaddy daemon for Windows sign-in. It adds only GPTDaddy control-panel
shortcuts; it does not replace or unpin the official Codex shortcut.
On install or upgrade, it takes over the GPTDaddy loopback listener only after
verifying the old daemon and runner belong to GPTDaddy, then checks that the
new installed runtime owns the listener. Codex processes are never terminated
by this installer step.
`GPTDaddy-0.2.1-Portable.zip` contains the same runtime for manual use.
Both use `%LOCALAPPDATA%\GPTDaddy` for settings and imported media, separate
from the installation directory, so an update does not erase those files.

To build from source, run `npm ci`, then `scripts/build-windows.ps1`,
`scripts/package-portable.ps1`, and `scripts/build-installer.ps1` on Windows.
The installer requires Inno Setup 6. Local video imports require `ffmpeg.exe`
and `ffprobe.exe` on `PATH`; without them, the interface reports that the
codec cannot be prepared. Neither package contains local state,
Steam media, audit screenshots, or development dependencies.
