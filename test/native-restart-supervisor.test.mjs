import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleNativeLaunch, NativeRestartSupervisor, parseActivationReport } from '../src/codex/native-restart-supervisor.mjs';

test('accepts a PowerShell UTF-8 BOM in the activation report', () => {
  assert.equal(parseActivationReport('\uFEFF{"result":"passed"}').result, 'passed');
});

const codex = (processId, cdpEnabled = false) => ({
  installed: true, running: true, processId, cdpEnabled,
  executablePath: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe',
});

test('only the verified official packaged Codex is eligible', () => {
  assert.equal(eligibleNativeLaunch(codex(123), true), true);
  assert.equal(eligibleNativeLaunch(codex(123, true), true), false);
  assert.equal(eligibleNativeLaunch({ ...codex(123), executablePath: 'C:\\Other\\ChatGPT.exe' }, true), false);
  assert.equal(eligibleNativeLaunch(codex(123), false), false);
});

test('ignores an already-running Codex and attempts a newly launched PID once', async () => {
  let current = codex(10);
  const calls = [];
  const supervisor = new NativeRestartSupervisor({
    discover: () => current, isEnabled: () => true,
    activate: async (args) => { calls.push(args); return { result: 'passed' }; },
    reportPath: 'report.json', cdpPort: 9335, settleMs: 8000,
  });
  supervisor.running = true;
  supervisor.initialPid = 10;
  await supervisor.tick(0);
  assert.equal(calls.length, 0);
  current = codex(11);
  await supervisor.tick(1000);
  await supervisor.tick(8999);
  assert.equal(calls.length, 0);
  await supervisor.tick(9000);
  await supervisor.tick(20000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].processId, 11);
});

test('a failed activation blocks further restarts until daemon restart', async () => {
  let current = codex(11);
  let count = 0;
  const supervisor = new NativeRestartSupervisor({
    discover: () => current, isEnabled: () => true,
    activate: async () => { count++; return { result: 'failed' }; },
    logger: { warn() {} }, settleMs: 0,
  });
  supervisor.running = true;
  await supervisor.tick(0);
  await supervisor.tick(1);
  current = codex(12);
  await supervisor.tick(2);
  assert.equal(count, 1);
  assert.equal(supervisor.status().blocked, true);
});
