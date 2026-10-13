import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, isAbsolute, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_BYTES = 1024 * 1024 * 1024;
const EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.mp4', '.webm', '.mov', '.m4v', '.mkv']);

export function sniffWallpaper(bytes, extension) {
  const hex = bytes.toString('hex');
  const ascii = bytes.toString('latin1');
  if (extension === '.png' && hex.startsWith('89504e470d0a1a0a')) return { mime: 'image/png', kind: 'image', animated: ascii.includes('acTL') };
  if ((extension === '.jpg' || extension === '.jpeg') && hex.startsWith('ffd8ff')) return { mime: 'image/jpeg', kind: 'image', animated: false };
  if (extension === '.gif' && /^GIF8[79]a/.test(ascii)) return { mime: 'image/gif', kind: 'image', animated: true };
  if (extension === '.webp' && ascii.slice(0, 4) === 'RIFF' && ascii.slice(8, 12) === 'WEBP') return { mime: 'image/webp', kind: 'image', animated: ascii.includes('ANIM') };
  if (extension === '.bmp' && ascii.startsWith('BM')) return { mime: 'image/bmp', kind: 'image', animated: false };
  if (['.webm', '.mkv'].includes(extension) && hex.startsWith('1a45dfa3')) return { mime: extension === '.webm' ? 'video/webm' : 'video/x-matroska', kind: 'video' };
  if (['.mp4', '.mov', '.m4v'].includes(extension) && ascii.slice(4, 8) === 'ftyp') return { mime: 'video/mp4', kind: 'video' };
  return null;
}

function managedPath(root, path) {
  if (typeof path !== 'string') return false;
  const rel = relative(resolve(root), resolve(path));
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function readIndex(file, root) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (value.schemaVersion !== 1 || !Array.isArray(value.items)) return [];
    return value.items.filter((item) => /^import:[0-9a-f-]{36}$/i.test(item?.id || '') &&
      managedPath(root, item.filePath) &&
      (!item.playablePath || managedPath(root, item.playablePath)) &&
      (!item.previewPath || managedPath(root, item.previewPath)));
  } catch { return []; }
}

function writeIndex(file, items) {
  mkdirSync(dirname(file), { recursive: true });
  const partial = `${file}.${process.pid}.partial`;
  writeFileSync(partial, JSON.stringify({ schemaVersion: 1, items }));
  renameSync(partial, file);
}

export class LocalWallpaperStore {
  constructor(dataRoot, { ffmpeg = 'ffmpeg.exe', ffprobe = 'ffprobe.exe', generatePreviews = true, logger = console } = {}) {
    this.root = join(dataRoot, 'imports');
    this.indexFile = join(this.root, 'index.json');
    this.items = readIndex(this.indexFile, this.root);
    this.ffmpeg = ffmpeg;
    this.ffprobe = ffprobe;
    this.generatePreviews = generatePreviews;
    this.logger = logger;
    this.jobs = new Set();
    this.itemJobs = new Map();
    this.onChange = null;
  }

  list() {
    return this.items.map((item) => ({ ...item, missing: !existsSync(item.playablePath || item.filePath) }));
  }

  resumePending() {
    for (const item of this.items.filter((row) => row.status === 'processing' && existsSync(row.filePath))) {
      void this.#prepareVideo(item, extname(item.filePath).toLowerCase());
    }
  }

  #save() { writeIndex(this.indexFile, this.items); this.onChange?.(); }

  async importStream(readable, filename) {
    const originalName = basename(String(filename || '')).slice(0, 160);
    const extension = extname(originalName).toLowerCase();
    if (!EXTENSIONS.has(extension)) throw new Error(`Unsupported wallpaper format: ${extension || '(none)'}`);
    mkdirSync(this.root, { recursive: true });
    const uuid = randomUUID();
    const temporary = join(this.root, `${uuid}.partial`);
    const destination = join(this.root, `${uuid}${extension}`);
    const stream = createWriteStream(temporary, { flags: 'wx' });
    let size = 0;
    let header = Buffer.alloc(0);
    try {
      for await (const chunk of readable) {
        size += chunk.length;
        if (size > MAX_BYTES) throw new Error('Wallpaper exceeds the 1 GiB import limit');
        if (header.length < 65536) header = Buffer.concat([header, chunk.subarray(0, 65536 - header.length)]).subarray(0, 65536);
        if (!stream.write(chunk)) await new Promise((resolve, reject) => { stream.once('drain', resolve); stream.once('error', reject); });
      }
      await new Promise((resolve, reject) => stream.end((error) => error ? reject(error) : resolve()));
      const detected = sniffWallpaper(header, extension);
      if (!detected || !size) throw new Error('The file content does not match a supported wallpaper format');
      renameSync(temporary, destination);
      const item = {
        id: `import:${uuid}`, title: originalName.slice(0, -extension.length) || 'Local wallpaper',
        type: detected.kind, source: 'import', capability: detected.kind === 'image' ? 'native-image' : 'processing',
        animated: Boolean(detected.animated), status: detected.kind === 'image' ? 'ready' : 'processing',
        projectRoot: this.root, filePath: destination, playablePath: detected.kind === 'image' ? destination : null,
        previewPath: detected.kind === 'image' ? destination : null,
        importedAt: new Date().toISOString(), bytes: size, contentRating: 'Local', tags: [], mime: detected.mime,
      };
      this.items.push(item);
      this.#save();
      if (detected.kind === 'video') void this.#prepareVideo(item, extension);
      else if (this.generatePreviews) void this.#prepareImage(item);
      return { ...item };
    } catch (error) {
      stream.destroy();
      if (existsSync(temporary)) unlinkSync(temporary);
      throw error;
    }
  }

  async #prepareImage(item) {
    const thumbnail = join(this.root, `${item.id.slice(7)}-thumb.jpg`);
    const controller = new AbortController();
    this.jobs.add(controller);
    this.itemJobs.set(item.id, controller);
    try {
      await execFileAsync(this.ffmpeg, ['-v', 'error', '-y', '-i', item.filePath, '-frames:v', '1', '-vf', 'scale=320:-2', thumbnail], { windowsHide: true, timeout: 30000, signal: controller.signal });
      if (existsSync(thumbnail)) { item.previewPath = thumbnail; this.#save(); }
    } catch { /* A playable image remains usable without a thumbnail. */ }
    finally { this.jobs.delete(controller); this.itemJobs.delete(item.id); }
  }

  async #prepareVideo(item, extension) {
    const controller = new AbortController();
    this.jobs.add(controller);
    this.itemJobs.set(item.id, controller);
    try {
      const { stdout } = await execFileAsync(this.ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'json', item.filePath], { windowsHide: true, timeout: 30000, signal: controller.signal });
      const codec = JSON.parse(stdout).streams?.[0]?.codec_name;
      if (!codec) throw new Error('No decodable video stream was found');
      const native = extension === '.webm' ? ['vp8', 'vp9', 'av1'].includes(codec) : extension === '.mp4' && ['h264', 'av1'].includes(codec);
      if (native) item.playablePath = item.filePath;
      else {
        const converted = join(this.root, `${item.id.slice(7)}-playable.mp4`);
        await execFileAsync(this.ffmpeg, ['-v', 'error', '-y', '-i', item.filePath, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', converted], { windowsHide: true, timeout: 30 * 60 * 1000, signal: controller.signal });
        item.playablePath = converted;
      }
      item.capability = 'native-video';
      if (this.generatePreviews) {
        const thumbnail = join(this.root, `${item.id.slice(7)}-thumb.jpg`);
        try {
          await execFileAsync(this.ffmpeg, ['-v', 'error', '-y', '-ss', '00:00:01', '-i', item.playablePath, '-frames:v', '1', '-vf', 'scale=320:-2', thumbnail], { windowsHide: true, timeout: 30000, signal: controller.signal });
          if (existsSync(thumbnail)) item.previewPath = thumbnail;
        } catch { /* A playable video remains usable without a thumbnail. */ }
      }
      item.status = 'ready';
    } catch (error) {
      item.status = controller.signal.aborted ? 'processing' : 'unsupported-codec';
      item.error = controller.signal.aborted ? '等待下次启动继续处理' : '视频编码不受支持或 FFmpeg 不可用；请尝试 H.264 MP4 / VP9 WebM。';
      item.capability = 'unsupported';
      this.logger.warn?.(`Imported video could not be prepared: ${error.message}`);
    } finally { this.jobs.delete(controller); this.itemJobs.delete(item.id); if (this.items.includes(item)) this.#save(); }
  }

  stop() { for (const job of this.jobs) job.abort(); }

  rename(id, title) {
    const item = this.items.find((row) => row.id === id);
    if (!item) throw new Error('Imported wallpaper not found');
    const clean = String(title || '').trim().slice(0, 120);
    if (!clean) throw new Error('Wallpaper name cannot be empty');
    item.title = clean;
    this.#save();
    return { ...item };
  }

  delete(id) {
    const index = this.items.findIndex((row) => row.id === id);
    if (index < 0) throw new Error('Imported wallpaper not found');
    const item = this.items[index];
    this.itemJobs.get(item.id)?.abort();
    for (const path of new Set([item.filePath, item.playablePath, item.previewPath])) {
      if (!managedPath(this.root, path)) continue;
      if (existsSync(path)) unlinkSync(path);
    }
    this.items.splice(index, 1);
    this.#save();
    return true;
  }
}
