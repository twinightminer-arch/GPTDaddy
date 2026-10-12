import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettings } from '../src/daemon.mjs';
import { buildInjectionScript } from '../src/wallpaper/injection-script.mjs';

test('accepts a six-digit font color and automatic mode only', () => {
  assert.equal(normalizeSettings({ fontColor: '#A1b2C3' }).fontColor, '#A1b2C3');
  assert.equal(normalizeSettings({ fontColor: null }).fontColor, null);
  assert.throws(() => normalizeSettings({ fontColor: 'red' }), /Font color/);
  assert.throws(() => normalizeSettings({ fontColor: 'red; background: black' }), /Font color/);
  assert.equal(normalizeSettings({ composerBackgroundColor: '#102030' }).composerBackgroundColor, '#102030');
  assert.equal(normalizeSettings({ composerBackgroundColor: null }).composerBackgroundColor, null);
  assert.throws(() => normalizeSettings({ composerBackgroundColor: 'transparent' }), /Composer background color/);
});

test('injected text colors are reversible and controlled from both interfaces', () => {
  const script = buildInjectionScript({ fontColor: '#A1b2C3' });
  assert.match(script, /--color-text-primary/);
  assert.match(script, /'--color-text': 1/);
  assert.match(script, /'--color-text-secondary': 0\.74/);
  assert.match(script, /--color-text-prose/);
  assert.match(script, /originalTextTokens/);
  assert.match(script, /data-font-color/);
  assert.match(script, /data-font-auto/);
  assert.match(script, /app-shell-left-panel/);
  assert.match(script, /ApplicationMenuTopBar/);
  assert.match(script, /app-shell-header-toolbar/);
  assert.match(script, /applyChromeFontColor/);
  assert.match(script, /restoreChromeFontColor/);
  assert.match(script, /chromeObserver\.disconnect\(\)/);
  assert.match(script, /ComposerTopMenuShell/);
  assert.match(script, /data-composer-navigation-target/);
  assert.match(script, /data-gptdaddy-permissions-menu/);
  assert.match(script, /backdrop-filter: blur\(18px\)/);
  assert.match(script, /data-gptdaddy-composer-color/);
  assert.match(script, /data-composer-auto/);
  assert.match(script, /settings\.composerBackgroundColor/);
});
