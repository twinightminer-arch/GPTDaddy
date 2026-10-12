import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readState } from '../src/core/config.mjs';
import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';

const port = Number(process.argv[2]);
if (!Number.isInteger(port)) throw new Error('Pass the verified Codex CDP port');
const token = readState(join(homedir(), 'AppData', 'Local', 'GPTDaddy', 'state.json')).apiToken;
const response = await fetch('http://127.0.0.1:34873/api/status', { headers: { Authorization: `Bearer ${token}` } });
if (!response.ok) throw new Error(`Status returned ${response.status}`);
const status = await response.json();
if (!status.codex?.running || status.codex.cdpPort !== port || !status.codex.cdpLoopbackOnly ||
    !String(status.codex.executablePath).includes('OpenAI.Codex_')) throw new Error('CDP target is not verified OpenAI.Codex');
const targets = await listCodexTargets({ port });
if (targets.length !== 1) throw new Error(`Expected one Codex main page; found ${targets.length}`);

const directory = join(process.cwd(), 'work', 'audit', `codex-chrome-preview-${Date.now()}`);
await mkdir(directory, { recursive: true });
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
async function evaluate(expression) {
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function capture(name) {
  const result = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const path = join(directory, `${name}.png`);
  await writeFile(path, Buffer.from(result.data, 'base64'));
  return path;
}
const css = `
  main, aside, [role="navigation"], [role="main"], [class*="bg-surface"], [class*="bg-elevated"] {
    background-color: rgb(var(--gptdaddy-surface-rgb, 248 250 253) / var(--gptdaddy-panel-opacity, .1)) !important;
    backdrop-filter: blur(var(--gptdaddy-panel-blur, 0px)) !important;
  }
  #root #app-shell-sidebar > div > div {
    background-color: rgb(var(--gptdaddy-surface-rgb, 248 250 253) / var(--gptdaddy-panel-opacity, .1)) !important;
    backdrop-filter: blur(var(--gptdaddy-panel-blur, 0px)) !important;
  }
  #root [class*="MainContentTopFade"], #root main .bg-gradient-to-t.from-surface {
    background-image: none !important;
  }
  [data-radix-popper-content-wrapper], [role="dialog"], [role="menu"] {
    backdrop-filter: blur(var(--gptdaddy-panel-blur, 0px)) !important;
  }
  #root .app-shell-left-panel, #root .app-shell-left-panel :is(div,button,a,span,svg),
  #root [class*="ApplicationMenuTopBar"] button,
  #root header[class*="titlebar" i] :is(div,button,span,svg),
  #root [class*="app-shell-header-toolbar"] :is(div,button,span,svg) {
    color: var(--gptdaddy-font-color) !important;
  }
`;
try {
  await client.connect();
  const before = await evaluate(`(() => ({
    version: window.__gptDaddyWallpaperControllerV1?.version,
    sidebar: getComputedStyle(document.querySelector('#root .app-shell-left-panel button')).color,
    title: getComputedStyle(document.querySelector('#root [class*="app-shell-header-toolbar"] .text-base')).color,
    asideBlur: getComputedStyle(document.querySelector('aside.app-shell-left-panel')).backdropFilter,
    video: window.__gptDaddyWallpaperControllerV1?.snapshot?.(),
  }))()`);
  await evaluate(`(() => {
    const style = document.createElement('style');
    style.id = 'gptdaddy-chrome-validation-preview';
    style.textContent = ${JSON.stringify(css)};
    document.head.append(style);
    document.documentElement.style.setProperty('--gptdaddy-panel-blur', '0px');
    const selectors = ${JSON.stringify([
      '#root .app-shell-left-panel', '#root .app-shell-left-panel div', '#root .app-shell-left-panel button',
      '#root .app-shell-left-panel a', '#root .app-shell-left-panel span', '#root .app-shell-left-panel svg',
      '#root [class*="ApplicationMenuTopBar"] button', '#root header[class*="titlebar" i] button',
      '#root header[class*="titlebar" i] span', '#root header[class*="titlebar" i] svg',
      '#root [class*="app-shell-header-toolbar"] button', '#root [class*="app-shell-header-toolbar"] div',
      '#root [class*="app-shell-header-toolbar"] span', '#root [class*="app-shell-header-toolbar"] svg',
    ])};
    const originals = new Map();
    for (const selector of selectors) for (const element of document.querySelectorAll(selector)) {
      if (!originals.has(element)) originals.set(element, [element.style.getPropertyValue('color'), element.style.getPropertyPriority('color')]);
      element.style.setProperty('color', '#b3bcc6', 'important');
    }
    window.__gptDaddyChromeValidationOriginals = originals;
  })()`);
  const atZero = await evaluate(`(() => ({
    sidebar: getComputedStyle(document.querySelector('#root .app-shell-left-panel button')).color,
    title: getComputedStyle(document.querySelector('#root [class*="app-shell-header-toolbar"] .text-base')).color,
    asideBlur: getComputedStyle(document.querySelector('aside.app-shell-left-panel')).backdropFilter,
    mainBlur: getComputedStyle(document.querySelector('main')).backdropFilter,
  }))()`);
  atZero.screenshot = await capture('blur-0-font-color');
  await evaluate(`document.documentElement.style.setProperty('--gptdaddy-panel-blur', '20px')`);
  const atTwenty = await evaluate(`(() => ({
    asideBlur: getComputedStyle(document.querySelector('aside.app-shell-left-panel')).backdropFilter,
    mainBlur: getComputedStyle(document.querySelector('main')).backdropFilter,
  }))()`);
  atTwenty.screenshot = await capture('blur-20-font-color');
  await evaluate(`(() => {
    document.getElementById('gptdaddy-chrome-validation-preview')?.remove();
    document.documentElement.style.removeProperty('--gptdaddy-panel-blur');
    for (const [element, original] of window.__gptDaddyChromeValidationOriginals || []) {
      if (original[0]) element.style.setProperty('color', original[0], original[1]);
      else element.style.removeProperty('color');
    }
    delete window.__gptDaddyChromeValidationOriginals;
  })()`);
  const restored = await evaluate(`(() => ({
    sidebar: getComputedStyle(document.querySelector('#root .app-shell-left-panel button')).color,
    title: getComputedStyle(document.querySelector('#root [class*="app-shell-header-toolbar"] .text-base')).color,
    asideBlur: getComputedStyle(document.querySelector('aside.app-shell-left-panel')).backdropFilter,
    video: window.__gptDaddyWallpaperControllerV1?.snapshot?.(),
  }))()`);
  const report = { kind: 'temporary Codex renderer preview, not production-daemon activation', processId: status.codex.processId,
    packageVersion: status.codex.packageVersion, cdpPort: port, before, atZero, atTwenty, restored };
  const reportPath = join(directory, 'results.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ reportPath, ...report }, null, 2));
} finally {
  if (client.isOpen()) {
    try { await evaluate(`(() => {
      document.getElementById('gptdaddy-chrome-validation-preview')?.remove();
      document.documentElement.style.removeProperty('--gptdaddy-panel-blur');
      for (const [element, original] of window.__gptDaddyChromeValidationOriginals || []) {
        if (original[0]) element.style.setProperty('color', original[0], original[1]);
        else element.style.removeProperty('color');
      }
      delete window.__gptDaddyChromeValidationOriginals;
    })()`); } catch { /* Target may have navigated. */ }
  }
  client.close();
}
