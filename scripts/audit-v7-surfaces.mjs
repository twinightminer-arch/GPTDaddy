import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { readState } from '../src/core/config.mjs';
import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';

const port = Number(process.argv[2]);
if (!Number.isInteger(port)) throw new Error('Pass the verified Codex CDP port');
const action = process.argv[3]?.startsWith('--') ? '' : process.argv[3] || '';
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
try {
  await client.connect();
  if (action) {
    const target = await evaluate(`(() => {
      const action = ${JSON.stringify(action)};
      const items = [...document.querySelectorAll('button,[role="menuitem"],[role="button"],a')];
      const match = action === 'avatar' ? items.find((e) => e.getAttribute('aria-label') === '打开个人资料菜单')
        : action === 'home' ? items.find((e) => e.getBoundingClientRect().left < 55 && e.innerText.trim() === '首页')
        : action === 'library' || action === 'plugins' ? items.find((e) => e.getBoundingClientRect().left < 55 && e.innerText.trim() === (action === 'library' ? '资料库' : '插件'))
        : action === 'chat' ? items.find((e) => e.getAttribute('aria-label') === 'codex壁纸插件')
        : action.startsWith('menu:') ? items.find((e) => e.getAttribute('role') === 'menuitem' && e.innerText.trim().startsWith(action.slice(5)))
        : action.startsWith('content:') ? items.find((e) => e.innerText.trim() === action.slice(8) && e.getBoundingClientRect().left > 400 && e.getBoundingClientRect().width > 0)
        : action.startsWith('text:') ? items.find((e) => e.innerText.trim() === action.slice(5) && e.getBoundingClientRect().width > 0)
        : null;
      if (!match) return null;
      const r = match.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, html: match.outerHTML.slice(0, 500) };
    })()`);
    if (!target) throw new Error(`Control not found for action ${action}`);
    await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 });
    await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const snapshot = await evaluate(`(() => {
    const nodes = [...document.querySelectorAll('body *')];
    const described = nodes.map((element) => {
      const r = element.getBoundingClientRect();
      if (r.width < 300 || r.height < 38 || r.height > innerHeight * 1.2 || r.top > innerHeight || r.bottom < 0) return null;
      const css = getComputedStyle(element);
      const bg = css.backgroundColor;
      const match = bg.match(/rgba?\\(([^)]+)\\)/);
      const srgb = bg.match(/color\\(srgb ([\\d.]+) ([\\d.]+) ([\\d.]+)/);
      if (!match && !srgb) return null;
      const values = match ? match[1].split(',').map(Number) : srgb.slice(1, 4).map((v) => Number(v) * 255);
      if (values.slice(0, 3).some((v) => v < 215) || (values[3] !== undefined && values[3] < 0.55)) return null;
      return { tag: element.tagName.toLowerCase(), className: typeof element.className === 'string' ? element.className.slice(0, 1200) : '',
        id: element.id, role: element.getAttribute('role'), text: (element.innerText || '').replace(/\\s+/g, ' ').slice(0, 100),
        bg, color: css.color, backgroundImage: css.backgroundImage.slice(0, 90),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        ancestry: (() => { const chain = []; let current = element; for (let i = 0; i < 5 && current; i++, current = current.parentElement)
          chain.push({ tag: current.tagName, className: typeof current.className === 'string' ? current.className.slice(0, 350) : '', role: current.getAttribute('role') }); return chain; })() };
    }).filter(Boolean);
    const srgbSurfaces = nodes.map((element) => { const css = getComputedStyle(element); if (!css.backgroundColor.startsWith('color(srgb')) return null;
      const r = element.getBoundingClientRect(); if (r.width * r.height < 7000) return null;
      return { className: typeof element.className === 'string' ? element.className.slice(0, 700) : '', bg: css.backgroundColor,
        text: (element.innerText || '').replace(/\\s+/g, ' ').slice(0, 80), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }; }).filter(Boolean).slice(0, 25);
    const buttons = nodes.filter((e) => e.matches('button,[role=button],a') && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().top >= 0 && e.getBoundingClientRect().left < 550)
      .map((e) => ({ text: (e.innerText || '').trim().slice(0, 75), aria: e.getAttribute('aria-label'),
        className: typeof e.className === 'string' ? e.className.slice(0, 120) : '',
        rect: (() => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() }));
    const topRegion = nodes.map((element) => { const r = element.getBoundingClientRect(); if (r.x < 50 || r.y < 35 || r.y > 150 || r.width < 400 || r.height < 45 || r.height > 170) return null;
      const css = getComputedStyle(element); return { tag: element.tagName, className: typeof element.className === 'string' ? element.className.slice(0, 500) : '',
        text: (element.innerText || '').replace(/\\s+/g, ' ').slice(0, 70), bg: css.backgroundColor,
        backgroundImage: css.backgroundImage.slice(0, 80), beforeBg: getComputedStyle(element, '::before').backgroundColor,
        afterBg: getComputedStyle(element, '::after').backgroundColor,
        parentClass: typeof element.parentElement?.className === 'string' ? element.parentElement.className.slice(0, 250) : '',
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }; }).filter(Boolean).slice(-25);
    const pointPath = (() => { const result = []; let element = document.elementFromPoint(innerWidth * .53, innerHeight * .68);
      while (element && result.length < 8) { const css = getComputedStyle(element); result.push({ tag: element.tagName,
        className: typeof element.className === 'string' ? element.className.slice(0, 700) : '',
        bg: css.backgroundColor, color: css.color, text: (element.innerText || '').replace(/\\s+/g, ' ').slice(0, 80) });
        element = element.parentElement; } return result; })();
    const composerNodes = [...document.querySelectorAll('[class*="home-composer-layout"] *, [data-composer-utility-bar-variant="home"] *')]
      .map((element) => { const r = element.getBoundingClientRect(); if (r.width < 250 || r.height < 20 || r.height > 400) return null;
        const css = getComputedStyle(element); return { tag: element.tagName, className: typeof element.className === 'string' ? element.className.slice(0, 650) : '',
          bg: css.backgroundColor, before: getComputedStyle(element, '::before').backgroundColor, after: getComputedStyle(element, '::after').backgroundColor,
          color: css.color, borderRadius: css.borderRadius, overflow: css.overflow, margin: css.margin, padding: css.padding,
          text: (element.innerText || '').replace(/\s+/g, ' ').slice(0, 70),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }; }).filter(Boolean).slice(-35);
    const topRight = [...document.querySelectorAll('body *')].map((element) => { const r = element.getBoundingClientRect();
      if (r.right < innerWidth - 190 || r.top > 55 || r.bottom < 0 || r.width < 8 || r.width > 240 || r.height < 8 || r.height > 70) return null;
      const css = getComputedStyle(element); return { tag: element.tagName, className: typeof element.className === 'string' ? element.className.slice(0, 300) : '',
        aria: element.getAttribute('aria-label'), role: element.getAttribute('role'), html: element.outerHTML.slice(0, 550),
        color: css.color, bg: css.backgroundColor, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }; }).filter(Boolean).slice(0, 40);
    const topRightPoints = [innerWidth - 36, innerWidth - 105, innerWidth - 174].map((x) => { const element = document.elementFromPoint(x, 20);
      return { x, html: element?.outerHTML.slice(0, 500), className: element?.className }; });
    const headerControls = [...(document.querySelector('#root [class^="_shell_"]:has([class^="_headerRow_"])')?.querySelectorAll('input,button') || [])]
      .slice(0, 18).map((element) => { const css = getComputedStyle(element); return { tag: element.tagName, aria: element.getAttribute('aria-label'),
        placeholder: element.getAttribute('placeholder'), text: (element.innerText || '').slice(0, 45),
        className: typeof element.className === 'string' ? element.className.slice(0, 500) : '', bg: css.backgroundColor, color: css.color }; });
    const headerSearchPath = (() => { const result = []; let element = document.querySelector('#root [class^="_shell_"] input[placeholder^="搜索"]');
      while (element && result.length < 5) { const css = getComputedStyle(element); result.push({ className: typeof element.className === 'string' ? element.className.slice(0, 600) : '',
        bg: css.backgroundColor, color: css.color, placeholder: getComputedStyle(element, '::placeholder').color }); element = element.parentElement; } return result; })();
    return { href: location.href, title: document.title, controllerVersion: window.__gptDaddyWallpaperControllerV1?.version,
      windowControlsOverlay: navigator.windowControlsOverlay ? { visible: navigator.windowControlsOverlay.visible,
        rect: navigator.windowControlsOverlay.getTitlebarAreaRect?.().toJSON?.() } : null,
      composerAttribute: document.documentElement.hasAttribute('data-gptdaddy-composer-color'), composerNodes, topRight, topRightPoints, headerControls, headerSearchPath,
      composerVariable: document.documentElement.style.getPropertyValue('--gptdaddy-composer-surface'), topRegion, pointPath, srgbSurfaces,
      popupMenus: [...document.querySelectorAll('[role=menu]')].map((e) => ({ text: e.innerText.slice(0, 120), role: e.getAttribute('role'),
        labelledBy: e.getAttribute('aria-labelledby'), trigger: document.getElementById(e.getAttribute('aria-labelledby'))?.outerHTML.slice(0, 600),
        profileMarker: e.hasAttribute('data-gptdaddy-profile-menu'), className: e.className, background: getComputedStyle(e).backgroundColor,
        color: getComputedStyle(e).color, blur: getComputedStyle(e).backdropFilter,
        items: [...e.querySelectorAll('[role=menuitem]')].slice(0, 12).map((item) => ({ text: item.innerText.slice(0, 60), color: getComputedStyle(item).color, bg: getComputedStyle(item).backgroundColor })) })),
      whiteSurfaces: described.slice(-30), buttons: buttons.slice(0, 65) };
  })()`);
  const report = { processId: status.codex.processId, packageVersion: status.codex.packageVersion, ...snapshot };
  if (process.argv.includes('--screen')) {
    const image = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    report.screenshot = join(process.cwd(), 'work', 'audit', `v7-surface-${Date.now()}.png`);
    await writeFile(report.screenshot, Buffer.from(image.data, 'base64'));
  }
  if (action) report.buttons = report.buttons.filter((item) => item.rect.x >= 60 && item.rect.w > 45).slice(0, 45);
  console.log(JSON.stringify(report, null, 2));
} finally { client.close(); }
