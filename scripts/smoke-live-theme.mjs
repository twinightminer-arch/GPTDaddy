import { readState } from '../src/core/config.mjs';
import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';

const token = readState().apiToken;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const origin = 'http://127.0.0.1:34873';

async function api(path, options = {}) {
  const response = await fetch(`${origin}${path}`, { ...options, headers });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}

const original = await api('/api/status');
if (!original.codex?.executablePath?.includes('OpenAI.Codex_') || !original.codex.cdpLoopbackOnly) {
  throw new Error('The connected target is not a verified official Codex package');
}
const targets = await listCodexTargets({ port: original.codex.cdpPort });
if (targets.length !== 1) throw new Error(`Expected one Codex main target, found ${targets.length}`);
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
const temporaryColor = '#e8edf4';
const originalColor = original.ui.pageColor;

async function evaluate(expression) {
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
}

async function waitColor(color) {
  for (let attempt = 0; attempt < 35; attempt += 1) {
    const value = await evaluate(`(() => {
      const root = document.querySelector('#gptdaddy-desktop-panel');
      const panel = root?.shadowRoot?.querySelector('.panel');
      return { panelColor: panel?.style.getPropertyValue('--ui-bg'), inputColor: root?.shadowRoot?.querySelector('[data-page-color]')?.value };
    })()`);
    if (value?.panelColor === color && value?.inputColor === color) return value;
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`In-app theme did not synchronize ${color}`);
}

await client.connect();
let changed = false;
let panelWasHidden = null;
try {
  panelWasHidden = await evaluate(`(() => {
    const panel = document.querySelector('#gptdaddy-desktop-panel')?.shadowRoot?.querySelector('.panel');
    if (!panel) throw new Error('GPTDaddy panel was not injected');
    const hidden = panel.hidden;
    panel.hidden = false;
    return hidden;
  })()`);
  await api('/api/ui', { method: 'POST', body: JSON.stringify({ pageColor: temporaryColor }) });
  changed = true;
  await waitColor(temporaryColor);
  const pages = await evaluate(`(() => {
    const root = document.querySelector('#gptdaddy-desktop-panel');
    const shadow = root.shadowRoot;
    const selected = shadow.querySelector('[data-tab].active')?.dataset.tab;
    const values = [];
    for (const button of shadow.querySelectorAll('[data-tab]')) {
      button.click();
      values.push({ page: button.dataset.tab, color: getComputedStyle(shadow.querySelector('.panel')).backgroundColor });
    }
    shadow.querySelector('[data-tab="' + selected + '"]')?.click();
    return values;
  })()`);
  if (pages.length !== 4 || pages.some((page) => page.color !== 'rgb(232, 237, 244)')) throw new Error('Page backgrounds diverged');
  console.log(JSON.stringify({ version: original.version, pages, savedColor: temporaryColor }));
} finally {
  try {
    if (changed) {
      await api('/api/ui', { method: 'POST', body: JSON.stringify({ pageColor: originalColor }) });
      await waitColor(originalColor);
    }
  } finally {
    if (panelWasHidden !== null) await evaluate(`document.querySelector('#gptdaddy-desktop-panel').shadowRoot.querySelector('.panel').hidden = ${panelWasHidden}`);
    client.close();
  }
}
