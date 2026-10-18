import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureState, readState, writeState } from '../src/core/config.mjs';

test('persists wallpaper state and keeps a stable local API token', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'gptdaddy-config-test-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'state.json');
  const first = ensureState(file);
  first.wallpaper.enabled = true;
  first.wallpaper.id = '123';
  writeState(first, file);
  const second = readState(file);
  assert.equal(second.apiToken, first.apiToken);
  assert.equal(second.wallpaper.id, '123');
  assert.equal(second.wallpaper.enabled, true);
  assert.equal(second.wallpaper.composerBackgroundColor, '#ffffff');
});

test('older state receives white composer default while an explicit Codex-color choice stays intact', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'gptdaddy-config-test-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'state.json');
  writeFileSync(file, JSON.stringify({ wallpaper: { enabled: true } }));
  assert.equal(readState(file).wallpaper.composerBackgroundColor, '#ffffff');
  writeFileSync(file, JSON.stringify({ wallpaper: { composerBackgroundColor: null } }));
  assert.equal(readState(file).wallpaper.composerBackgroundColor, null);
});
