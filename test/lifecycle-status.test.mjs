import test from 'node:test';
import assert from 'node:assert/strict';
import { WallpaperLifecycleManager } from '../src/wallpaper/lifecycle-manager.mjs';

test('saved desired wallpaper is not reported as active without a rendered target', () => {
  const manager = new WallpaperLifecycleManager();
  manager.config = { sourceToken: 'source-a' };
  assert.equal(manager.status().desired, true);
  assert.equal(manager.status().active, false);
  assert.equal(manager.status().playbackHealthy, false);
});

test('status requires matching source and recent presented frames', () => {
  const manager = new WallpaperLifecycleManager();
  manager.config = { sourceToken: 'source-a' };
  manager.clients.set('target', { lastMetrics: { installed: true, sourceUrl: 'source-b', readyState: 4, paused: false, lastFrameAgeMs: 100, presentedCallbacks: 1 } });
  assert.equal(manager.status().active, false);
  manager.clients.get('target').lastMetrics.sourceUrl = 'source-a';
  manager.clients.get('target').lastMetrics.lastFrameAgeMs = 7000;
  assert.equal(manager.status().active, true);
  assert.equal(manager.status().playbackHealthy, false);
  manager.clients.get('target').lastMetrics.lastFrameAgeMs = 100;
  assert.equal(manager.status().playbackHealthy, true);
  manager.clients.get('target').lastMetrics.presentedCallbacks = 0;
  assert.equal(manager.status().playbackHealthy, false);
});
