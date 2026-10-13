import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

export const DEFAULT_DATA_ROOT = process.env.GPTDADDY_DATA_ROOT || join(process.env.LOCALAPPDATA || tmpdir(), 'GPTDaddy');

export function defaultState() {
  return {
    schemaVersion: 1,
    apiToken: randomBytes(32).toString('hex'),
    nativeRestart: { enabled: true },
    ui: { pageColor: '#101820' },
    wallpaper: {
      enabled: false,
      id: null,
      defaultId: null,
      opacity: 0.72,
      scrimOpacity: 0.2,
      blurPx: 12,
      fit: 'cover',
      zoom: 100,
      positionX: 50,
      positionY: 50,
      muted: true,
      fontColor: null,
      composerBackgroundColor: '#ffffff',
    },
  };
}

export function readState(file = join(DEFAULT_DATA_ROOT, 'state.json')) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      apiToken: typeof parsed.apiToken === 'string' && parsed.apiToken.length >= 32 ? parsed.apiToken : base.apiToken,
      nativeRestart: { ...base.nativeRestart, ...(parsed.nativeRestart || {}) },
      ui: { ...base.ui, ...(parsed.ui || {}) },
      wallpaper: { ...base.wallpaper, ...(parsed.wallpaper || {}) },
    };
  } catch {
    return defaultState();
  }
}

export function writeState(value, file = join(DEFAULT_DATA_ROOT, 'state.json')) {
  mkdirSync(dirname(file), { recursive: true });
  const partial = `${file}.${process.pid}.partial`;
  writeFileSync(partial, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(partial, file);
}

export function ensureState(file = join(DEFAULT_DATA_ROOT, 'state.json')) {
  const state = readState(file);
  if (!existsSync(file)) writeState(state, file);
  return state;
}
