import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Pass the verified Codex CDP port');
const targets = await listCodexTargets({ port });
if (targets.length !== 1) throw new Error(`Expected one exact Codex main page, found ${targets.length}`);

const client = new CdpClient(targets[0].webSocketDebuggerUrl);
try {
  await client.connect();
  await client.call('Page.enable');
  const result = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  if (!result.data) throw new Error('Codex did not return a screenshot');
  const directory = join(process.cwd(), 'work', 'audit');
  await mkdir(directory, { recursive: true });
  const file = join(directory, `codex-live-${new Date().toISOString().replaceAll(':', '-')}.png`);
  await writeFile(file, Buffer.from(result.data, 'base64'));
  console.log(file);
} finally {
  client.close();
}
