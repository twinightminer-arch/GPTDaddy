import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Pass the verified Codex CDP port');
const targets = await listCodexTargets({ port });
if (targets.length !== 1) throw new Error(`Expected one exact Codex main page, found ${targets.length}`);
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
try {
  await client.connect();
  const expression = `(() => {
    const root = document.documentElement;
    const names = ['--color-text-primary','--color-text-prose','--user-message-text-color','--codex-base-ink','--wb-text-primary'];
    const previous = names.map((name) => [name, root.style.getPropertyValue(name)]);
    const paragraph = document.querySelector('main p') || document.querySelector('p');
    const before = paragraph ? getComputedStyle(paragraph).color : null;
    const temporaryStyle = document.createElement('style');
    temporaryStyle.textContent = 'html[data-gptdaddy-font-color] #root main :is(p, h1, h2, h3, h4, h5, h6, li, blockquote), html[data-gptdaddy-font-color] #root main :is(p, h1, h2, h3, h4, h5, h6, li, blockquote) span { color: var(--gptdaddy-font-color) !important; }';
    let after;
    try {
      for (const name of names) root.style.setProperty(name, '#9637a8');
      root.setAttribute('data-gptdaddy-font-color', '');
      root.style.setProperty('--gptdaddy-font-color', '#9637a8');
      document.head.append(temporaryStyle);
      after = paragraph ? getComputedStyle(paragraph).color : null;
    } finally {
      temporaryStyle.remove();
      root.removeAttribute('data-gptdaddy-font-color');
      root.style.removeProperty('--gptdaddy-font-color');
      for (const [name, value] of previous) if (value) root.style.setProperty(name, value); else root.style.removeProperty(name);
    }
    const restored = paragraph ? getComputedStyle(paragraph).color : null;
    return { before, after, restored, changed: before !== after, restoredExactly: before === restored };
  })()`;
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true });
  console.log(JSON.stringify(result.result?.value));
} finally { client.close(); }
