import { CdpClient } from '../src/codex/cdp-client.mjs';
import { listCodexTargets } from '../src/codex/target.mjs';
import { readFile } from 'node:fs/promises';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Pass the verified Codex CDP port');
const targets = await listCodexTargets({ port });
if (targets.length !== 1) throw new Error(`Expected one exact Codex main page, found ${targets.length}`);
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
await client.connect();
try {
  const expression = `new Promise((resolve, reject) => {
    const main = document.querySelector('#root main');
    if (!main) { reject(new Error('Codex main element is unavailable')); return; }
    const fixture = document.createElement('div');
    fixture.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:350px;height:250px;pointer-events:none';
    fixture.setAttribute('aria-hidden', 'true');
    const switcher = document.createElement('div');
    switcher.style.cssText = 'display:flex;width:320px;height:54px';
    const chat = document.createElement('button');
    chat.textContent = '聊天';
    chat.style.backgroundColor = '#fff';
    const work = document.createElement('button');
    work.textContent = '工作';
    work.style.backgroundColor = 'transparent';
    switcher.append(chat, work);
    const codeBlock = document.createElement('div');
    codeBlock.className = 'group/code-snippet';
    codeBlock.style.cssText = 'background-color:#edf8ff;width:320px;height:60px';
    const code = document.createElement('code');
    code.textContent = 'fixture';
    codeBlock.append(code);
    const file = document.createElement('span');
    file.className = '_Mention_fixture';
    file.textContent = 'sample.docx';
    file.style.backgroundColor = '#edf8ff';
    fixture.append(switcher, codeBlock, file);
    main.append(fixture);
    setTimeout(() => {
      try {
        const before = {
          switchMarked: switcher.hasAttribute('data-gptdaddy-chat-work-switch'),
          activeChat: chat.hasAttribute('data-gptdaddy-chat-work-active'),
          codeBackground: getComputedStyle(codeBlock).backgroundColor,
          codeColor: getComputedStyle(code).color,
          fileMarked: file.hasAttribute('data-gptdaddy-file-chip'),
          fileBackground: getComputedStyle(file).backgroundColor,
          fileColor: getComputedStyle(file).color,
        };
        work.click();
        const afterClick = work.hasAttribute('data-gptdaddy-chat-work-active') &&
          !chat.hasAttribute('data-gptdaddy-chat-work-active');
        resolve({ controllerVersion: window.__gptDaddyWallpaperControllerV1?.version, before, afterClick });
      } catch (error) { reject(error); }
      finally { fixture.remove(); }
    }, 2500);
  })`;
  const result = await client.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const value = result.result.value;
  if (value.controllerVersion !== version || !value.before.switchMarked || !value.before.activeChat ||
      !value.before.fileMarked || !value.afterClick) throw new Error(`UI fixture failed: ${JSON.stringify(value)}`);
  if (/^rgb\(237, 248, 255\)$/.test(value.before.codeBackground) ||
      /^rgb\(237, 248, 255\)$/.test(value.before.fileBackground)) throw new Error('A light surface was not replaced');
  console.log(JSON.stringify(value, null, 2));
} finally {
  client.close();
}
