import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readState } from '../src/core/config.mjs';
import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';

const port = Number(process.argv[2]);
if (!Number.isInteger(port)) throw new Error('Pass the verified Codex CDP port');
const captureScreens = process.argv.includes('--screens');
const token = readState(join(homedir(), 'AppData', 'Local', 'GPTDaddy', 'state.json')).apiToken;
const response = await fetch('http://127.0.0.1:34873/api/status', { headers: { Authorization: `Bearer ${token}` } });
if (!response.ok) throw new Error(`Status returned HTTP ${response.status}`);
const status = await response.json();
if (!status.codex?.running || !status.codex.cdpLoopbackOnly || status.codex.cdpPort !== port ||
    !String(status.codex.executablePath || '').includes('OpenAI.Codex_')) throw new Error('Target is not verified OpenAI.Codex');
const targets = await listCodexTargets({ port });
if (targets.length !== 1) throw new Error(`Expected one Codex main target; found ${targets.length}`);
const directory = join(process.cwd(), 'work', 'audit', `v7-settings-${Date.now()}`);
await mkdir(directory, { recursive: true });
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
async function evaluate(expression) {
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function clickPoint(point) {
  await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
}
async function clickSettingsNav(label) {
  const point = await evaluate(`(() => {
    const label = ${JSON.stringify(label)};
    const button = [...document.querySelectorAll('button[aria-label]')].find((e) => e.getAttribute('aria-label') === label && e.getBoundingClientRect().left >= 45 && e.getBoundingClientRect().left < 350);
    if (!button) return null;
    button.scrollIntoView({ block: 'center' });
    const r = button.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!point) return false;
  await clickPoint(point);
  await new Promise((resolve) => setTimeout(resolve, 450));
  return true;
}
async function snapshot(label) {
  return evaluate(`(() => {
    const group = document.querySelector('[class*="group/settings"]');
    const content = group || document.querySelector('main[class*="MainContentSurface"]');
    const surfaces = content ? [...content.querySelectorAll('*')].map((element) => {
      const r = element.getBoundingClientRect();
      if (r.width < 280 || r.height < 34) return null;
      const style = getComputedStyle(element);
      const bg = style.backgroundColor;
      if (bg === 'rgba(0, 0, 0, 0)') return null;
      return { className: typeof element.className === 'string' ? element.className.slice(0, 900) : '',
        bg, textColor: style.color, text: (element.innerText || '').replace(/\\s+/g, ' ').slice(0, 80),
        w: Math.round(r.width), h: Math.round(r.height) };
    }).filter(Boolean).slice(0, 45) : [];
    const heads = [...(content || document).querySelectorAll('h1,h2,h3')].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 8);
    const cards = group ? [...group.querySelectorAll('[class*="after:inset-x-4"][class*="rounded-2xl"], [class*="ring-border-subtle"][class*="rounded-2xl"]')]
      .slice(0, 30).map((e) => ({ className: typeof e.className === 'string' ? e.className.slice(0, 900) : '', background: getComputedStyle(e).backgroundColor, border: getComputedStyle(e).borderColor,
        text: (e.innerText || '').replace(/\\s+/g, ' ').slice(0, 65) })) : [];
    const controls = group ? [...group.querySelectorAll('button,input,textarea,select,[role="combobox"]')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 60 && r.y >= 0 && r.y < innerHeight; })
      .slice(0, 30).map((e) => ({ tag: e.tagName, role: e.getAttribute('role'), className: typeof e.className === 'string' ? e.className.slice(0, 650) : '',
        background: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color,
        text: (e.innerText || '').replace(/\\s+/g, ' ').slice(0, 45) })) : [];
    return { label: ${JSON.stringify(label)}, title: document.title, groupFound: !!group, heads, surfaces, cards, controls,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map((e) => e.innerText.slice(0, 80)) };
  })()`);
}
const results = [];
try {
  await client.connect();
  const inSettings = await evaluate(`!!document.querySelector('[class*="group/settings"]')`);
  if (!inSettings) {
    const avatar = await evaluate(`(() => { const e = document.querySelector('button[aria-label="打开个人资料菜单"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!avatar) throw new Error('Profile menu trigger not found');
    await clickPoint(avatar);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const settings = await evaluate(`(() => { const e = [...document.querySelectorAll('[role="menuitem"]')].find((item) => item.innerText.trim().startsWith('设置')); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!settings) throw new Error('Profile settings item not found');
    await clickPoint(settings);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const labels = await evaluate(`(() => [...document.querySelectorAll('button[aria-label]')]
    .filter((e) => { const x = e.getBoundingClientRect().left; return x >= 45 && x < 350 && e.getBoundingClientRect().width > 100; })
    .map((e) => e.getAttribute('aria-label')).filter(Boolean))()`);
  for (const label of labels) {
    if (label === '个人资料') { results.push({ label, skipped: 'separate profile route, audited separately' }); continue; }
    try {
      if (!await clickSettingsNav(label)) { results.push({ label, error: 'navigation control disappeared' }); continue; }
      const result = await snapshot(label);
      if (captureScreens) {
        const image = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
        const file = join(directory, `${String(results.length + 1).padStart(2, '0')}-settings.png`);
        await writeFile(file, Buffer.from(image.data, 'base64'));
        result.screenshot = file;
      }
      results.push(result);
    } catch (error) { results.push({ label, error: String(error) }); }
  }
  const file = join(directory, 'results.json');
  await writeFile(file, `${JSON.stringify({ packageVersion: status.codex.packageVersion, results }, null, 2)}\n`);
  console.log(JSON.stringify({ file, total: labels.length, audited: results.filter((r) => r.groupFound).length,
    errors: results.filter((r) => r.error || r.skipped), summary: results.map((r) => ({ label: r.label, heads: r.heads,
      cards: r.cards?.map((c) => c.background), screenshot: r.screenshot,
      largeSurfaces: r.surfaces?.filter((s) => s.w > 500 && s.h > 65).slice(0, 4).map((s) => ({ bg: s.bg, text: s.text, className: s.className.slice(0, 130) })) })) }, null, 2));
} finally {
  if (client.isOpen()) {
    try {
      const home = await evaluate(`(() => { const e = [...document.querySelectorAll('button')].find((item) => item.innerText.trim() === '首页' && item.getBoundingClientRect().left < 55); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      if (home) { await clickPoint(home); await new Promise((resolve) => setTimeout(resolve, 300)); }
      const chat = await evaluate(`(() => { const e = document.querySelector('button[aria-label="codex壁纸插件"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      if (chat) await clickPoint(chat);
    } catch { /* The user's window may have changed during the audit. */ }
  }
  client.close();
}
