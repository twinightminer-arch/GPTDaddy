import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readState } from '../src/core/config.mjs';
import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';
import { buildInappPanelScript } from '../src/wallpaper/inapp-panel.mjs';

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Pass the verified Codex CDP port');
const targets = await listCodexTargets({ port });
if (targets.length !== 1) throw new Error(`Expected one exact Codex main page, found ${targets.length}`);
// The Codex tool sandbox remaps LOCALAPPDATA; the already-running user daemon
// stores its state in the real profile's LocalAppData directory.
const token = readState(join(homedir(), 'AppData', 'Local', 'GPTDaddy', 'state.json')).apiToken;
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
const inflight = new Set();
try {
  await client.connect();
  await client.call('Runtime.enable');
  await client.call('Runtime.addBinding', { name: '__gptDaddyDesktopControl' });
  client.onEvent((event) => {
    if (event.method !== 'Runtime.bindingCalled' || event.params?.name !== '__gptDaddyDesktopControl') return;
    const task = (async () => {
      const { id, action } = JSON.parse(event.params.payload);
      let value = null, error = null;
      try {
        if (!['status', 'list'].includes(action)) throw new Error('Validation allows read-only actions only');
        const path = action === 'status' ? '/api/status' : '/api/wallpapers';
        const response = await fetch(`http://127.0.0.1:34873${path}`, { headers: { Authorization: `Bearer ${token}` } });
        value = await response.json();
        if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
      } catch (cause) { error = cause.message; }
      if (client.isOpen()) await client.call('Runtime.evaluate', { expression: `window.__gptDaddyControlResponse?.(${JSON.stringify(id)},${JSON.stringify(value)},${JSON.stringify(error)})`, returnByValue: true });
    })();
    inflight.add(task);
    void task.catch(() => {}).finally(() => inflight.delete(task));
  });
  const installed = await client.call('Runtime.evaluate', { expression: buildInappPanelScript(), returnByValue: true });
  if (installed.result?.value !== true) throw new Error('In-app panel did not install');
  const viewport = await client.call('Runtime.evaluate', { expression: `({ width: innerWidth, height: innerHeight })`, returnByValue: true });
  const { width, height } = viewport.result.value;
  await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: width - 48, y: height - 50, button: 'left', clickCount: 1 });
  await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: width - 48, y: height - 50, button: 'left', clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 8000));
  const snapshot = await client.call('Runtime.evaluate', { expression: `(() => { const root = document.getElementById('gptdaddy-desktop-panel'); const shadow = root?.shadowRoot; return { installed: !!root, open: !shadow?.querySelector('.panel')?.hidden, status: shadow?.querySelector('[data-status]')?.textContent, cards: shadow?.querySelectorAll('.card')?.length }; })()`, returnByValue: true });
  const screenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const directory = join(process.cwd(), 'work', 'audit');
  await mkdir(directory, { recursive: true });
  const file = join(directory, `codex-inapp-panel-${new Date().toISOString().replaceAll(':', '-')}.png`);
  await writeFile(file, Buffer.from(screenshot.data, 'base64'));
  console.log(JSON.stringify({ ...snapshot.result?.value, screenshot: file }));
} finally {
  await Promise.allSettled([...inflight]);
  try { await client.call('Runtime.evaluate', { expression: `window.__gptDaddyRemovePanel?.()`, returnByValue: true }); } catch { /* no-op */ }
  client.close();
}
