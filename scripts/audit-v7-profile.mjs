import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readState } from '../src/core/config.mjs';
import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';

const port = Number(process.argv[2]);
const token = readState(join(homedir(), 'AppData', 'Local', 'GPTDaddy', 'state.json')).apiToken;
const response = await fetch('http://127.0.0.1:34873/api/status', { headers: { Authorization: `Bearer ${token}` } });
const status = await response.json();
if (!Number.isInteger(port) || !status.codex?.running || !status.codex.cdpLoopbackOnly || status.codex.cdpPort !== port ||
    !String(status.codex.executablePath || '').includes('OpenAI.Codex_')) throw new Error('Target is not verified OpenAI.Codex');
const targets = await listCodexTargets({ port });
if (targets.length !== 1) throw new Error('Expected one Codex main target');
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
const directory = join(process.cwd(), 'work', 'audit', `v7-profile-${Date.now()}`);
await mkdir(directory, { recursive: true });
async function evaluate(expression) {
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function click(kind, value) {
  const point = await evaluate(`(() => {
    const candidates = [...document.querySelectorAll('button,[role="menuitem"]')];
    const element = candidates.find((item) => {
      const r = item.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.y < 0 || r.y >= innerHeight) return false;
      if (${JSON.stringify(kind)} === 'aria') return item.getAttribute('aria-label') === ${JSON.stringify(value)};
      if (${JSON.stringify(kind)} === 'menu') return item.getAttribute('role') === 'menuitem' && item.closest('[data-gptdaddy-profile-menu]') && item.innerText.trim().startsWith(${JSON.stringify(value)});
      return item.innerText.trim() === ${JSON.stringify(value)} && r.x > 400;
    });
    if (!element) return null;
    const r = element.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!point) throw new Error(`Control not found: ${kind} ${value}`);
  await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 450));
}
async function inspect(label) {
  const surfaces = await evaluate(`(() => [...document.querySelectorAll('body *')].map((element) => {
    const r = element.getBoundingClientRect(); if (r.width < 120 || r.height < 45 || r.x < 70) return null;
    const css = getComputedStyle(element); const bg = css.backgroundColor;
    if (!bg.startsWith('color(srgb') && bg !== 'rgb(238, 248, 255)' && bg !== 'rgb(237, 248, 255)') return null;
    return { className: typeof element.className === 'string' ? element.className.slice(0, 500) : '', bg,
      color: css.color, text: (element.innerText || '').replace(/\\s+/g, ' ').slice(0, 80),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      ancestry: (() => { const chain = []; let current = element; for (let i = 0; i < 5 && current; i++, current = current.parentElement)
        chain.push({ tag: current.tagName, className: typeof current.className === 'string' ? current.className.slice(0, 350) : '' }); return chain; })() };
  }).filter(Boolean).slice(0, 45))()`);
  const image = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const file = join(directory, `${label}.png`);
  await writeFile(file, Buffer.from(image.data, 'base64'));
  return { label, file, surfaces };
}
const results = [];
try {
  await client.connect();
  await click('aria', '打开个人资料菜单');
  if (!await evaluate(`!![...document.querySelectorAll('[role="menuitem"]')].find((item) => item.innerText.trim().startsWith('剩余用量'))`)) {
    await click('aria', '打开个人资料菜单');
  }
  results.push(await inspect('avatar-menu'));
  await click('menu', '剩余用量');
  results.push(await inspect('usage-submenu'));
  await click('menu', '帮助');
  results.push(await inspect('help-submenu'));
  for (let attempt = 0; attempt < 2 && !await evaluate(`!![...document.querySelectorAll('[role="menuitem"]')].find((item) => item.innerText.trim().startsWith('设置'))`); attempt++) {
    await click('aria', '打开个人资料菜单');
  }
  await click('menu', '设置');
  await click('aria', '个人资料');
  results.push(await inspect('profile'));
  await click('text', '编辑');
  results.push(await inspect('profile-edit'));
  const file = join(directory, 'results.json');
  await writeFile(file, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({ file, summary: results.map((r) => ({ label: r.label, image: r.file, surfaces: r.surfaces })) }, null, 2));
} finally {
  if (client.isOpen()) {
    try {
      const home = await evaluate(`(() => { const e = [...document.querySelectorAll('button')].find((item) => item.innerText.trim() === '首页' && item.getBoundingClientRect().left < 55); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      if (home) { await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...home, button: 'left', clickCount: 1 }); await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...home, button: 'left', clickCount: 1 }); await new Promise((resolve) => setTimeout(resolve, 350)); }
      await click('aria', 'codex壁纸插件');
    }
    catch { /* The user may have changed the window. */ }
  }
  client.close();
}
