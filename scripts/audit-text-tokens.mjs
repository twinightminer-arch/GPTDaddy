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
    const style = getComputedStyle(document.documentElement);
    const values = [];
    for (let i = 0; i < style.length; i++) {
      const name = style[i];
      if (name.startsWith('--') && /text|foreground|fg-|content|ink/.test(name)) values.push([name, style.getPropertyValue(name).trim()]);
    }
    return values.slice(0, 150);
  })()`;
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true });
  console.log(JSON.stringify(result.result?.value, null, 2));
} finally { client.close(); }
