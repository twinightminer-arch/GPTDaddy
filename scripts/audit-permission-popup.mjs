import { homedir } from 'node:os';
import { join } from 'node:path';
import { readState } from '../src/core/config.mjs';
import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';

const port = Number(process.argv[2]);
if (!Number.isInteger(port)) throw new Error('Pass the verified Codex CDP port');
const previewColor = process.argv[3];
if (previewColor && !/^#[0-9a-fA-F]{6}$/.test(previewColor)) throw new Error('Preview color must be a six-digit hex color');
const token = readState(join(homedir(), 'AppData', 'Local', 'GPTDaddy', 'state.json')).apiToken;
const response = await fetch('http://127.0.0.1:34873/api/status', { headers: { Authorization: `Bearer ${token}` } });
if (!response.ok) throw new Error(`Status returned HTTP ${response.status}`);
const status = await response.json();
if (!status.codex?.running || !status.codex.cdpLoopbackOnly || status.codex.cdpPort !== port ||
    !String(status.codex.executablePath || '').includes('OpenAI.Codex_')) throw new Error('Target is not verified OpenAI.Codex');
const targets = await listCodexTargets({ port });
if (targets.length !== 1) throw new Error(`Expected one Codex main target; found ${targets.length}`);
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
async function evaluate(expression) {
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function closePopup() {
  await client.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await client.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
}
try {
  await client.connect();
  const triggers = await evaluate(`(() => [...document.querySelectorAll('button,[role="button"]')]
    .filter((element) => /权限|访问|模式/.test(element.innerText + ' ' + (element.getAttribute('aria-label') || '')))
    .map((element) => ({ text: element.innerText.slice(0, 120), aria: element.getAttribute('aria-label'),
      html: element.outerHTML.slice(0, 600), rect: (() => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() }))
    .filter((item) => item.rect.width && item.rect.height))()`);
  const trigger = triggers.find((item) => /完全访问|权限/.test(item.text + ' ' + item.aria));
  if (!trigger) { console.log(JSON.stringify({ triggers, popup: null }, null, 2)); process.exitCode = 2; }
  else {
    await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: trigger.rect.x + trigger.rect.width / 2, y: trigger.rect.y + trigger.rect.height / 2, button: 'left', clickCount: 1 });
    await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: trigger.rect.x + trigger.rect.width / 2, y: trigger.rect.y + trigger.rect.height / 2, button: 'left', clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 160));
    if (previewColor) await evaluate(`(() => {
      const trigger = document.querySelector('button[data-composer-navigation-target="permissions"]');
      const menu = [...document.querySelectorAll('[role="menu"][aria-labelledby]')]
        .find((item) => item.getAttribute('aria-labelledby') === trigger?.id);
      if (!menu) throw new Error('Verified permission menu not found');
      menu.setAttribute('data-gptdaddy-permissions-preview', '');
      const style = document.createElement('style');
      style.id = 'gptdaddy-permissions-preview-style';
      style.textContent = '[role="menu"][data-gptdaddy-permissions-preview] { background-color: ${previewColor} !important; backdrop-filter: none !important; } [role="menu"][data-gptdaddy-permissions-preview] :is(button,span,[role="menuitem"]) { color: #18334f !important; }';
      document.head.append(style);
    })()`);
    const popup = await evaluate(`(() => [...document.querySelectorAll('[role="menu"]')]
      .filter((element) => { const r = element.getBoundingClientRect(); return r.width > 200 && r.height > 80 && /权限|访问/.test(element.innerText || ''); })
      .map((element) => ({ className: element.className, labelledBy: element.getAttribute('aria-labelledby'),
        trigger: document.getElementById(element.getAttribute('aria-labelledby'))?.outerHTML.slice(0, 700),
        text: (element.innerText || '').slice(0, 500), background: getComputedStyle(element).backgroundColor,
        color: getComputedStyle(element).color, blur: getComputedStyle(element).backdropFilter,
        descendants: [...element.querySelectorAll('[role],button,[data-testid]')].slice(0, 20).map((item) => ({
          tag: item.tagName, role: item.getAttribute('role'), testId: item.getAttribute('data-testid'),
          text: (item.innerText || '').slice(0, 100), color: getComputedStyle(item).color,
          background: getComputedStyle(item).backgroundColor,
        })) })) )()`);
    console.log(JSON.stringify({ triggers, popup }, null, 2));
  }
} finally {
  if (client.isOpen()) { try {
    await evaluate(`(() => { document.getElementById('gptdaddy-permissions-preview-style')?.remove();
      for (const item of document.querySelectorAll('[data-gptdaddy-permissions-preview]')) item.removeAttribute('data-gptdaddy-permissions-preview'); })()`);
    await closePopup();
  } catch { /* Window may have closed. */ } }
  client.close();
}
