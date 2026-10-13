import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const runtime = resolve(process.env.GPTDADDY_SMOKE_RUNTIME || join(root, 'dist', `runtime-v${version}`));
const dataRoot = mkdtempSync(join(root, '.gptdaddy-bundle-smoke-'));
const reserve = createServer();
await new Promise((done) => reserve.listen(0, '127.0.0.1', done));
const port = reserve.address().port;
await new Promise((done) => reserve.close(done));
const environment = {
  ...process.env,
  GPTDADDY_DATA_ROOT: dataRoot,
  GPTDADDY_PORT: String(port),
  GPTDADDY_PUBLIC_ROOT: join(runtime, 'public'),
  GPTDADDY_CATALOG_WORKER: join(runtime, 'catalog-worker.mjs'),
  GPTDADDY_ACTIVATION_SCRIPT: join(runtime, 'scripts', 'activate-packaged-codex.ps1'),
};
const child = spawn(join(runtime, 'node.exe'), [join(runtime, 'main.mjs'), 'daemon'], { env: environment, cwd: runtime, windowsHide: true, stdio: 'ignore' });
let healthy = false;
const started = performance.now();
try {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Bundle exited ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) { healthy = true; break; }
    } catch { /* waiting for the listener */ }
    await new Promise((done) => setTimeout(done, 50));
  }
  if (!healthy) throw new Error('Bundle did not start its control listener');
  const state = JSON.parse(readFileSync(join(dataRoot, 'state.json'), 'utf8'));
  const response = await fetch(`http://127.0.0.1:${port}/api/status`, { headers: { Authorization: `Bearer ${state.apiToken}` } });
  const status = await response.json();
  if (status.version !== version) throw new Error(`Wrong bundled version: ${status.version}`);
  const ui = await fetch(`http://127.0.0.1:${port}/index.html`);
  if (!ui.ok || !(await ui.text()).includes('GPTDaddy')) throw new Error('Bundled UI assets are missing');
  console.log(JSON.stringify({ version, listenerMs: Math.round(performance.now() - started), status: response.status, catalog: status.catalog.total }));
} finally {
  child.kill('SIGTERM');
  await new Promise((done) => { if (child.exitCode !== null) done(); else { child.once('exit', done); setTimeout(done, 3000); } });
  rmSync(dataRoot, { recursive: true, force: true });
}
