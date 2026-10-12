import test from 'node:test';
import assert from 'node:assert/strict';
import { isCodexMainTarget } from '../src/codex/target.mjs';

test('allows only the exact Codex main page target', () => {
  assert.equal(isCodexMainTarget({ type: 'page', url: 'app://-/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1/main' }), true);
  assert.equal(isCodexMainTarget({ type: 'page', url: 'app://-/index.html?initialRoute=%2Favatar-overlay', webSocketDebuggerUrl: 'ws://127.0.0.1/overlay' }), false);
  assert.equal(isCodexMainTarget({ type: 'page', url: 'https://chatgpt.com/', webSocketDebuggerUrl: 'ws://127.0.0.1/web' }), false);
});
