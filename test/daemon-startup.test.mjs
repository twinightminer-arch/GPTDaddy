import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GPTDaddyDaemon } from '../src/daemon.mjs';

test('control API starts without waiting for Windows discovery and preserves UI color', async (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'gptdaddy-start-test-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const daemon = new GPTDaddyDaemon({ dataRoot: directory, port: 0, wallpapers: [] });
  daemon.localStore.generatePreviews = false;
  context.after(async () => daemon.stop());
  const started = performance.now();
  await daemon.start();
  const startupMs = performance.now() - started;
  const port = daemon.control.server.address().port;
  const headers = { Authorization: `Bearer ${daemon.state.apiToken}`, 'Content-Type': 'application/json' };
  const base = `http://127.0.0.1:${port}`;
  const statusStarted = performance.now();
  const status = await (await fetch(`${base}/api/status`, { headers })).json();
  const statusMs = performance.now() - statusStarted;
  context.diagnostic(`fresh control listener ${startupMs.toFixed(1)}ms; first status ${statusMs.toFixed(1)}ms`);
  assert.equal(status.ui.pageColor, '#101820');
  assert.equal(startupMs < 1500, true, `Control listener took ${startupMs.toFixed(1)}ms`);
  const changed = await (await fetch(`${base}/api/ui`, { method: 'POST', headers, body: JSON.stringify({ pageColor: '#ffffff' }) })).json();
  assert.equal(changed.ui.pageColor, '#ffffff');
  assert.equal(JSON.parse(readFileSync(join(directory, 'state.json'), 'utf8')).ui.pageColor, '#ffffff');
  const ffmpeg = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
  const png = join(directory, 'source.png');
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=32x32:d=0.2', '-frames:v', '1', png], { windowsHide: true });
  const result = await (await fetch(`${base}/api/import`, {
    method: 'POST', headers: { Authorization: `Bearer ${daemon.state.apiToken}`, 'X-GPTDaddy-Filename': encodeURIComponent('sample.png') },
    body: readFileSync(png),
  })).json();
  assert.equal(result.item.capability, 'native-image');
  const list = await (await fetch(`${base}/api/wallpapers`, { headers })).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].hasPreview, true);
  assert.equal('filePath' in list[0], false);
});
