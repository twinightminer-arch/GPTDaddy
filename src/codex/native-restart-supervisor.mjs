import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptPath = process.env.GPTDADDY_ACTIVATION_SCRIPT || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'activate-packaged-codex.ps1');

export function parseActivationReport(text) {
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

export function eligibleNativeLaunch(codex, wallpaperEnabled) {
  return Boolean(wallpaperEnabled && codex?.installed && codex?.running &&
    Number.isInteger(codex.processId) && codex.processId > 0 &&
    codex.cdpEnabled === false &&
    typeof codex.executablePath === 'string' &&
    /[\\/]WindowsApps[\\/]OpenAI\.Codex_[^\\/]+[\\/]app[\\/]ChatGPT\.exe$/i.test(codex.executablePath));
}

export async function activateVerifiedCodex({ processId, cdpPort, reportPath }) {
  await execFileAsync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
    '-ExecutionPolicy', 'RemoteSigned', '-File', scriptPath,
    '-ExpectedProcessId', String(processId), '-CdpPort', String(cdpPort),
    '-ReportPath', reportPath, '-Automatic',
  ], { windowsHide: true, timeout: 90000, maxBuffer: 64 * 1024 });
  return parseActivationReport(readFileSync(reportPath, 'utf8'));
}

export class NativeRestartSupervisor {
  constructor({ discover, activate = activateVerifiedCodex, isEnabled, reportPath, cdpPort = 9335, logger = console, pollMs = 2000, settleMs = 4000 } = {}) {
    this.discover = discover;
    this.activate = activate;
    this.isEnabled = isEnabled;
    this.reportPath = reportPath;
    this.cdpPort = cdpPort;
    this.logger = logger;
    this.pollMs = pollMs;
    this.settleMs = settleMs;
    this.initialPid = null;
    this.candidate = null;
    this.attempted = new Set();
    this.blocked = false;
    this.running = false;
    this.busy = false;
    this.ticking = false;
    this.lastResult = null;
    this.timer = null;
  }

  start() {
    if (this.running || process.platform !== 'win32') return;
    // Never restart a Codex instance that predates this daemon. It may have an active task.
    this.running = true;
    this.initializing = Promise.resolve().then(() => this.discover()).then((initial) => {
      this.initialPid = initial?.running ? initial.processId : null;
    }).catch((error) => this.logger.warn?.(`Initial Codex discovery failed: ${error.message}`));
    this.timer = setInterval(() => void this.tick(), this.pollMs);
    this.timer.unref?.();
  }

  async tick(now = Date.now()) {
    if (!this.running || this.busy || this.blocked || this.ticking) return;
    this.ticking = true;
    try {
    if (this.initializing) await this.initializing;
    const codex = await this.discover();
    if (!eligibleNativeLaunch(codex, this.isEnabled()) || codex.processId === this.initialPid || this.attempted.has(codex.processId)) {
      this.candidate = null;
      return;
    }
    if (this.candidate?.processId !== codex.processId) {
      this.candidate = { processId: codex.processId, since: now };
      return;
    }
    if (now - this.candidate.since < this.settleMs) return;
    this.attempted.add(codex.processId);
    this.candidate = null;
    this.busy = true;
    try {
      const result = await this.activate({ processId: codex.processId, cdpPort: this.cdpPort, reportPath: this.reportPath });
      this.lastResult = { result: result.result, at: result.finishedAt || new Date().toISOString(), processId: codex.processId };
      if (result.result !== 'passed') {
        this.blocked = true;
        this.logger.warn?.('Codex package activation failed; automatic retries are disabled until GPTDaddy restarts.');
      }
    } catch (error) {
      this.blocked = true;
      this.lastResult = { result: 'error', at: new Date().toISOString(), processId: codex.processId };
      this.logger.warn?.(`Codex package activation could not complete: ${error.message}`);
    } finally {
      this.busy = false;
    }
    } catch (error) {
      this.candidate = null;
      this.logger.warn?.(`Codex discovery failed: ${error.message}`);
    } finally { this.ticking = false; }
  }

  status() {
    return { enabled: Boolean(this.isEnabled()), busy: this.busy, blocked: this.blocked, lastResult: this.lastResult };
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
