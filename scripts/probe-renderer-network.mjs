import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Pass the verified Codex CDP port');
const targets = await listCodexTargets({ port });
if (targets.length !== 1) throw new Error(`Expected one exact Codex main page, found ${targets.length}`);
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
try {
  await client.connect();
  const expression = `Promise.all([
    fetch('http://127.0.0.1:34873/health').then((r) => ({ mode:'cors', ok:r.ok, status:r.status })).catch((e) => ({ mode:'cors', error:String(e) })),
    fetch('http://127.0.0.1:34873/health', { mode:'no-cors' }).then((r) => ({ mode:'no-cors', type:r.type, status:r.status })).catch((e) => ({ mode:'no-cors', error:String(e) }))
  ])`;
  const result = await client.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(result.result?.value, null, 2));
} finally {
  client.close();
}
