import { CdpClient } from '../codex/cdp-client.mjs';
import { listCodexTargets } from '../codex/target.mjs';
import { buildInjectionScript, PAUSE_EXPRESSION, REMOVE_EXPRESSION, RESUME_EXPRESSION, SNAPSHOT_EXPRESSION } from './injection-script.mjs';
import { open, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';

const VIDEO_MIME = new Map([['.mp4', 'video/mp4'], ['.webm', 'video/webm'], ['.mov', 'video/quicktime'], ['.mkv', 'video/x-matroska']]);

export class WallpaperLifecycleManager {
  constructor({ port = 9222, portProvider = null, listTargets = listCodexTargets, logger = console, targetPollMs = 1000, controlHandler = null } = {}) {
    this.port = port;
    this.portProvider = portProvider;
    this.listTargets = listTargets;
    this.activePort = portProvider ? null : port;
    this.logger = logger;
    this.targetPollMs = targetPollMs;
    this.clients = new Map();
    this.config = null;
    this.timer = null;
    this.running = false;
    this.lastError = null;
    this.applyGeneration = 0;
    this.reconciling = false;
    this.controlHandler = controlHandler;
  }

  start() {
    if (this.running) return;
    this.running = true;
    void this.reconcile();
    this.timer = setInterval(() => void this.reconcile(), this.targetPollMs);
    this.timer.unref?.();
  }

  async reconcile() {
    if (!this.running || this.reconciling) return;
    this.reconciling = true;
    try {
      const discoveredPort = this.portProvider ? await this.portProvider() : this.port;
      if (!Number.isInteger(discoveredPort) || discoveredPort < 1 || discoveredPort > 65535) {
        this.#disconnectAll();
        this.activePort = null;
        this.lastError = 'Codex has no verified loopback CDP port';
        return;
      }
      if (discoveredPort !== this.activePort) {
        this.#disconnectAll();
        this.activePort = discoveredPort;
      }
      const targets = await this.listTargets({ port: discoveredPort });
      this.lastError = null;
      const seen = new Set(targets.map((target) => target.id));
      for (const [id, entry] of this.clients) {
        if (!seen.has(id) || !entry.client.isOpen()) { entry.client.close(); this.clients.delete(id); }
      }
      for (const target of targets) {
        if (this.clients.has(target.id)) continue;
        try { await this.#attach(target); }
        catch (error) { this.lastError = error instanceof Error ? error.message : String(error); }
      }
    } catch (error) {
      this.#disconnectAll();
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.reconciling = false;
    }
  }

  #disconnectAll() {
    for (const entry of this.clients.values()) entry.client.close();
    this.clients.clear();
  }

  async #attach(target) {
    const client = new CdpClient(target.webSocketDebuggerUrl);
    try {
      await client.connect();
      await client.call('Page.enable');
      await client.call('Runtime.enable');
      await client.call('Runtime.addBinding', { name: '__gptDaddyDesktopControl' });
      await client.call('Page.setBypassCSP', { enabled: true });
    } catch (error) {
      client.close();
      throw error;
    }
    const entry = { client, scriptId: null, lastMetrics: null, target, installPromise: Promise.resolve() };
    this.clients.set(target.id, entry);
    client.onClose(() => {
      if (this.clients.get(target.id)?.client === client) this.clients.delete(target.id);
    });
    client.onEvent((event) => {
      if (event.method === 'Runtime.bindingCalled' && event.params?.name === '__gptDaddyDesktopControl') {
        void this.#handleControl(entry, event.params.payload, event.params.executionContextId);
      }
      if (event.method === 'Page.loadEventFired' && this.config) {
        const generation = this.applyGeneration;
        setTimeout(() => {
          if (this.config && generation === this.applyGeneration) void this.#queueInstall(entry, this.config, generation).catch((error) => { this.lastError = error.message; });
        }, 150);
      }
    });
    if (this.config) await this.#queueInstall(entry, this.config);
  }

  async #handleControl(entry, rawPayload, executionContextId) {
    let id = null;
    try {
      if (typeof rawPayload !== 'string' || rawPayload.length > 4096) throw new Error('Invalid control request');
      const request = JSON.parse(rawPayload);
      id = request.id;
      if (!Number.isInteger(id) || id < 1 || id > 1e9) throw new Error('Invalid request identifier');
      if (!Number.isInteger(executionContextId)) throw new Error('Unverified control context');
      const context = await entry.client.call('Runtime.evaluate', {
        contextId: executionContextId,
        expression: `window.top === window && location.protocol === 'app:' && location.hostname === '-' && location.pathname === '/index.html'`,
        returnByValue: true,
      });
      if (context.result?.value !== true) throw new Error('Control request did not originate from the Codex main page');
      if (!this.controlHandler) throw new Error('Desktop controls are unavailable');
      const value = await this.controlHandler(request.action, request.payload);
      await this.#replyControl(entry, id, value, null);
    } catch (error) {
      if (id !== null) await this.#replyControl(entry, id, null, error instanceof Error ? error.message : String(error));
    }
  }

  async #replyControl(entry, id, value, error) {
    if (!entry.client.isOpen()) return;
    const expression = `window.__gptDaddyControlResponse?.(${JSON.stringify(id)},${JSON.stringify(value ?? null)},${JSON.stringify(error)})`;
    try { await entry.client.call('Runtime.evaluate', { expression, returnByValue: true }); }
    catch { /* The target may have navigated while the action was running. */ }
  }

  #queueInstall(entry, config, generation = this.applyGeneration) {
    const operation = entry.installPromise.catch(() => {}).then(() => this.#install(entry, config, generation));
    entry.installPromise = operation;
    return operation;
  }

  async #install(entry, config, generation = this.applyGeneration) {
    if (!this.config || generation !== this.applyGeneration || !entry.client.isOpen()) return;
    const { videoPath, sourceToken, ...rendererConfig } = config;
    const source = buildInjectionScript(rendererConfig);
    if (entry.scriptId) {
      try { await entry.client.call('Page.removeScriptToEvaluateOnNewDocument', { identifier: entry.scriptId }); } catch { /* target may have navigated */ }
    }
    const registered = await entry.client.call('Page.addScriptToEvaluateOnNewDocument', { source });
    entry.scriptId = registered.identifier;
    if (!this.config || generation !== this.applyGeneration) return;
    await entry.client.call('Runtime.evaluate', { expression: source, awaitPromise: true, returnByValue: true });
    if (videoPath && generation === this.applyGeneration) await this.#streamVideo(entry, videoPath, sourceToken, generation);
  }

  async #streamVideo(entry, videoPath, sourceToken, generation) {
    const fileStat = await stat(videoPath);
    const token = sourceToken || `${randomUUID()}:${fileStat.mtimeMs}`;
    const mime = VIDEO_MIME.get(extname(videoPath).toLowerCase()) || 'application/octet-stream';
    const begin = `window.__gptDaddyWallpaperControllerV1.beginBlob(${JSON.stringify(token)},${fileStat.size},${JSON.stringify(mime)})`;
    const beginResult = await entry.client.call('Runtime.evaluate', { expression: begin, returnByValue: true });
    if (beginResult.result?.value === false) return;
    const handle = await open(videoPath, 'r');
    const chunk = Buffer.allocUnsafe(256 * 1024);
    let position = 0;
    try {
      while (position < fileStat.size) {
        if (generation !== this.applyGeneration) throw new Error('Wallpaper transfer superseded');
        const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, fileStat.size - position), position);
        if (!bytesRead) throw new Error('Unexpected end of wallpaper video');
        position += bytesRead;
        const push = `window.__gptDaddyWallpaperControllerV1.pushBlob(${JSON.stringify(token)},${JSON.stringify(chunk.subarray(0, bytesRead).toString('base64'))})`;
        await entry.client.call('Runtime.evaluate', { expression: push, returnByValue: true });
      }
    } finally {
      await handle.close();
    }
    const finish = `window.__gptDaddyWallpaperControllerV1.finishBlob(${JSON.stringify(token)})`;
    const result = await entry.client.call('Runtime.evaluate', { expression: finish, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Wallpaper video could not be activated');
  }

  async apply(config) {
    this.applyGeneration += 1;
    const generation = this.applyGeneration;
    this.config = { ...config };
    await this.reconcile();
    await Promise.all([...this.clients.values()].map((entry) => this.#queueInstall(entry, this.config, generation)));
    return this.status();
  }

  async evaluate(expression) {
    const results = [];
    for (const entry of this.clients.values()) {
      try {
        const result = await entry.client.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        results.push(result.result?.value ?? null);
      } catch (error) {
        results.push({ error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }

  async sampleMetrics() {
    const metrics = await this.evaluate(SNAPSHOT_EXPRESSION);
    let index = 0;
    for (const entry of this.clients.values()) entry.lastMetrics = metrics[index++];
    return metrics;
  }

  async pause() { return this.evaluate(PAUSE_EXPRESSION); }
  async resume() { return this.evaluate(RESUME_EXPRESSION); }

  async remove() {
    this.applyGeneration += 1;
    this.config = null;
    await Promise.all([...this.clients.values()].map((entry) => entry.installPromise.catch(() => {})));
    for (const entry of this.clients.values()) {
      if (entry.scriptId) {
        try { await entry.client.call('Page.removeScriptToEvaluateOnNewDocument', { identifier: entry.scriptId }); } catch { /* no-op */ }
        entry.scriptId = null;
      }
    }
    return this.evaluate(REMOVE_EXPRESSION);
  }

  status() {
    const metrics = [...this.clients.values()].map((entry) => entry.lastMetrics);
    const sourceToken = this.config?.sourceToken;
    const active = Boolean(sourceToken && metrics.some((item) => item?.installed && item.sourceUrl === sourceToken));
    const playbackHealthy = active && metrics.some((item) =>
      item?.installed && item.sourceUrl === sourceToken && !item.paused &&
      item.readyState >= 2 && item.presentedCallbacks > 0 &&
      item.lastFrameAgeMs !== null && item.lastFrameAgeMs < 5000);
    return {
      running: this.running,
      cdpPort: this.activePort,
      connectedTargets: this.clients.size,
      cdpAvailable: this.clients.size > 0,
      lastError: this.lastError,
      desired: Boolean(this.config),
      active,
      playbackHealthy,
      metrics,
    };
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.#disconnectAll();
  }
}
