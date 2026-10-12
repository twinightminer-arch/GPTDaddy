import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInjectionScript } from '../src/wallpaper/injection-script.mjs';

test('builds an idempotent persistent host with frame-based freeze telemetry', () => {
  const script = buildInjectionScript({ sourceUrl: 'http://127.0.0.1:34873/media/test?token=secret' });
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /__gptDaddyWallpaperControllerV1/);
  assert.match(script, /requestVideoFrameCallback/);
  assert.match(script, /lastAdvanceAt/);
  assert.match(script, /recoveryAttempts/);
  assert.match(script, /MutationObserver/);
  assert.doesNotMatch(script, /document\.hasFocus/);
  assert.match(script, /visibilitychange/);
  assert.doesNotMatch(script, /document\.hasFocus/);
  assert.match(script, /gptdaddy-desktop-panel/);
  assert.match(script, /__gptDaddyDesktopControl/);
  assert.match(script, /data-view="library"/);
});

test('does not embed local filesystem paths in the renderer script', () => {
  const script = buildInjectionScript({ sourceUrl: 'http://127.0.0.1:34873/media/test?token=secret' });
  assert.doesNotMatch(script, /[A-Z]:\\\\/);
});

test('matches wallpaper content backing to the Codex text theme', () => {
  const script = buildInjectionScript({ opacity: 0.72 });
  assert.match(script, /--gptdaddy-surface-rgb/);
  assert.match(script, /getComputedStyle\(document\.documentElement\)/);
  assert.match(script, /248 250 253/);
  assert.match(script, /20 23 29/);
  assert.doesNotMatch(script, /main, aside, nav, header, section/);
  assert.match(script, /--gptdaddy-panel-blur/);
  assert.match(script, /#app-shell-sidebar > div > div/);
  assert.match(script, /MainContentTopFade/);
  assert.match(script, /\.bg-gradient-to-t\.from-surface/);
  assert.match(script, /backdrop-filter: blur\(var\(--gptdaddy-panel-blur, 0px\)\)/);
  assert.doesNotMatch(script, /backdrop-filter: blur\(14px\)/);
  assert.doesNotMatch(script, /backdrop-filter: blur\(16px\)/);
});
