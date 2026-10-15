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
  assert.match(script, /initialConfig\.pluginVersion \|\| 'development'/);
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
  assert.match(script, /data-gptdaddy-profile-menu/);
  assert.match(script, /data-gptdaddy-profile-editor/);
  assert.match(script, /data-gptdaddy-full-access-confirm/);
  assert.match(script, /--gptdaddy-confirm-ink/);
  assert.match(script, /contrastRatio\('#000000', composerColor\)/);
  assert.match(script, /data-gptdaddy-flat-header/);
  assert.match(script, /title === '技能'/);
  assert.match(script, /group\/settings/);
  assert.match(script, /after:inset-x-4/);
  assert.match(script, /showcaseEmptyState/);
  assert.match(script, /bg-background-composer-action-bar/);
  assert.match(script, /group\/home-composer-layout/);
  assert.match(script, /margin-inline: 0 !important/);
  assert.match(script, /overflow-visible/);
  assert.match(script, /backdrop-filter: blur\(18px\)/);
  assert.match(script, /data-gptdaddy-composer-color/);
  assert.match(script, /data-composer-auto/);
  assert.match(script, /settings\.composerBackgroundColor/);
});

test('chat/work switch, code snippets and file references use scoped readable surfaces', () => {
  const script = buildInjectionScript({ pluginVersion: '0.2.2', fontColor: '#ffffff' });
  const themedSurfaces = script.slice(script.indexOf('#root [data-gptdaddy-chat-work-switch]'),
    script.indexOf('html[data-gptdaddy-font-color] :is([role="menu"]'));
  assert.match(script, /data-gptdaddy-chat-work-switch/);
  assert.match(script, /labels\.has\('聊天'\) && labels\.has\('工作'\)/);
  assert.match(script, /data-gptdaddy-chat-work-active/);
  assert.match(script, /bg-background-mode-toggle-track/);
  assert.match(script, /_indicator_/);
  assert.match(script, /group\/code-snippet/);
  assert.match(script, /group\/writing-block-surface/);
  assert.match(script, /--oai-wb-surface-primary/);
  assert.match(script, /data-gptdaddy-file-chip/);
  assert.match(themedSurfaces, /--gptdaddy-composer-surface/g);
  assert.match(themedSurfaces, /--gptdaddy-composer-ink/g);
  assert.doesNotMatch(themedSurfaces, /--gptdaddy-surface-rgb/);
  assert.match(script, /--gptdaddy-content-ink/);
  assert.match(script, /contrastRatio\(custom, darkSurface/);
  assert.match(script, /chatWorkClickHandlers\.clear\(\)/);
  assert.match(script, /removeAttribute\('data-gptdaddy-file-chip'\)/);
  assert.doesNotMatch(script, /body\s+\*\s*\{\s*background-color:/);
});
