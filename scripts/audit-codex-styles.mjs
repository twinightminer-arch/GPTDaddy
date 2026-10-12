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
    const selectors = ['html', 'body', '#root', 'main', 'aside', 'nav', 'header', 'section', '[role="main"]', 'p', 'button', 'textarea'];
    return selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return { selector, found: false };
      const style = getComputedStyle(element);
      return { selector, tag: element.tagName, className: String(element.className || '').slice(0, 160), color: style.color, backgroundColor: style.backgroundColor, colorScheme: style.colorScheme, opacity: style.opacity };
    });
  })()`;
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true });
  console.log(JSON.stringify(result.result?.value, null, 2));
} finally {
  client.close();
}
