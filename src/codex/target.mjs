export const CODEX_MAIN_URL = 'app://-/index.html';

export function isCodexMainTarget(target) {
  if (!target || target.type !== 'page' || typeof target.webSocketDebuggerUrl !== 'string') return false;
  try {
    const url = new URL(target.url);
    return url.protocol === 'app:' && url.hostname === '-' && url.pathname === '/index.html' && !url.searchParams.has('initialRoute');
  } catch {
    return false;
  }
}

export async function listCodexTargets({ port = 9222, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) });
  if (!response.ok) throw new Error(`CDP discovery returned HTTP ${response.status}`);
  const targets = await response.json();
  return Array.isArray(targets) ? targets.filter(isCodexMainTarget) : [];
}
