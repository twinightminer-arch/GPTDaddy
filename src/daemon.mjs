import { statSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DATA_ROOT, ensureState, writeState } from './core/config.mjs';
import { detectCodexWindows } from './codex/windows-discovery.mjs';
import { enumerateWallpaperSources } from './wallpaper/catalog.mjs';
import { WallpaperLifecycleManager } from './wallpaper/lifecycle-manager.mjs';
import { createControlServer } from './server/control-server.mjs';

const ALLOWED_SETTINGS = new Set(['opacity', 'scrimOpacity', 'blurPx', 'fit', 'zoom', 'positionX', 'positionY', 'muted', 'fontColor', 'composerBackgroundColor']);

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
    this.wallpapers = wallpapers || enumerateWallpaperSources();
    this.byId = new Map(this.wallpapers.map((item) => [item.id, item]));
    let lastDiscoveryAt = 0;
    let lastDebugPort = null;
    this.lifecycle = new WallpaperLifecycleManager({
      port: cdpPort,
      logger,
      controlHandler: (action, payload) => this.handleDesktopAction(action, payload),
      portProvider: () => {
        if (Date.now() - lastDiscoveryAt >= 5000) {
          const codex = detectCodexWindows();
          lastDebugPort = codex.running && codex.cdpEnabled && codex.cdpLoopbackOnly ? codex.cdpPort : null;
          lastDiscoveryAt = Date.now();
        }
        return lastDebugPort;
      },
    });
    this.control = null;
    this.metricsTimer = null;
  }

  async handleDesktopAction(action, payload = {}) {
    switch (action) {
      case 'status': return this.status();
      case 'list': return this.wallpapers.map(({ projectRoot, filePath, previewPath, playablePath, ...safe }) => safe);
      case 'apply': return this.apply(String(payload?.id || ''), payload?.settings || {});
      case 'settings': return this.updateSettings(payload || {});
      case 'pause': await this.lifecycle.pause(); return this.status();
      case 'resume': await this.lifecycle.resume(); return this.status();
      case 'remove': return this.remove();
      default: throw new Error('Unknown desktop control action');
    }
  }

  async start() {
    this.lifecycle.start();
    this.control = createControlServer({
      token: this.state.apiToken,
      wallpapers: this.wallpapers,
      port: this.port,
      actions: {
        status: () => this.status(),
        apply: (id, settings) => this.apply(id, settings),
        settings: (settings) => this.updateSettings(settings),
        pause: () => this.lifecycle.pause(),
        resume: () => this.lifecycle.resume(),
        remove: () => this.remove(),
      },
    });
    try {
      await this.control.listen();
    } catch (error) {
      this.lifecycle.stop();
      this.control = null;
      throw error;
    }
    if (this.state.wallpaper.enabled && this.state.wallpaper.id) {
      try { await this.apply(this.state.wallpaper.id, this.state.wallpaper, false); }
      catch (error) { this.logger.warn?.(`Could not restore wallpaper: ${error.message}`); }
    }
    this.metricsTimer = setInterval(() => void this.lifecycle.sampleMetrics(), 2000);
    this.metricsTimer.unref?.();
    return this.status();
  }

  #renderConfig(project) {
    const mtime = statSync(project.playablePath).mtimeMs;
    return { ...this.state.wallpaper, videoPath: project.playablePath, sourceToken: `${project.id}:${mtime}`, sourceId: project.id };
  }

  async apply(id, settings = {}, persist = true) {
    const project = this.byId.get(id);
    if (!project) throw new Error(`Wallpaper project not found: ${id}`);
    if (project.capability !== 'native-video') throw new Error(`This MVP can currently apply native MP4/WebM projects only (${project.capability})`);
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

  async remove() {
    this.state.wallpaper.enabled = false;
    writeState(this.state, this.stateFile);
    await this.lifecycle.remove();
    return this.status();
  }

  async status() {
    return {
      version: '0.1.0',
      controlUrl: `http://127.0.0.1:${this.port}/?token=${encodeURIComponent(this.state.apiToken)}`,
      codex: detectCodexWindows(),
      lifecycle: this.lifecycle.status(),
      wallpaper: this.state.wallpaper,
      catalog: {
        total: this.wallpapers.length,
        nativeVideo: this.wallpapers.filter((item) => item.capability === 'native-video').length,
        animatedPreview: this.wallpapers.filter((item) => item.capability === 'animated-preview').length,
      },
      limitation: 'Normal Codex startup without a CDP port cannot be attached after launch; GPTDaddy reports this instead of restarting Codex.',
    };
  }

  async stop() {
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    this.metricsTimer = null;
    this.lifecycle.stop();
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
