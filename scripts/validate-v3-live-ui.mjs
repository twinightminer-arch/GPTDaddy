import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';
import { GPTDaddyDaemon } from '../src/daemon.mjs';
import { buildInappPanelScript } from '../src/wallpaper/inapp-panel.mjs';

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Pass the verified Codex CDP port');
const targets = await listCodexTargets({ port });
if (targets.length !== 1) throw new Error(`Expected one exact Codex main page, found ${targets.length}`);

const auditRoot = join(process.cwd(), 'work', 'audit');
await mkdir(auditRoot, { recursive: true });
const dataRoot = await mkdtemp(join(auditRoot, 'v3-validation-'));
const daemon = new GPTDaddyDaemon({ dataRoot, wallpapers: [] });
daemon.state.wallpaper.enabled = true;
daemon.state.wallpaper.id = 'v3-validation';
daemon.status = async () => ({
  wallpaper: { ...daemon.state.wallpaper },
  lifecycle: { active: true, playbackHealthy: true, cdpAvailable: true, cdpPort: port, connectedTargets: 1 },
});

const client = new CdpClient(targets[0].webSocketDebuggerUrl);
const pending = new Set();
const name = '__gptDaddyValidationControl';
async function evaluate(expression) {
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function screenshot(label) {
  const result = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const file = join(dataRoot, `${label}.png`);
  await writeFile(file, Buffer.from(result.data, 'base64'));
  return file;
}
async function waitFor(predicate, label, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
function sliderExpression() {
  return `(() => {
    const shadow = document.getElementById('gptdaddy-v3-validation-panel')?.shadowRoot;
    if (!shadow) return null;
    return Object.fromEntries(['opacity','scrimOpacity','blurPx','zoom'].map((key) => {
      const input = shadow.querySelector('[data-setting="' + key + '"]');
      return [key, { value: Number(input.value), min: Number(input.min), max: Number(input.max), output: shadow.querySelector('[data-output="' + key + '"]').textContent }];
    }));
  })()`;
}

try {
  await client.connect();
  await client.call('Runtime.enable');
  await client.call('Runtime.addBinding', { name });
  client.onEvent((event) => {
    if (event.method !== 'Runtime.bindingCalled' || event.params?.name !== name) return;
    const task = (async () => {
      const { id, action, payload } = JSON.parse(event.params.payload);
      let value = null, error = null;
      try { value = await daemon.handleDesktopAction(action, payload); }
      catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
      if (client.isOpen()) await evaluate(`window.__gptDaddyValidationResponse?.(${JSON.stringify(id)},${JSON.stringify(value)},${JSON.stringify(error)})`);
    })();
    pending.add(task);
    void task.catch(() => {}).finally(() => pending.delete(task));
  });

  const production = await evaluate(`(() => { const root = document.getElementById('gptdaddy-desktop-panel'); const shadow = root?.shadowRoot; return { present: !!root, oldRanges: shadow ? Object.fromEntries(['opacity','scrimOpacity','blurPx','zoom'].map((key) => [key, shadow.querySelector('[data-setting="' + key + '"]')?.max])) : null }; })()`);
  const script = buildInappPanelScript()
    .replaceAll('gptdaddy-desktop-panel', 'gptdaddy-v3-validation-panel')
    .replaceAll('__gptDaddyDesktopControl', name)
    .replaceAll('__gptDaddyControlResponse', '__gptDaddyValidationResponse')
    .replaceAll('__gptDaddyRemovePanel', '__gptDaddyRemoveValidationPanel');
  if (await evaluate(script) !== true) throw new Error('Validation panel did not install');
  const viewport = await evaluate(`({width:innerWidth,height:innerHeight})`);
  await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: viewport.width - 48, y: viewport.height - 50, button: 'left', clickCount: 1 });
  await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: viewport.width - 48, y: viewport.height - 50, button: 'left', clickCount: 1 });
  await waitFor(async () => await evaluate(`document.getElementById('gptdaddy-v3-validation-panel')?.shadowRoot?.querySelector('[data-status]')?.textContent`) === '壁纸正在播放', 'panel status');
  const home = await screenshot('panel-home');

  await evaluate(`document.getElementById('gptdaddy-v3-validation-panel').shadowRoot.querySelector('[data-tab="theme"]').click()`);
  const theme = await screenshot('theme-initial');
  async function saveAt(ui) {
    await evaluate(`(() => {
      const shadow = document.getElementById('gptdaddy-v3-validation-panel').shadowRoot;
      for (const input of shadow.querySelectorAll('[data-setting]')) {
        input.value = ${ui};
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      shadow.querySelector('[data-composer-auto]').checked = false;
      shadow.querySelector('[data-composer-color]').disabled = false;
      shadow.querySelector('[data-composer-color]').value = '#203040';
      shadow.querySelector('[data-message]').textContent = '';
      shadow.querySelector('[data-action="save"]').click();
    })()`);
    await waitFor(async () => await evaluate(`document.getElementById('gptdaddy-v3-validation-panel')?.shadowRoot?.querySelector('[data-message]')?.textContent`) === '设置已保存', `save at ${ui}`);
    const sliders = await evaluate(sliderExpression());
    const saved = JSON.parse(await readFile(join(dataRoot, 'state.json'), 'utf8')).wallpaper;
    const image = await screenshot(`theme-${ui}`);
    return { sliders, saved: { opacity: saved.opacity, scrimOpacity: saved.scrimOpacity, blurPx: saved.blurPx,
      zoom: saved.zoom, composerBackgroundColor: saved.composerBackgroundColor }, screenshot: image };
  }
  const atZero = await saveAt(0);
  const atHundred = await saveAt(100);
  console.log(JSON.stringify({ production, home, theme, atZero, atHundred, fixtureState: join(dataRoot, 'state.json') }, null, 2));
} finally {
  await Promise.allSettled([...pending]);
  if (client.isOpen()) {
    try { await evaluate(`window.__gptDaddyRemoveValidationPanel?.()`); } catch { /* target may have navigated */ }
  }
  client.close();
}
