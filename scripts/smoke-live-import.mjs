import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readState } from '../src/core/config.mjs';

const fixtureRoot = resolve(process.argv[2] || 'work/release-audit/media');
const token = readState().apiToken;
const origin = 'http://127.0.0.1:34873';
const headers = { Authorization: `Bearer ${token}` };
const importedIds = [];

async function json(path, options = {}) {
  const response = await fetch(`${origin}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const value = await response.json();
  if (!response.ok) throw new Error(`${path}: ${value.error || response.status}`);
  return value;
}

async function waitReady(id) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const item = (await json('/api/wallpapers')).find((row) => row.id === id);
    if (!item) throw new Error(`Imported item disappeared: ${id}`);
    if (item.status !== 'processing') return item;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Video import did not finish: ${id}`);
}

try {
  const status = await json('/api/status');
  if (!status.codex?.installed || !status.lifecycle?.cdpAvailable) throw new Error('Official Codex target is not connected');
  const before = (await json('/api/wallpapers')).length;
  const results = [];
  for (const extension of ['png', 'jpg', 'gif', 'mp4', 'webm']) {
    const filename = `release-smoke.${extension}`;
    const source = join(fixtureRoot, filename);
    if (!existsSync(source)) throw new Error(`Missing generated fixture: ${filename}`);
    const started = performance.now();
    const imported = await json('/api/import', {
      method: 'POST',
      headers: { 'X-GPTDaddy-Filename': encodeURIComponent(filename) },
      body: readFileSync(source),
    });
    importedIds.push(imported.item.id);
    const item = await waitReady(imported.item.id);
    if (!['native-image', 'native-video'].includes(item.capability)) throw new Error(`Unsupported result for ${extension}: ${item.capability}`);
    if (!existsSync(source)) throw new Error(`Original source was removed: ${filename}`);
    const preview = await fetch(`${origin}/media/${encodeURIComponent(item.id)}?preview=1`, { headers });
    if (!preview.ok) throw new Error(`Preview failed for ${extension}: ${preview.status}`);
    results.push({ type: extension, capability: item.capability, importMs: Math.round(performance.now() - started), preview: preview.status });
  }
  await json('/api/rename-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: importedIds[0], title: 'Release smoke renamed' }) });
  if (!(await json('/api/wallpapers')).some((row) => row.id === importedIds[0] && row.title === 'Release smoke renamed')) throw new Error('Rename did not persist');
  console.log(JSON.stringify({ version: status.version, catalogBefore: before, imports: results }));
} finally {
  for (const id of importedIds) {
    try { await json('/api/delete-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); }
    catch (error) { console.error(`Cleanup failed for ${id}: ${error.message}`); }
  }
}
