import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readState } from '../src/core/config.mjs';
import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';

const port = Number(process.argv[2]);
if (!Number.isInteger(port)) throw new Error('Pass the verified Codex CDP port');
const previewColor = process.argv[3] || '#203040';
if (!/^#[0-9a-fA-F]{6}$/.test(previewColor)) throw new Error('Preview color must be a six-digit hex color');
const token = readState(join(homedir(), 'AppData', 'Local', 'GPTDaddy', 'state.json')).apiToken;
const response = await fetch('http://127.0.0.1:34873/api/status', { headers: { Authorization: `Bearer ${token}` } });
if (!response.ok) throw new Error(`Status returned HTTP ${response.status}`);
const status = await response.json();
if (!status.codex?.running || !status.codex.cdpLoopbackOnly || status.codex.cdpPort !== port ||
    !String(status.codex.executablePath || '').includes('OpenAI.Codex_')) throw new Error('Target is not verified OpenAI.Codex');
const targets = await listCodexTargets({ port });
if (targets.length !== 1) throw new Error(`Expected one Codex main target; found ${targets.length}`);
const directory = join(process.cwd(), 'work', 'audit', `v6-live-preview-${Date.now()}`);
await mkdir(directory, { recursive: true });
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
async function evaluate(expression) {
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function clickVisible(selector) {
  const point = await evaluate(`(() => {
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((item) => { const r = item.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (!element) return null;
    const r = element.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!point) throw new Error(`Visible control not found: ${selector}`);
  await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 120));
}
async function closePopup() {
  await client.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await client.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
}
async function screenshot(label) {
  const result = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const file = join(directory, `${label}.png`);
  await writeFile(file, Buffer.from(result.data, 'base64'));
  return file;
}

const previewCss = `
  [role="menu"] { background-color: rgb(20 23 29 / .88) !important; backdrop-filter: blur(18px) saturate(1.12) !important; }
  html[data-gptdaddy-font-color] [role="menu"] :is(button,[role="menuitem"],[role="option"],span,svg) { color: #b3bcc6 !important; }
  [class*="ComposerTopMenuShell"] > div,
  [class*="ComposerTopMenuShell"] .text-codex-description.sticky { background-color: ${previewColor} !important; backdrop-filter: none !important; }
  html[data-gptdaddy-font-color] [class*="ComposerTopMenuShell"] :is(button,span,svg) { color: #b3bcc6 !important; }
  #root [class*="ComposerLayoutRoot"] { background-color: ${previewColor} !important; }
`;
try {
  await client.connect();
  const before = await evaluate(`(() => ({
    controllerVersion: window.__gptDaddyWallpaperControllerV1?.version,
    textToken: getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim(),
    composer: getComputedStyle(document.querySelector('[class*="ComposerLayoutRoot"]')).backgroundColor,
    video: window.__gptDaddyWallpaperControllerV1?.snapshot?.(),
  }))()`);
  await evaluate(`(() => {
    const root = document.documentElement;
    window.__gptDaddyV6PreviewOriginals = ['--color-text','--color-text-secondary','--color-codex-description']
      .map((name) => [name, root.style.getPropertyValue(name), root.style.getPropertyPriority(name)]);
    root.style.setProperty('--color-text', '#b3bcc6');
    root.style.setProperty('--color-text-secondary', 'color-mix(in srgb, #b3bcc6 74%, transparent)');
    root.style.setProperty('--color-codex-description', 'color-mix(in srgb, #b3bcc6 74%, transparent)');
    const style = document.createElement('style');
    style.id = 'gptdaddy-v6-validation-style';
    style.textContent = ${JSON.stringify(previewCss)};
    document.head.append(style);
  })()`);
  await clickVisible('button[aria-label^="切换模式"]');
  const mode = await evaluate(`(() => {
    const menu = [...document.querySelectorAll('[role="menu"]')].find((e) => e.getBoundingClientRect().width > 100);
    const item = menu?.querySelector('[role="menuitem"]');
    return menu && item ? { background: getComputedStyle(menu).backgroundColor,
      blur: getComputedStyle(menu).backdropFilter, text: getComputedStyle(item).color } : null;
  })()`);
  mode.screenshot = await screenshot('mode-menu');
  await closePopup();
  await clickVisible('button[aria-label="添加文件等内容"]');
  const add = await evaluate(`(() => {
    const shell = [...document.querySelectorAll('[class*="ComposerTopMenuShell"]')]
      .find((e) => e.getBoundingClientRect().width > 100);
    const surface = shell?.firstElementChild;
    const composer = document.querySelector('[class*="ComposerLayoutRoot"]');
    return surface && composer ? { background: getComputedStyle(surface).backgroundColor,
      blur: getComputedStyle(surface).backdropFilter,
      composerBackground: getComputedStyle(composer).backgroundColor,
      itemColor: getComputedStyle(shell.querySelector('button')).color } : null;
  })()`);
  add.screenshot = await screenshot('add-menu');
  await closePopup();
  const report = { kind: 'temporary Codex renderer preview; daemon source not reloaded', processId: status.codex.processId,
    packageVersion: status.codex.packageVersion, cdpPort: port, before, mode, add };
  const file = join(directory, 'results.json');
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ file, ...report }, null, 2));
} finally {
  if (client.isOpen()) {
    try {
      await closePopup();
      await evaluate(`(() => {
        document.getElementById('gptdaddy-v6-validation-style')?.remove();
        const root = document.documentElement;
        for (const [name, value, priority] of window.__gptDaddyV6PreviewOriginals || []) {
          if (value) root.style.setProperty(name, value, priority);
          else root.style.removeProperty(name);
        }
        delete window.__gptDaddyV6PreviewOriginals;
      })()`);
    } catch { /* Target may have navigated. */ }
  }
  client.close();
}
