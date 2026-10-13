import { readState } from '../src/core/config.mjs';
import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';

const expectedPid = Number(process.argv[2]);
if (!Number.isInteger(expectedPid) || expectedPid <= 0) throw new Error('Pass an exact Codex main PID');
const state = readState();
const response = await fetch('http://127.0.0.1:34873/api/status', {
  headers: { Authorization: `Bearer ${state.apiToken}` },
});
if (!response.ok) throw new Error(`GPTDaddy status returned ${response.status}`);
const status = await response.json();
if (status.codex?.processId !== expectedPid || !status.codex?.cdpLoopbackOnly ||
    !String(status.codex.executablePath || '').includes('OpenAI.Codex_')) {
  throw new Error('The target is not the verified official Codex process');
}
const targets = await listCodexTargets({ port: status.codex.cdpPort });
if (targets.length !== 1) throw new Error(`Expected one main Codex page, found ${targets.length}`);
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
const evaluate = async (expression) => {
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};
const click = async ({ x, y }) => {
  await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
try {
  await client.connect();
  const file = await evaluate(`(() => {
    const item = document.getElementById('application-menu-trigger-file-menu');
    if (!item || item.getAttribute('role') !== 'menuitem') return null;
    const rect = item.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
  })()`);
  if (!file) throw new Error('The visible Codex File menu was not found');
  await click(file);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const quit = await evaluate(`(() => {
    const item = [...document.querySelectorAll('[role="menuitem"]')]
      .find((candidate) => /^退出 ChatGPT(?:\\s|$)/.test(candidate.innerText.trim()));
    if (!item) return null;
    const rect = item.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
  })()`);
  if (!quit) throw new Error('The Codex File > Quit item was not found');
  // The app may close the WebSocket before the mouse-release response arrives.
  await click(quit).catch(() => {});
  console.log(JSON.stringify({ quitCommandIssued: true, processId: expectedPid }));
} finally {
  client.close();
}
