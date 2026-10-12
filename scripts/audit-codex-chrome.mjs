import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readState } from '../src/core/config.mjs';
import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Pass the verified Codex CDP port');
const token = readState(join(homedir(), 'AppData', 'Local', 'GPTDaddy', 'state.json')).apiToken;
const response = await fetch('http://127.0.0.1:34873/api/status', { headers: { Authorization: `Bearer ${token}` } });
if (!response.ok) throw new Error(`GPTDaddy status returned HTTP ${response.status}`);
const status = await response.json();
if (!status.codex?.running || !status.codex.cdpLoopbackOnly || status.codex.cdpPort !== port ||
    !String(status.codex.executablePath || '').includes('OpenAI.Codex_')) {
  throw new Error('The CDP port is not verified against the official OpenAI.Codex process');
}
const targets = await listCodexTargets({ port });
if (targets.length !== 1) throw new Error(`Expected one exact Codex main page, found ${targets.length}`);
const expression = `(() => {
  const describe = (el) => {
    if (!el) return null;
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 7; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += '#' + n.id;
      const cls = (typeof n.className === 'string' ? n.className : '').trim().split(/\\s+/).filter(Boolean).slice(0, 3);
      if (cls.length) s += '.' + cls.join('.');
      parts.unshift(s);
    }
    const cs = getComputedStyle(el);
    const svg = el.matches('svg,path') ? el : el.querySelector('svg,path');
    const r = el.getBoundingClientRect();
    return {
      selector: parts.join(' > '),
      text: (el.textContent || '').trim().slice(0, 40),
      attrLabel: el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title') || null),
      color: cs.color, fill: cs.fill, backgroundColor: cs.backgroundColor, backdropFilter: cs.backdropFilter,
      svgFill: svg ? getComputedStyle(svg).fill : null,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    };
  };
  const all = [...document.querySelectorAll('*')];
  const sidebar = all.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.left < 360 && r.width > 40 && r.height > 12 && r.height < 200
      && (el.textContent || '').trim().length > 1 && getComputedStyle(el).visibility !== 'hidden'
      && !['SCRIPT','STYLE','SVG','PATH'].includes(el.tagName);
  }).slice(0, 16).map(describe);
  const topLeft = all.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top < 64 && r.left < 560 && r.width > 16 && r.height >= 8 && r.height <= 64
      && (el.textContent || '').trim().length > 1 && el.children.length < 3
      && getComputedStyle(el).visibility !== 'hidden';
  }).slice(0, 8).map(describe);
  const topRight = [...document.querySelectorAll('button, [role="button"], [class*="window" i], [class*="caption" i], [class*="title" i], svg, [aria-label]')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top < 64 && r.right > window.innerWidth - 300 && r.width > 0 && r.width < 90 && r.height > 0;
    }).slice(0, 12).map(describe);
  const nativeWindowButtonCandidates = all.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= 38 && r.right > innerWidth - 180 && r.width > 4 && r.width < 90 &&
      el.matches('button, [role="button"], svg, [aria-label]');
  }).map(describe);
  const titleText = [...document.querySelectorAll('header[class*="titlebar" i] *, [class*="app-shell-header-toolbar"] *')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 35 && r.bottom <= 100 && r.width > 4 && r.width < 500 &&
        (el.textContent || '').trim().length > 1 && el.children.length < 2;
    }).slice(0, 20).map(describe);
  const surfaceLayers = all.filter((el) => {
    const r = el.getBoundingClientRect();
    const bg = getComputedStyle(el).backgroundColor;
    return r.left < 400 && r.top < 160 && r.width > 200 && r.height > 400 &&
      bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
  }).slice(0, 30).map(describe);
  const pointLayers = [
    [600, 100], [600, 110], [600, 130], [600, 710], [600, 730], [600, 750],
  ].map(([x, y]) => ({ x, y, layers: (() => {
    const layers = [];
    for (let el = document.elementFromPoint(x, y); el && layers.length < 12; el = el.parentElement) {
      const cs = getComputedStyle(el);
      layers.push({ ...describe(el), backgroundImage: cs.backgroundImage, boxShadow: cs.boxShadow,
        borderTop: cs.borderTop, borderBottom: cs.borderBottom, filter: cs.filter,
        opacity: cs.opacity, overflow: cs.overflow });
    }
    return layers;
  })() }));
  const overlayLayers = all.filter((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.left > 300 && r.width > 500 && r.height < 250 && r.height > 10 &&
      (cs.position === 'absolute' || cs.position === 'fixed') &&
      (r.top < 180 || r.bottom > innerHeight - 180);
  }).slice(0, 35).map((el) => {
    const cs = getComputedStyle(el);
    return { ...describe(el), className: el.getAttribute('class'), maskImage: cs.maskImage,
      backgroundImage: cs.backgroundImage, boxShadow: cs.boxShadow, opacity: cs.opacity,
      pointerEvents: cs.pointerEvents, position: cs.position };
  });
  const candidates = ['nav','aside','header','.app-shell-left-panel','#app-shell-sidebar','#app-shell-sidebar > div','[class*="sidebar" i]','[class*="titlebar" i]','[class*="caption" i]']
    .map((selector) => ({ selector, element: document.querySelector(selector) }))
    .filter((item) => item.element)
    .map(({ selector, element }) => ({ selector, sample: describe(element), variables: Object.fromEntries(
      ['--color-text-primary','--color-text-prose','--color-text-secondary-solid','--app-color-foreground-application-menu','--color-codex-terminal-foreground']
        .map((name) => [name, getComputedStyle(element).getPropertyValue(name).trim()])
    ) }));
  return { viewport: { w: innerWidth, h: innerHeight }, sidebar, topLeft, topRight, nativeWindowButtonCandidates, titleText, surfaceLayers, pointLayers, overlayLayers, candidates };
})()`;

const client = new CdpClient(targets[0].webSocketDebuggerUrl);
try {
  await client.connect();
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const data = result.result?.value;
  const directory = join(process.cwd(), 'work', 'audit');
  await mkdir(directory, { recursive: true });
  const file = join(directory, `codex-chrome-dom-${new Date().toISOString().replaceAll(':', '-')}.json`);
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(JSON.stringify({ verifiedCodex: { processId: status.codex.processId, cdpPort: port, packageVersion: status.codex.packageVersion }, file, data }, null, 2));
} finally { client.close(); }
