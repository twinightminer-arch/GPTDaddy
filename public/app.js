const token = new URLSearchParams(location.search).get('token') || sessionStorage.getItem('gptdaddy-token');
if (token) sessionStorage.setItem('gptdaddy-token', token);

const state = { status: null, wallpapers: [], query: '' };
const elements = {
  connection: document.querySelector('#connection'), summary: document.querySelector('#summary'), grid: document.querySelector('#wallpapers'),
  search: document.querySelector('#search'), toast: document.querySelector('#toast'),
};

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => elements.toast.classList.remove('visible'), 3200);
}

function renderStatus() {
  const { codex, lifecycle, wallpaper, catalog } = state.status;
  const ready = lifecycle.cdpAvailable;
  elements.connection.textContent = lifecycle.playbackHealthy ? '壁纸正在播放'
    : lifecycle.active ? '壁纸已加载，等待播放帧'
      : ready ? `已连接 · ${lifecycle.connectedTargets} 个窗口，等待壁纸加载` : '等待安全调试连接';
  elements.connection.style.color = lifecycle.playbackHealthy ? '#a5f3ca' : '#ffd08a';
  elements.summary.textContent = !ready
    ? `已保存壁纸设置，但当前 Codex 启动未开放 CDP，壁纸尚未加载；GPTDaddy 不会强退或劫持客户端。`
    : `${catalog.nativeVideo} 个原生视频项目。${lifecycle.playbackHealthy ? '当前壁纸正在播放。' : wallpaper.enabled ? '壁纸配置已保存，正在等待实际播放。' : '壁纸功能已关闭。'}`;
  for (const [id, value, suffix] of [['opacity', wallpaper.opacity * 100, '%'], ['scrim', wallpaper.scrimOpacity * 100, '%'], ['blur', wallpaper.blurPx, ' px'], ['zoom', wallpaper.zoom, '%']]) {
    const input = document.querySelector(`#${id}`); const output = document.querySelector(`#${id}-output`);
    input.value = Math.round(value); output.textContent = `${Math.round(value)}${suffix}`;
  }
  document.querySelector('#font-color-auto').checked = !wallpaper.fontColor;
  document.querySelector('#font-color').disabled = !wallpaper.fontColor;
  if (wallpaper.fontColor) document.querySelector('#font-color').value = wallpaper.fontColor;
}

function renderWallpapers() {
  const query = state.query.toLowerCase();
  elements.grid.replaceChildren(...state.wallpapers.filter((item) => `${item.title} ${item.tags.join(' ')}`.toLowerCase().includes(query)).map((item) => {
    const card = document.createElement('article');
    card.className = `wallpaper-card${state.status.wallpaper.id === item.id && state.status.wallpaper.enabled ? ' active' : ''}`;
    const top = document.createElement('div');
    const badge = document.createElement('span'); badge.className = `badge${item.capability === 'native-video' ? ' ready' : ''}`; badge.textContent = item.capability;
    const title = document.createElement('h4'); title.textContent = item.title;
    const meta = document.createElement('p'); meta.textContent = `${item.type || 'unknown'} · ${(item.bytes / 1024 / 1024).toFixed(1)} MB · ${item.contentRating}`;
    top.append(badge, title, meta);
    const button = document.createElement('button'); button.textContent = item.capability === 'native-video' ? '应用到 Codex' : '当前版本仅预览'; button.disabled = item.capability !== 'native-video';
    button.addEventListener('click', async () => {
      button.disabled = true; button.textContent = '正在应用…';
      try { state.status = await api('/api/apply', { method: 'POST', body: JSON.stringify({ id: item.id }) }); renderStatus(); renderWallpapers(); toast(state.status.lifecycle.active ? '动态壁纸已加载并保存' : '壁纸设置已保存，等待 Codex 开放连接后加载'); }
      catch (error) { toast(error.message); button.disabled = false; button.textContent = '应用到 Codex'; }
    });
    card.append(top, button); return card;
  }));
}

for (const id of ['opacity', 'scrim', 'blur', 'zoom']) {
  const input = document.querySelector(`#${id}`); const output = document.querySelector(`#${id}-output`);
  input.addEventListener('input', () => { output.textContent = `${input.value}${id === 'blur' ? ' px' : '%'}`; });
}
document.querySelector('#font-color-auto').addEventListener('change', (event) => {
  document.querySelector('#font-color').disabled = event.target.checked;
});
document.querySelector('#save-settings').addEventListener('click', async () => {
  try {
    state.status = await api('/api/settings', { method: 'POST', body: JSON.stringify({
      opacity: Number(document.querySelector('#opacity').value) / 100,
      scrimOpacity: Number(document.querySelector('#scrim').value) / 100,
      blurPx: Number(document.querySelector('#blur').value), zoom: Number(document.querySelector('#zoom').value),
      fontColor: document.querySelector('#font-color-auto').checked ? null : document.querySelector('#font-color').value,
    }) });
    renderStatus(); toast('设置已保存');
  } catch (error) { toast(error.message); }
});
for (const action of ['pause', 'resume', 'remove']) document.querySelector(`#${action}`).addEventListener('click', async () => {
  try { const result = await api(`/api/${action}`, { method: 'POST', body: '{}' }); if (action === 'remove') state.status = result; renderWallpapers(); toast(action === 'remove' ? '已恢复 Codex 原始界面' : action === 'pause' ? '已暂停' : '已继续播放'); }
  catch (error) { toast(error.message); }
});
elements.search.addEventListener('input', () => { state.query = elements.search.value; renderWallpapers(); });

try {
  [state.status, state.wallpapers] = await Promise.all([api('/api/status'), api('/api/wallpapers')]);
  renderStatus(); renderWallpapers();
  setInterval(async () => { try { state.status = await api('/api/status'); renderStatus(); } catch { /* transient daemon reconnect */ } }, 3000);
} catch (error) {
  elements.connection.textContent = '连接失败'; elements.summary.textContent = error.message;
}
