import test from 'node:test';
import assert from 'node:assert/strict';
import { WallpaperLifecycleManager } from '../src/wallpaper/lifecycle-manager.mjs';

test('ignores an unrelated CDP listener until Codex exposes a verified port', async () => {
  let verifiedPort = null;
  const contactedPorts = [];
  const manager = new WallpaperLifecycleManager({
    port: 9222,
    portProvider: () => verifiedPort,
    listTargets: async ({ port }) => { contactedPorts.push(port); return []; },
  });
  manager.running = true;

  await manager.reconcile();
  assert.deepEqual(contactedPorts, []);
  assert.equal(manager.status().cdpPort, null);

  verifiedPort = 9335;
  await manager.reconcile();
  assert.deepEqual(contactedPorts, [9335]);
  assert.equal(manager.status().cdpPort, 9335);

  verifiedPort = null;
  await manager.reconcile();
  assert.equal(manager.status().cdpPort, null);
  assert.equal(manager.status().connectedTargets, 0);
});
