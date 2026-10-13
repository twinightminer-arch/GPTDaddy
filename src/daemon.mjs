import { readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { randomUUID } from 'node:crypto';
import manifest from '../package.json' with { type: 'json' };
import { DEFAULT_DATA_ROOT, ensureState, writeState } from './core/config.mjs';
import { detectCodexWindowsAsync } from './codex/windows-discovery.mjs';
import { NativeRestartSupervisor } from './codex/native-restart-supervisor.mjs';
import { catalogCacheFile, readCatalogCache, scanCatalogInWorker, writeCatalogCache } from './wallpaper/catalog-cache.mjs';
import { LocalWallpaperStore } from './wallpaper/local-imports.mjs';
import { WallpaperLifecycleManager } from './wallpaper/lifecycle-manager.mjs';
import { createControlServer } from './server/control-server.mjs';

const ALLOWED_SETTINGS = new Set(['opacity', 'scrimOpacity', 'blurPx', 'fit', 'zoom', 'positionX', 'positionY', 'muted', 'fontColor', 'composerBackgroundColor']);
const APP_VERSION = manifest.version;

export function normalizeSettings(input = {}) {
  const output = {};
  for (const [key, value] of Object.entries(input)) if (ALLOWED_SETTINGS.has(key)) output[key] = value;
  if ('opacity' in output) output.opacity = Math.max(0, Math.min(1, Number(output.opacity)));
  if ('scrimOpacity' in output) output.scrimOpacity = Math.max(0, Math.min(1, Number(output.scrimOpacity)));
  if ('blurPx' in output) output.blurPx = Math.max(0, Math.min(100, Number(output.blurPx)));
  if ('zoom' in output) output.zoom = Math.max(50, Math.min(200, Number(output.zoom)));
  if ('positionX' in output) output.positionX = Math.max(0, Math.min(100, Number(output.positionX)));
  if ('positionY' in output) output.positionY = Math.max(0, Math.min(100, Number(output.positionY)));
  if ('fit' in output && !['cover', 'contain', 'fill'].includes(output.fit)) delete output.fit;
  if ('muted' in output) output.muted = Boolean(output.muted);
  if ('fontColor' in output) {
    if (output.fontColor === null || output.fontColor === '') output.fontColor = null;
    else if (typeof output.fontColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(output.fontColor)) throw new Error('Font color must be a six-digit hex color or automatic');
  }
  if ('composerBackgroundColor' in output) {
    if (output.composerBackgroundColor === null || output.composerBackgroundColor === '') output.composerBackgroundColor = null;
    else if (typeof output.composerBackgroundColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(output.composerBackgroundColor)) {
      throw new Error('Composer background color must be a six-digit hex color or automatic');
    }
  }
  return output;
}

export class GPTDaddyDaemon {
  constructor({ dataRoot = DEFAULT_DATA_ROOT, port = Number(process.env.GPTDADDY_PORT || 34873), cdpPort = Number(process.env.GPTDADDY_CDP_PORT || 9222), logger = console, wallpapers = null } = {}) {
    this.dataRoot = dataRoot;
    this.stateFile = join(dataRoot, 'state.json');
    this.state = ensureState(this.stateFile);
    this.port = port;
    this.logger = logger;
    this.catalogFile = catalogCacheFile(dataRoot);
    this.localStore = new LocalWallpaperStore(dataRoot, { logger });
    this.workshopWallpapers = wallpapers || readCatalogCache(this.catalogFile);
    this.wallpapers = [...this.workshopWallpapers, ...this.localStore.list()];
    this.catalogIsFixed = wallpapers !== null;
    this.catalogStatus = { source: this.wallpapers.length ? 'cache' : 'empty', scanMs: null, scanning: false, lastError: null };
    this.catalogRevision = 1;
    this.byId = new Map(this.wallpapers.map((item) => [item.id, item]));
    this.localStore.onChange = () => {
      this.wallpapers = [...this.workshopWallpapers, ...this.localStore.list()];
      this.byId = new Map(this.wallpapers.map((item) => [item.id, item]));
      this.catalogRevision += 1;
    };
    this.uploads = new Map();
    let lastDiscoveryAt = 0;
    let lastDebugPort = null;
    this.latestCodex = { installed: false, running: false, discoveryPending: true };
    this.lifecycle = new WallpaperLifecycleManager({
      port: cdpPort,
      logger,
      controlHandler: (action, payload) => this.handleDesktopAction(action, payload),
      portProvider: async () => {
        if (Date.now() - lastDiscoveryAt >= 5000) {
          const codex = await detectCodexWindowsAsync();
          this.latestCodex = codex;
          lastDebugPort = codex.running && codex.cdpEnabled && codex.cdpLoopbackOnly ? codex.cdpPort : null;
          lastDiscoveryAt = Date.now();
        }
        return lastDebugPort;
      },
    });
    this.control = null;
    this.metricsTimer = null;
    this.nativeRestart = new NativeRestartSupervisor({
      discover: detectCodexWindowsAsync,
      isEnabled: () => this.state.nativeRestart.enabled && this.state.wallpaper.enabled,
      reportPath: join(dataRoot, 'native-restart.json'),
      cdpPort: Number(process.env.GPTDADDY_CDP_PORT || 9335),
      logger,
    });
  }

  async handleDesktopAction(action, payload = {}) {
    switch (action) {
      case 'status': return this.status();
      case 'list': return this.wallpapers.map(({ projectRoot, filePath, previewPath, playablePath, ...safe }) => ({ ...safe, hasPreview: Boolean(previewPath) }));
      case 'apply': return this.apply(String(payload?.id || ''), payload?.settings || {});
      case 'settings': return this.updateSettings(payload || {});
      case 'ui': return this.updateUi(payload || {});
      case 'renameImport': return this.renameImport(payload?.id, payload?.title);
      case 'deleteImport': return this.deleteImport(payload?.id);
      case 'setDefault': return this.setDefault(payload?.id);
      case 'importBegin': return this.importBegin(payload?.name);
      case 'importChunk': return this.importChunk(payload?.uploadId, payload?.base64);
      case 'importFinish': return this.importFinish(payload?.uploadId);
      case 'importCancel': return this.importCancel(payload?.uploadId);
      case 'preview': return this.previewImport(payload?.id);
      case 'nativeRestart': return this.updateNativeRestart(payload?.enabled);
      case 'pause': await this.lifecycle.pause(); return this.status();
      case 'resume': await this.lifecycle.resume(); return this.status();
      case 'remove': return this.remove();
      default: throw new Error('Unknown desktop control action');
    }
  }

  async start() {
    this.nativeRestart.start();
    this.lifecycle.start();
    this.control = createControlServer({
      token: this.state.apiToken,
      wallpapers: () => this.wallpapers,
      port: this.port,
      actions: {
        status: () => this.status(),
        apply: (id, settings) => this.apply(id, settings),
        settings: (settings) => this.updateSettings(settings),
        ui: (settings) => this.updateUi(settings),
        import: (readable, filename) => this.importLocal(readable, filename),
        renameImport: (id, title) => this.renameImport(id, title),
        deleteImport: (id) => this.deleteImport(id),
        setDefault: (id) => this.setDefault(id),
        nativeRestart: (enabled) => this.updateNativeRestart(enabled),
        pause: () => this.lifecycle.pause(),
        resume: () => this.lifecycle.resume(),
        remove: () => this.remove(),
      },
    });
    try {
      await this.control.listen();
    } catch (error) {
      this.lifecycle.stop();
      this.nativeRestart.stop();
      this.control = null;
      throw error;
    }
    const restoreId = this.state.wallpaper.defaultId || this.state.wallpaper.id;
    if (this.state.wallpaper.enabled && restoreId) {
      try { await this.apply(restoreId, this.state.wallpaper, false); }
      catch (error) { this.logger.warn?.(`Could not restore wallpaper: ${error.message}`); }
    }
    if (!this.catalogIsFixed) void this.refreshCatalog();
    this.localStore.resumePending();
    this.metricsTimer = setInterval(() => void this.lifecycle.sampleMetrics(), 2000);
    this.metricsTimer.unref?.();
    return this.status();
  }

  #renderConfig(project) {
    const mtime = statSync(project.playablePath).mtimeMs;
    return { ...this.state.wallpaper, videoPath: project.playablePath, sourceToken: `${project.id}:${mtime}`, sourceId: project.id, pluginVersion: APP_VERSION };
  }

  async refreshCatalog() {
    if (this.catalogStatus.scanning) return;
    this.catalogStatus.scanning = true;
    try {
      const result = await scanCatalogInWorker(this.workshopWallpapers);
      if (!result.wallpapers.length && this.workshopWallpapers.length) {
        this.catalogStatus = { ...this.catalogStatus, scanning: false, lastError: 'Scan returned no projects; cached wallpaper index was kept' };
        return;
      }
      this.workshopWallpapers = result.wallpapers;
      this.wallpapers = [...this.workshopWallpapers, ...this.localStore.list()];
      this.catalogRevision += 1;
      this.byId = new Map(this.wallpapers.map((item) => [item.id, item]));
      writeCatalogCache(this.catalogFile, this.workshopWallpapers);
      this.catalogStatus = { source: 'scan', scanMs: result.scanMs, scanning: false, lastError: null };
      const restoreId = this.state.wallpaper.defaultId || this.state.wallpaper.id;
      if (this.state.wallpaper.enabled && restoreId && this.byId.has(restoreId) && !this.lifecycle.config) {
        await this.apply(restoreId, this.state.wallpaper, false);
      }
    } catch (error) {
      this.catalogStatus = { ...this.catalogStatus, scanning: false, lastError: error.message };
      this.logger.warn?.(`Wallpaper catalog scan failed; keeping cached entries: ${error.message}`);
    }
  }

  async apply(id, settings = {}, persist = true) {
    const project = this.byId.get(id);
    if (!project) throw new Error(`Wallpaper project not found: ${id}`);
    if (!['native-video', 'native-image'].includes(project.capability) || !project.playablePath) throw new Error(`Wallpaper cannot currently play (${project.capability})`);
    this.state.wallpaper = { ...this.state.wallpaper, ...normalizeSettings(settings), id, enabled: true };
    if (persist) writeState(this.state, this.stateFile);
    await this.lifecycle.apply(this.#renderConfig(project));
    await this.lifecycle.sampleMetrics();
    return this.status();
  }

  async updateSettings(settings) {
    this.state.wallpaper = { ...this.state.wallpaper, ...normalizeSettings(settings) };
    writeState(this.state, this.stateFile);
    const project = this.byId.get(this.state.wallpaper.id);
    if (this.state.wallpaper.enabled && project) {
      await this.lifecycle.apply(this.#renderConfig(project));
      await this.lifecycle.sampleMetrics();
    }
    return this.status();
  }

  updateNativeRestart(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Automatic Codex recovery must be enabled or disabled explicitly');
    this.state.nativeRestart.enabled = enabled;
    writeState(this.state, this.stateFile);
    return this.status();
  }

  updateUi(settings) {
    const color = settings?.pageColor;
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('GPTDaddy page color must be a six-digit hex color');
    this.state.ui.pageColor = color.toLowerCase();
    writeState(this.state, this.stateFile);
    return this.status();
  }

  async importLocal(readable, filename) {
    const item = await this.localStore.importStream(readable, filename);
    const { projectRoot, filePath, previewPath, playablePath, ...safe } = item;
    return { item: safe, catalogRevision: this.catalogRevision };
  }

  importBegin(name) {
    if (typeof name !== 'string' || name.length > 200) throw new Error('Invalid import filename');
    if (this.uploads.size >= 2) throw new Error('Too many concurrent wallpaper imports');
    const uploadId = randomUUID();
    const stream = new PassThrough({ highWaterMark: 256 * 1024 });
    const entry = { stream, promise: this.localStore.importStream(stream, name), timer: null };
    entry.promise.catch(() => {});
    const expire = () => { entry.timer = setTimeout(() => this.importCancel(uploadId), 120000); entry.timer.unref?.(); };
    expire();
    entry.expire = expire;
    this.uploads.set(uploadId, entry);
    return { uploadId };
  }

  async importChunk(uploadId, base64) {
    const entry = this.uploads.get(String(uploadId || ''));
    if (!entry) throw new Error('Import session expired');
    if (typeof base64 !== 'string' || base64.length > 90000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('Invalid import chunk');
    clearTimeout(entry.timer);
    const bytes = Buffer.from(base64, 'base64');
    if (!entry.stream.write(bytes)) await new Promise((resolve, reject) => { entry.stream.once('drain', resolve); entry.stream.once('error', reject); });
    entry.expire();
    return { received: bytes.length };
  }

  async importFinish(uploadId) {
    const entry = this.uploads.get(String(uploadId || ''));
    if (!entry) throw new Error('Import session expired');
    clearTimeout(entry.timer);
    entry.stream.end();
    try {
      const item = await entry.promise;
      const { projectRoot, filePath, previewPath, playablePath, ...safe } = item;
      return { item: safe, catalogRevision: this.catalogRevision };
    } finally { this.uploads.delete(uploadId); }
  }

  importCancel(uploadId) {
    const entry = this.uploads.get(String(uploadId || ''));
    if (!entry) return false;
    clearTimeout(entry.timer);
    entry.stream.destroy(new Error('Wallpaper import cancelled'));
    this.uploads.delete(uploadId);
    return true;
  }

  previewImport(id) {
    const item = this.localStore.list().find((row) => row.id === id);
    if (!item?.previewPath) return null;
    const size = statSync(item.previewPath).size;
    if (size > 96 * 1024) return null;
    const extension = extname(item.previewPath).toLowerCase();
    const mime = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : null;
    return mime ? `data:${mime};base64,${readFileSync(item.previewPath).toString('base64')}` : null;
  }

  renameImport(id, title) {
    this.localStore.rename(String(id || ''), title);
    return this.status();
  }

  async deleteImport(id) {
    const targetId = String(id || '');
    if (this.state.wallpaper.id === targetId) await this.remove();
    this.localStore.delete(targetId);
    if (this.state.wallpaper.defaultId === targetId) {
      this.state.wallpaper.defaultId = null;
      writeState(this.state, this.stateFile);
    }
    return this.status();
  }

  async setDefault(id) {
    const project = this.byId.get(String(id || ''));
    if (!project || !['native-video', 'native-image'].includes(project.capability)) throw new Error('Wallpaper is not ready to become the default');
    this.state.wallpaper.defaultId = project.id;
    writeState(this.state, this.stateFile);
    return this.apply(project.id);
  }

  async remove() {
    this.state.wallpaper.enabled = false;
    writeState(this.state, this.stateFile);
    await this.lifecycle.remove();
    return this.status();
  }

  async status() {
    return {
      version: APP_VERSION,
      controlUrl: `http://127.0.0.1:${this.port}/?token=${encodeURIComponent(this.state.apiToken)}`,
      codex: this.latestCodex,
      lifecycle: this.lifecycle.status(),
      nativeRestart: this.nativeRestart.status(),
      wallpaper: this.state.wallpaper,
      ui: this.state.ui,
      catalog: {
        total: this.wallpapers.length,
        nativeVideo: this.wallpapers.filter((item) => item.capability === 'native-video').length,
        nativeImage: this.wallpapers.filter((item) => item.capability === 'native-image').length,
        animatedPreview: this.wallpapers.filter((item) => item.capability === 'animated-preview').length,
        revision: this.catalogRevision,
        ...this.catalogStatus,
      },
      limitation: 'Automatic package activation closes and reopens a newly launched verified Codex once; the native startup splash cannot be styled before CDP attaches.',
    };
  }

  async stop() {
    for (const id of this.uploads.keys()) this.importCancel(id);
    this.localStore.stop();
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    this.metricsTimer = null;
    this.lifecycle.stop();
    this.nativeRestart.stop();
    if (this.control) await this.control.close();
    this.control = null;
  }
}

export async function runDaemon(options = {}) {
  const daemon = new GPTDaddyDaemon(options);
  const status = await daemon.start();
  console.log(`GPTDaddy control panel: ${status.controlUrl}`);
  const stop = async () => { await daemon.stop(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return daemon;
}
