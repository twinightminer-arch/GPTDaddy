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

test('login-started daemon handles a Codex process created moments earlier', async () => {
  const current = { ...codex(21), processStartedAt: new Date(Date.now() - 45000).toISOString() };
  let count = 0;
  const supervisor = new NativeRestartSupervisor({
    discover: () => current, isEnabled: () => true,
    activate: async () => { count++; return { result: 'passed' }; },
    settleMs: 0,
  });
  supervisor.start();
  await supervisor.initializing;
  await supervisor.tick(0);
  await supervisor.tick(1);
  supervisor.stop();
  assert.equal(count, 1);
});

test('daemon restart does not take over a long-running Codex task', async () => {
  const current = { ...codex(22), processStartedAt: new Date(Date.now() - 120000).toISOString() };
  let count = 0;
  const supervisor = new NativeRestartSupervisor({
    discover: () => current, isEnabled: () => true,
    activate: async () => { count++; return { result: 'passed' }; },
    settleMs: 0,
  });
  supervisor.start();
  await supervisor.initializing;
  await supervisor.tick(0);
  await supervisor.tick(1);
  supervisor.stop();
  assert.equal(count, 0);
});

test('a failed activation blocks only that Codex process', async () => {
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
  await supervisor.tick(3);
  assert.equal(count, 2);
  assert.equal(supervisor.status().blocked, true);
  assert.equal(supervisor.status().blockedPid, 12);
});

test('a reused Windows PID is treated as a new Codex process', async () => {
  let current = { ...codex(41), processStartedAt: '2026-10-14T10:00:00.000+08:00' };
  let count = 0;
  const supervisor = new NativeRestartSupervisor({
    discover: () => current, isEnabled: () => true,
    activate: async () => { count++; return { result: 'failed' }; },
    logger: { warn() {} }, settleMs: 0,
  });
  supervisor.running = true;
  await supervisor.tick(0);
  await supervisor.tick(1);
  assert.equal(supervisor.status().blocked, true);
  current = { ...codex(41), processStartedAt: '2026-10-14T11:00:00.000+08:00' };
  await supervisor.tick(2);
  await supervisor.tick(3);
  assert.equal(count, 2);
});

test('a not-yet-ready window is retried with a bounded cooldown', async () => {
  let current = codex(31);
  let count = 0;
  const supervisor = new NativeRestartSupervisor({
    discover: () => current, isEnabled: () => true,
    activate: async () => { count++; return { result: 'deferred' }; },
    logger: { warn() {} }, settleMs: 0, deferredRetryMs: 30000, maxDeferredAttempts: 2,
  });
  supervisor.running = true;
  await supervisor.tick(0);
  await supervisor.tick(1);
  assert.equal(count, 1);
  assert.equal(supervisor.status().blocked, false);
  await supervisor.tick(2);
  assert.equal(count, 1);
  supervisor.deferred.retryAt = 3;
  await supervisor.tick(3);
  await supervisor.tick(4);
  assert.equal(count, 2);
  assert.equal(supervisor.status().blockedPid, 31);
  current = codex(32);
  await supervisor.tick(5);
  assert.equal(supervisor.status().blocked, false);
  assert.equal(supervisor.status().deferredAttempts, 0);
});
