import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { LocalWallpaperStore, sniffWallpaper } from '../src/wallpaper/local-imports.mjs';
import { readCatalogCache, writeCatalogCache } from '../src/wallpaper/catalog-cache.mjs';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitReady(store, id) {
  for (let index = 0; index < 80; index += 1) {
    const item = store.list().find((row) => row.id === id);
    if (item.status !== 'processing') return item;
    await delay(100);
  }
  throw new Error('Imported video preparation timed out');
}

test('sniffs content rather than trusting the extension', () => {
  assert.equal(sniffWallpaper(Buffer.from('MZ executable'), '.png'), null);
  assert.equal(sniffWallpaper(Buffer.from('GIF89a rest'), '.gif').animated, true);
});

test('imports image and video formats into managed storage without deleting originals', async (context) => {
  const directory = mkdtempSync(join(process.cwd(), '.gptdaddy-import-test-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const ffmpeg = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
  const ffprobe = 'C:\\ffmpeg\\bin\\ffprobe.exe';
  if (!existsSync(ffmpeg) || !existsSync(ffprobe)) { context.skip('Local FFmpeg tools are unavailable'); return; }
  const sources = [
    ['png', ['-f', 'lavfi', '-i', 'color=c=red:s=32x32:d=0.2', '-frames:v', '1']],
    ['jpg', ['-f', 'lavfi', '-i', 'color=c=blue:s=32x32:d=0.2', '-frames:v', '1']],
    ['gif', ['-f', 'lavfi', '-i', 'testsrc=s=32x32:r=5:d=0.4']],
    ['mp4', ['-f', 'lavfi', '-i', 'testsrc=s=32x32:r=5:d=0.4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']],
    ['webm', ['-f', 'lavfi', '-i', 'testsrc=s=32x32:r=5:d=0.4', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40']],
  ];
  const store = new LocalWallpaperStore(directory, { ffmpeg, ffprobe, generatePreviews: false, logger: { warn() {} } });
  const imported = [];
  for (const [extension, args] of sources) {
    const source = join(directory, `source.${extension}`);
    execFileSync(ffmpeg, ['-v', 'error', '-y', ...args, source], { timeout: 30000, windowsHide: true });
    const item = await store.importStream(Readable.from([readFileSync(source)]), `sample.${extension}`);
    imported.push(item);
    assert.equal(existsSync(source), true);
    assert.equal(existsSync(item.filePath), true);
  }
  const videos = await Promise.all(imported.filter((item) => item.type === 'video').map((item) => waitReady(store, item.id)));
  assert.equal(videos.every((item) => item.capability === 'native-video'), true);
  assert.equal(store.list().length, 5);
  assert.equal(store.list().find((item) => item.id === imported[2].id).animated, true);
  const restored = new LocalWallpaperStore(directory, { ffmpeg, ffprobe });
  assert.equal(restored.list().length, 5);
  restored.rename(imported[0].id, 'My wallpaper');
  assert.equal(restored.list().find((item) => item.id === imported[0].id).title, 'My wallpaper');
  restored.delete(imported[0].id);
  assert.equal(existsSync(join(directory, 'source.png')), true);
  assert.equal(restored.list().length, 4);
});

test('catalog cache safely falls back from damage and keeps its schema', (context) => {
  const directory = mkdtempSync(join(process.cwd(), '.gptdaddy-cache-test-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'catalog.json');
  assert.deepEqual(readCatalogCache(file), []);
  writeCatalogCache(file, [{ id: '123', projectRoot: directory }]);
  assert.equal(readCatalogCache(file).length, 1);
});
