import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Worker } from 'node:worker_threads';

export const CATALOG_SCHEMA = 1;

export function readCatalogCache(file) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (value.schemaVersion !== CATALOG_SCHEMA || !Array.isArray(value.wallpapers)) return [];
    return value.wallpapers.filter((item) => item && typeof item.id === 'string' && typeof item.projectRoot === 'string');
  } catch { return []; }
}

export function writeCatalogCache(file, wallpapers) {
  mkdirSync(dirname(file), { recursive: true });
  const partial = `${file}.${process.pid}.partial`;
  writeFileSync(partial, JSON.stringify({ schemaVersion: CATALOG_SCHEMA, savedAt: new Date().toISOString(), wallpapers }));
  renameSync(partial, file);
}

export function scanCatalogInWorker(previous = []) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(process.env.GPTDADDY_CATALOG_WORKER || new URL('./catalog-worker.mjs', import.meta.url), { workerData: { previous } });
    let settled = false;
    worker.once('message', (result) => {
      settled = true;
      if (result.error) reject(new Error(result.error)); else resolve(result);
    });
    worker.once('error', (error) => { settled = true; reject(error); });
    worker.once('exit', (code) => { if (!settled) reject(new Error(`Wallpaper catalog worker exited ${code}`)); });
  });
}

export function catalogCacheFile(dataRoot) { return join(dataRoot, 'catalog-cache.json'); }

export function hasCachedMedia(item) {
  return Boolean(item?.playablePath && existsSync(item.playablePath));
}
