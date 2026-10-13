import { parentPort, workerData } from 'node:worker_threads';
import { enumerateWallpaperSources } from './catalog.mjs';

const started = performance.now();
try {
  const wallpapers = enumerateWallpaperSources({ previous: workerData.previous || [] });
  parentPort.postMessage({ wallpapers, scanMs: Math.round(performance.now() - started) });
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : String(error) });
}
