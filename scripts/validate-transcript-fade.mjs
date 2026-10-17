import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Pass the verified Codex CDP port');
const targets = await listCodexTargets({ port });
if (targets.length !== 1) throw new Error(`Expected one official Codex main page, found ${targets.length}`);

const cdp = new CdpClient(targets[0].webSocketDebuggerUrl);
await cdp.connect();
try {
  const expression = `(() => {
    const selector = '#root .thread-scroll-container > [class*="container-name:thread-content"] > .sticky.bottom-0 > .from-surface[class*="_fade_"]';
    const fade = [...document.querySelectorAll(selector)].find(el => el.getBoundingClientRect().width > 0);
    const composer = [...document.querySelectorAll('.ProseMirror')].find(el => el.getBoundingClientRect().width > 0);
    const scroll = fade?.closest('.thread-scroll-container');
    const rect = fade?.getBoundingClientRect();
    return {
      title: document.title,
      viewport: [innerWidth, innerHeight],
      controllerVersion: window.__gptDaddyWallpaperControllerV1?.version,
      context: fade?.getRootNode() === document ? 'document' : 'other',
      fadeRect: rect ? [rect.x, rect.y, rect.width, rect.height].map(Math.round) : null,
      backgroundImage: fade ? getComputedStyle(fade).backgroundImage : null,
      pointerEvents: fade ? getComputedStyle(fade).pointerEvents : null,
      scrollable: !!scroll && getComputedStyle(scroll).overflowY === 'auto',
      composerPresent: !!composer,
      wallpaperPresent: !!document.getElementById('gptdaddy-wallpaper-host'),
      previewAbsent: !document.getElementById('gptdaddy-band-preview')
    };
  })()`;
  const result = await cdp.call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  const value = result.result?.value;
  if (value?.controllerVersion !== '0.2.3' || value.context !== 'document' || value.backgroundImage !== 'none' ||
      value.pointerEvents !== 'none' || !value.scrollable || !value.composerPresent || !value.wallpaperPresent || !value.previewAbsent) {
    throw new Error(`Installed wallpaper validation failed: ${JSON.stringify(value)}`);
  }
  console.log(JSON.stringify(value, null, 2));
} finally {
  cdp.close();
}
