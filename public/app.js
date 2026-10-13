const token = new URLSearchParams(location.search).get('token') || sessionStorage.getItem('gptdaddy-token');
if (token) sessionStorage.setItem('gptdaddy-token', token);

const state = { status: null, wallpapers: [], query: '', category: 'all', themeDirty: false, catalogRevision: null };
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
  const imageActive = lifecycle.imageReady;
  elements.connection.textContent = imageActive ? '图片壁纸已显示' : lifecycle.playbackHealthy ? '视频壁纸正在播放'
    : lifecycle.active ? '壁纸已加载，等待播放帧'
      : ready ? `已连接 · ${lifecycle.connectedTargets} 个窗口，等待壁纸加载` : '等待安全调试连接';
  elements.connection.style.color = lifecycle.playbackHealthy ? '#a5f3ca' : '#ffd08a';
  elements.summary.textContent = !ready
    ? `已保存壁纸设置，但当前 Codex 启动未开放 CDP，壁纸尚未加载；GPTDaddy 不会强退或劫持客户端。`
    : `${catalog.nativeVideo} 个原生视频项目。${lifecycle.playbackHealthy ? '当前壁纸正在播放。' : wallpaper.enabled ? '壁纸配置已保存，正在等待实际播放。' : '壁纸功能已关闭。'}`;
  const pageColor = state.status.ui?.pageColor || '#101820';
  document.documentElement.style.setProperty('--page-bg', pageColor);
  const rgb = [1, 3, 5].map((offset) => parseInt(pageColor.slice(offset, offset + 2), 16));
  const bright = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > 155;
  document.documentElement.style.setProperty('--ink', bright ? '#182a3d' : '#f3f5f7');
  document.documentElement.style.setProperty('--muted', bright ? '#34495e' : '#9ba4af');
  document.documentElement.style.setProperty('--line', bright ? '#899cac' : '#29303a');
  document.documentElement.style.setProperty('--control-bg', bright ? '#ffffff' : '#11151a');
  document.documentElement.style.setProperty('--button-bg', bright ? '#e2ebf3' : '#20262e');
  document.documentElement.style.setProperty('--card-bg', bright ? '#ffffff' : '#12161b');
  document.documentElement.style.setProperty('--top-bg', bright ? 'rgb(242 247 251 / .92)' : 'rgb(11 14 18 / .82)');
  if (!state.themeDirty) {
    for (const [id, value, suffix] of [['opacity', wallpaper.opacity * 100, '%'], ['scrim', wallpaper.scrimOpacity * 100, '%'], ['blur', wallpaper.blurPx, ' px'], ['zoom', wallpaper.zoom, '%']]) {
      const input = document.querySelector(`#${id}`); const output = document.querySelector(`#${id}-output`);
      input.value = Math.round(value); output.textContent = `${Math.round(value)}${suffix}`;
    }
    document.querySelector('#font-color-auto').checked = !wallpaper.fontColor;
    document.querySelector('#font-color').disabled = !wallpaper.fontColor;
    if (wallpaper.fontColor) document.querySelector('#font-color').value = wallpaper.fontColor;
    document.querySelector('#page-color').value = pageColor;
    document.querySelector('#page-hex').value = pageColor;
  }
  document.querySelector('.settings').classList.remove('loading');
}

function renderWallpapers() {
  const query = state.query.toLowerCase();
  elements.grid.replaceChildren(...state.wallpapers.filter((item) =>
    (state.category === 'all' || state.category === 'import' && item.source === 'import' || state.category === 'workshop' && item.source !== 'import') &&
    `${item.title} ${(item.tags || []).join(' ')}`.toLowerCase().includes(query)).map((item) => {
    const card = document.createElement('article');
    card.className = `wallpaper-card${state.status.wallpaper.id === item.id && state.status.wallpaper.enabled ? ' active' : ''}`;
    const top = document.createElement('div');
    const badge = document.createElement('span'); badge.className = `badge${item.capability === 'native-video' ? ' ready' : ''}`; badge.textContent = item.capability;
    const title = document.createElement('h4'); title.textContent = item.title;
    const meta = document.createElement('p'); meta.textContent = `${item.status === 'processing' ? '正在处理 · ' : item.status === 'unsupported-codec' ? '不支持的编码 · ' : ''}${item.type || 'unknown'} · ${(item.bytes / 1024 / 1024).toFixed(1)} MB · ${item.contentRating}`;
    top.append(badge, title, meta);
    if (item.source === 'import' && item.hasPreview) {
      const preview = document.createElement('img'); preview.alt = `${item.title} 预览`;
      preview.src = `/media/${encodeURIComponent(item.id)}?preview=1&token=${encodeURIComponent(token)}`;
      card.append(preview);
    }
    const ready = ['native-video', 'native-image'].includes(item.capability) && !item.missing;
    const button = document.createElement('button'); button.textContent = ready ? '应用到 Codex' : '暂不可应用'; button.disabled = !ready;
    button.addEventListener('click', async () => {
      button.disabled = true; button.textContent = '正在应用…';
      try { state.status = await api('/api/apply', { method: 'POST', body: JSON.stringify({ id: item.id }) }); renderStatus(); renderWallpapers(); toast(state.status.lifecycle.active ? '动态壁纸已加载并保存' : '壁纸设置已保存，等待 Codex 开放连接后加载'); }
      catch (error) { toast(error.message); button.disabled = false; button.textContent = '应用到 Codex'; }
    });
    card.prepend(top); card.append(button);
    if (item.source === 'import') {
      const defaults = document.createElement('button'); defaults.textContent = '设为默认'; defaults.disabled = !ready;
      defaults.addEventListener('click', async () => { try { state.status = await api('/api/default', { method: 'POST', body: JSON.stringify({ id: item.id }) }); renderStatus(); toast('默认壁纸已保存'); } catch (error) { toast(error.message); } });
      const rename = document.createElement('button'); rename.textContent = '重命名';
      rename.addEventListener('click', async () => { const title = prompt('壁纸名称', item.title); if (title === null) return; try { state.status = await api('/api/rename-import', { method: 'POST', body: JSON.stringify({ id: item.id, title }) }); state.wallpapers = await api('/api/wallpapers'); renderWallpapers(); } catch (error) { toast(error.message); } });
      const remove = document.createElement('button'); remove.textContent = '删除内部副本';
      remove.addEventListener('click', async () => { if (!confirm(`删除 GPTDaddy 内部副本“${item.title}”？原文件保留。`)) return; try { state.status = await api('/api/delete-import', { method: 'POST', body: JSON.stringify({ id: item.id }) }); state.wallpapers = await api('/api/wallpapers'); renderWallpapers(); } catch (error) { toast(error.message); } });
      card.append(defaults, rename, remove);
    }
    return card;
  }));
}

for (const id of ['opacity', 'scrim', 'blur', 'zoom']) {
  const input = document.querySelector(`#${id}`); const output = document.querySelector(`#${id}-output`);
  input.addEventListener('input', () => { output.textContent = `${input.value}${id === 'blur' ? ' px' : '%'}`; });
  input.addEventListener('input', () => { state.themeDirty = true; });
}
document.querySelector('#font-color-auto').addEventListener('change', (event) => {
  state.themeDirty = true;
  document.querySelector('#font-color').disabled = event.target.checked;
});
document.querySelector('#font-color').addEventListener('input', () => { state.themeDirty = true; });
document.querySelector('#page-color').addEventListener('input', (event) => { state.themeDirty = true; document.querySelector('#page-hex').value = event.target.value; document.documentElement.style.setProperty('--page-bg', event.target.value); });
document.querySelector('#page-hex').addEventListener('input', (event) => { state.themeDirty = true; if (/^#[0-9a-fA-F]{6}$/.test(event.target.value)) { document.querySelector('#page-color').value = event.target.value; document.documentElement.style.setProperty('--page-bg', event.target.value); } });
document.querySelector('#page-reset').addEventListener('click', () => { state.themeDirty = true; document.querySelector('#page-color').value = '#101820'; document.querySelector('#page-hex').value = '#101820'; document.documentElement.style.setProperty('--page-bg', '#101820'); });
document.querySelector('#save-settings').addEventListener('click', async () => {
  try {
    const pageColor = document.querySelector('#page-hex').value;
    if (!/^#[0-9a-fA-F]{6}$/.test(pageColor)) throw new Error('GPTDaddy 页面颜色需要 #RRGGBB 格式');
    state.status = await api('/api/settings', { method: 'POST', body: JSON.stringify({
      opacity: Number(document.querySelector('#opacity').value) / 100,
      scrimOpacity: Number(document.querySelector('#scrim').value) / 100,
      blurPx: Number(document.querySelector('#blur').value), zoom: Number(document.querySelector('#zoom').value),
      fontColor: document.querySelector('#font-color-auto').checked ? null : document.querySelector('#font-color').value,
    }) });
    state.status = await api('/api/ui', { method: 'POST', body: JSON.stringify({ pageColor }) });
    state.themeDirty = false;
    renderStatus(); toast('设置已保存');
  } catch (error) { toast(error.message); }
});
for (const action of ['pause', 'resume', 'remove']) document.querySelector(`#${action}`).addEventListener('click', async () => {
  try { const result = await api(`/api/${action}`, { method: 'POST', body: '{}' }); if (action === 'remove') state.status = result; renderWallpapers(); toast(action === 'remove' ? '已恢复 Codex 原始界面' : action === 'pause' ? '已暂停' : '已继续播放'); }
  catch (error) { toast(error.message); }
});
elements.search.addEventListener('input', () => { state.query = elements.search.value; renderWallpapers(); });
document.querySelector('#category').addEventListener('change', (event) => { state.category = event.target.value; renderWallpapers(); });
document.querySelector('#import-wallpaper').addEventListener('click', () => document.querySelector('#import-file').click());
async function importFile(file) {
  if (!file) return;
  try {
    const response = await fetch('/api/import', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-GPTDaddy-Filename': encodeURIComponent(file.name) }, body: file });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    state.wallpapers = await api('/api/wallpapers'); renderWallpapers();
    toast(result.item.status === 'processing' ? '视频已导入，正在后台检查编码' : '壁纸已导入，可立即应用');
  } catch (error) { toast(`导入失败：${error.message}`); }
}
document.querySelector('#import-file').addEventListener('change', (event) => { void importFile(event.target.files?.[0]); event.target.value = ''; });
document.body.addEventListener('dragover', (event) => { if (event.dataTransfer?.types?.includes('Files')) event.preventDefault(); });
document.body.addEventListener('drop', (event) => { if (event.dataTransfer?.files?.length) { event.preventDefault(); void importFile(event.dataTransfer.files[0]); } });

try {
  [state.status, state.wallpapers] = await Promise.all([api('/api/status'), api('/api/wallpapers')]);
  renderStatus(); renderWallpapers();
  state.catalogRevision = state.status.catalog?.revision;
  setInterval(async () => { try { state.status = await api('/api/status'); renderStatus(); if (state.catalogRevision !== state.status.catalog?.revision) { state.wallpapers = await api('/api/wallpapers'); state.catalogRevision = state.status.catalog?.revision; renderWallpapers(); } } catch { /* transient daemon reconnect */ } }, 3000);
} catch (error) {
  elements.connection.textContent = '连接失败'; elements.summary.textContent = error.message;
}
