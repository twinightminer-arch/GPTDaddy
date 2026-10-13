export function uiToSetting(key, ui) {
  const value = Math.max(0, Math.min(100, Number(ui)));
  if (key === 'opacity' || key === 'scrimOpacity') return value / 100;
  if (key === 'blurPx') return value;
  if (key === 'zoom') return 50 + value * 1.5;
  return value;
}

export function settingToUi(key, setting) {
  const value = Number(setting);
  const ui = key === 'opacity' || key === 'scrimOpacity' ? value * 100
    : key === 'zoom' ? (value - 50) / 1.5 : value;
  return Math.max(0, Math.min(100, Math.round(ui)));
}

function installInappPanel() {
  const ROOT_ID = 'gptdaddy-desktop-panel';
  const existing = document.getElementById(ROOT_ID);
  if (existing) return true;
  if (!document.body) return false;

  const root = document.createElement('div');
  root.id = ROOT_ID;
  const shadow = root.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      button, input, select { font: inherit; }
      .launcher { position: fixed; right: 22px; bottom: 24px; z-index: 2147483000; pointer-events: auto; width: 54px; height: 54px; border: 1px solid #fff5; border-radius: 18px; background: #17283eea; color: #fff; box-shadow: 0 12px 36px #0007; font: 700 22px/1 system-ui; cursor: grab; user-select: none; touch-action: none; }
      .launcher.edge { width: 30px; height: 52px; right: 0 !important; border-radius: 13px 0 0 13px; font-size: 18px; }
      .launcher:active { cursor: grabbing; }
      .panel { position: fixed; right: 22px; bottom: 90px; z-index: 2147483001; pointer-events: auto; width: min(440px, calc(100vw - 32px)); height: min(650px, calc(100vh - 112px)); display: flex; flex-direction: column; border: 1px solid #ffffff30; border-radius: 18px; overflow: hidden; color: #eff5fc; background: #101820f5; box-shadow: 0 18px 60px #0009; backdrop-filter: blur(20px); font: 13px/1.45 'Segoe UI Variable','Microsoft YaHei UI',system-ui,sans-serif; }
      .panel[hidden], .view[hidden] { display: none; }
      .head { padding: 14px 16px 11px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #ffffff20; }
      .head strong { font-size: 17px; letter-spacing: .01em; }
      .head small { display: block; color: #aab9c9; font-size: 11px; }
      .icon { border: 0; color: #dfeafa; background: transparent; padding: 5px 8px; cursor: pointer; }
      .tabs { display: grid; grid-template-columns: repeat(4,1fr); gap: 3px; padding: 8px; border-bottom: 1px solid #ffffff20; }
      .tabs button { border: 0; border-radius: 9px; background: transparent; color: #adc0d2; padding: 8px 2px; cursor: pointer; }
      .tabs button.active { color: #fff; border-bottom: 2px solid #ffca79; }
      .body { min-height: 0; overflow: auto; padding: 16px; }
      .view h2 { font-size: 15px; margin: 0 0 10px; }
      .view p { color: #b9c7d6; margin: 0 0 12px; }
      .status { border-radius: 12px; padding: 13px; margin-bottom: 14px; background: #20354b; }
      .status strong { display: block; font-size: 14px; }
      .status small { color: #aebed0; }
      .actions { display: flex; gap: 7px; flex-wrap: wrap; }
      .actions button, .save, .card button { border: 1px solid #ffffff30; border-radius: 9px; background: #254058; color: #fff; padding: 8px 10px; cursor: pointer; }
      .actions button.danger { border-color: #ff9ba5; }
      button:disabled { opacity: .45; cursor: default; }
      .filters { display: grid; grid-template-columns: 1fr 100px; gap: 7px; margin-bottom: 10px; }
      .filters input, .filters select { min-width: 0; border: 1px solid #ffffff30; border-radius: 8px; color: #eef5fc; background: #182a3d; padding: 8px; }
      .filters option, .filter-row option { color: #eff5fc; background: #17283e; }
      .filter-row { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; color: #bed0e0; }
      .list { display: grid; gap: 8px; }
      .card { border: 1px solid #ffffff20; border-radius: 11px; background: #182a3d; padding: 10px; }
      .card.active { border-color: #ffca79; }
      .card-top { display: flex; gap: 8px; align-items: start; justify-content: space-between; }
      .card-title { font-weight: 650; overflow-wrap: anywhere; }
      .card small { color: #a9bed2; display: block; margin: 4px 0 9px; }
      .card button { padding: 5px 8px; }
      .card .star { border: 0; background: transparent; color: #ffd178; font-size: 19px; line-height: 1; }
      .card-preview { width: 100%; max-height: 100px; object-fit: cover; border-radius: 7px; margin: 7px 0; }
      .control { display: block; margin: 12px 0 16px; color: #c4d3e1; }
      .control output { float: right; color: #fff; }
      .control input { display: block; width: 100%; accent-color: #ffbe66; margin-top: 8px; }
      .color-row { display: flex; gap: 12px; align-items: center; margin: 12px 0; color: #c4d3e1; }
      .color-row input[type="color"] { width: 50px; height: 36px; padding: 2px; border: 1px solid #ffffff30; border-radius: 8px; background: #182a3d; }
      .color-row input[type="checkbox"] { accent-color: #ffbe66; }
      .message { min-height: 20px; color: #ffce88; margin-top: 12px; }
      .panel { background: var(--ui-bg, #101820); color: var(--ui-ink, #eff5fc); border-color: var(--ui-border, #ffffff30); }
      .head, .tabs { border-color: var(--ui-border, #ffffff30); }
      .head small, .tabs button, .view p, .control, .color-row, .filter-row, .status small, .card small { color: var(--ui-muted, #b9c7d6); }
      .tabs button.active, .control output { color: var(--ui-ink, #eff5fc); }
      .status, .card, .filters input, .filters select, .color-row input[type="color"] { background: var(--ui-card, #182a3d); color: var(--ui-ink, #eff5fc); border-color: var(--ui-border, #ffffff30); }
      .actions button, .save, .card button { background: var(--ui-button, #254058); color: var(--ui-ink, #eff5fc); border-color: var(--ui-border, #ffffff30); }
      .color-row input[type="text"] { width: 90px; padding: 6px; background: var(--ui-card, #182a3d); color: var(--ui-ink, #eff5fc); border: 1px solid var(--ui-border, #ffffff30); border-radius: 7px; }
      .color-row button { background: var(--ui-button, #254058); color: var(--ui-ink, #eff5fc); border: 1px solid var(--ui-border, #ffffff30); border-radius: 7px; padding: 6px; cursor: pointer; }
      .panel[data-ui-light] .icon, .panel[data-ui-light] .card .star, .panel[data-ui-light] .message { color: #8c4b00; }
      .view[data-view="theme"]:not([data-ready]) > :not(h2) { display: none; }
      .view[data-view="theme"]:not([data-ready])::after { content: '正在读取已保存的主题设置…'; color: var(--ui-muted, #b9c7d6); }
    </style>
    <button class="launcher" title="打开 GPTDaddy；可拖动" aria-label="打开 GPTDaddy">✦</button>
    <section class="panel" aria-label="GPTDaddy 控制面板" hidden>
      <div class="head"><div><strong>GPTDaddy</strong><small>Codex 动态壁纸</small></div><div><button class="icon" data-action="hide" title="收起入口">◀</button><button class="icon" data-action="close" title="关闭面板">✕</button></div></div>
      <nav class="tabs"><button data-tab="home" class="active">首页</button><button data-tab="library">壁纸库</button><button data-tab="theme">主题</button><button data-tab="settings">设置</button></nav>
      <div class="body">
        <div class="view" data-view="home"><h2>播放状态</h2><div class="status"><strong data-status>正在读取…</strong><small data-detail></small></div><div class="actions"><button data-action="resume">继续播放</button><button data-action="pause">暂停</button><button data-action="remove" class="danger">恢复原界面</button><button data-action="import" type="button">导入本地壁纸</button><input data-import-file type="file" accept=".png,.jpg,.jpeg,.webp,.bmp,.gif,.mp4,.webm,.mov,.m4v,.mkv" hidden></div><p style="margin-top:14px">普通对话切换不会重置视频进度；可选择文件或拖入此面板导入。</p></div>
        <div class="view" data-view="library" hidden><h2>Wallpaper Engine 与本地壁纸库</h2><div class="filters"><input type="search" data-search placeholder="搜索标题或标签"><select data-category><option value="all">全部</option><option value="native-video">可应用视频</option><option value="import">本地导入</option><option value="other">其他</option></select></div><div class="filter-row"><label><input type="checkbox" data-favorites-only> 仅收藏</label><select data-sort><option value="title">按名称</option><option value="size">按大小</option></select></div><div class="list" data-list></div></div>
        <div class="view" data-view="theme" hidden><h2>画面与可读性</h2><div class="color-row"><label for="gptdaddy-font-color">字体颜色</label><input id="gptdaddy-font-color" data-font-color type="color" value="#18334f"><label><input data-font-auto type="checkbox" checked> 自动跟随 Codex</label></div><div class="color-row"><label for="gptdaddy-composer-color">输入框背景颜色</label><input id="gptdaddy-composer-color" data-composer-color type="color" value="#ffffff"><label><input data-composer-auto type="checkbox"> 使用 Codex 原色</label></div><div class="color-row"><label for="gptdaddy-page-color">GPTDaddy 页面颜色</label><input id="gptdaddy-page-color" data-page-color type="color" value="#101820"><input data-page-hex type="text" value="#101820" maxlength="7" aria-label="GPTDaddy 页面颜色 HEX"><button data-action="reset-page-color" type="button">恢复默认</button></div><label class="control">内容背板不透明度 <output data-output="opacity"></output><input data-setting="opacity" type="range" min="0" max="100"></label><label class="control">背景遮罩 <output data-output="scrimOpacity"></output><input data-setting="scrimOpacity" type="range" min="0" max="100"></label><label class="control">背景模糊 <output data-output="blurPx"></output><input data-setting="blurPx" type="range" min="0" max="100"></label><label class="control">画面缩放 <output data-output="zoom"></output><input data-setting="zoom" type="range" min="0" max="100"></label><button class="save" data-action="save">应用并保存</button></div>
        <div class="view" data-view="settings" hidden><h2>连接与恢复</h2><p data-connection>正在读取…</p><label class="color-row"><input data-native-restart type="checkbox"> 普通启动后自动恢复壁纸（仅对新启动的官方 Codex 正常退出并重开一次）</label><p>设置保存在本机。关闭壁纸会移除背景层和控制面板，Codex 官方文件不变。启动加载页在安全连接建立前无法覆盖。</p></div>
        <div class="message" role="status" data-message></div>
      </div>
    </section>`;

  const $ = (selector) => shadow.querySelector(selector);
  const panel = $('.panel');
  const launcher = $('.launcher');
  const pending = new Map();
  let nextId = 1;
  let status = null;
  let catalog = [];
  let catalogLoaded = false;
  let catalogRevision = null;
  let refreshGeneration = 0;
  let themeDirty = false;
  let favorites;
  try { favorites = new Set(JSON.parse(localStorage.getItem('gptdaddy-favorites') || '[]')); }
  catch { favorites = new Set(); }

  window.__gptDaddyControlResponse = (id, value, error) => {
    const item = pending.get(id);
    if (!item) return;
    pending.delete(id);
    clearTimeout(item.timer);
    if (error) item.reject(new Error(error)); else item.resolve(value);
  };
  function request(action, payload = {}) {
    if (typeof window.__gptDaddyDesktopControl !== 'function') return Promise.reject(new Error('控制通道未连接'));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('控制请求超时')); }, 30000);
      pending.set(id, { resolve, reject, timer });
      try { window.__gptDaddyDesktopControl(JSON.stringify({ id, action, payload })); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }
  function message(value) { $('[data-message]').textContent = value; }
  function previewPageColor(color) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return false;
    const rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
    const bright = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > 155;
    panel.style.setProperty('--ui-bg', color);
    panel.style.setProperty('--ui-ink', bright ? '#182a3d' : '#eff5fc');
    panel.style.setProperty('--ui-muted', bright ? '#34495e' : '#b9c7d6');
    panel.style.setProperty('--ui-card', bright ? '#ffffff' : '#182a3d');
    panel.style.setProperty('--ui-button', bright ? '#e2ebf3' : '#254058');
    panel.style.setProperty('--ui-border', bright ? '#42566a66' : '#ffffff30');
    panel.toggleAttribute('data-ui-light', bright);
    return true;
  }
  function renderStatus() {
    if (!status) return;
    const { lifecycle, wallpaper } = status;
    const imageActive = lifecycle.imageReady;
    $('[data-status]').textContent = imageActive ? '图片壁纸已显示' : lifecycle.playbackHealthy ? '视频壁纸正在播放' : lifecycle.active ? '已加载，等待视频帧' : lifecycle.cdpAvailable ? '已连接，等待加载' : '当前无法接入 Codex';
    $('[data-detail]').textContent = wallpaper.enabled ? `当前项目：${wallpaper.id || '未选择'} · ${lifecycle.connectedTargets} 个窗口` : '壁纸功能已关闭';
    $('[data-connection]').textContent = lifecycle.cdpAvailable ? `安全连接已建立；CDP 端口 ${lifecycle.cdpPort}。` : '当前正常启动的 Codex 未开放可验证的 CDP 接口。';
    $('[data-native-restart]').checked = Boolean(status.nativeRestart?.enabled);
    if (!themeDirty) {
      for (const key of ['opacity', 'scrimOpacity', 'blurPx', 'zoom']) {
        const input = $(`[data-setting="${key}"]`);
        const ui = settingToUi(key, wallpaper[key]);
        input.value = String(ui);
        $('[data-output="' + key + '"]').textContent = ui + (key === 'blurPx' ? ' px' : ' %');
      }
      $('[data-font-auto]').checked = !wallpaper.fontColor;
      $('[data-font-color]').disabled = !wallpaper.fontColor;
      if (wallpaper.fontColor) $('[data-font-color]').value = wallpaper.fontColor;
      $('[data-composer-auto]').checked = !wallpaper.composerBackgroundColor;
      $('[data-composer-color]').disabled = !wallpaper.composerBackgroundColor;
      if (wallpaper.composerBackgroundColor) $('[data-composer-color]').value = wallpaper.composerBackgroundColor;
      const pageColor = status.ui?.pageColor || '#101820';
      $('[data-page-color]').value = pageColor;
      $('[data-page-hex]').value = pageColor;
      previewPageColor(pageColor);
    }
    $('[data-view="theme"]').setAttribute('data-ready', '');
    renderCatalog();
  }
  function renderCatalog() {
    const list = $('[data-list]');
    const query = $('[data-search]').value.trim().toLocaleLowerCase();
    const category = $('[data-category]').value;
    const onlyFavorites = $('[data-favorites-only]').checked;
    const sort = $('[data-sort]').value;
    const items = catalog.filter((item) => {
      if (category === 'native-video' && item.capability !== 'native-video') return false;
      if (category === 'import' && item.source !== 'import') return false;
      if (category === 'other' && ['native-video', 'native-image'].includes(item.capability)) return false;
      if (onlyFavorites && !favorites.has(item.id)) return false;
      return `${item.title} ${(item.tags || []).join(' ')}`.toLocaleLowerCase().includes(query);
    }).sort((a, b) => sort === 'size' ? (b.bytes || 0) - (a.bytes || 0) : a.title.localeCompare(b.title));
    list.replaceChildren();
    let previewCount = 0;
    for (const item of items.slice(0, 300)) {
      const card = document.createElement('div');
      card.className = 'card' + (status?.wallpaper?.enabled && status.wallpaper.id === item.id ? ' active' : '');
      const top = document.createElement('div'); top.className = 'card-top';
      const title = document.createElement('div'); title.className = 'card-title'; title.textContent = item.title;
      const star = document.createElement('button'); star.className = 'star'; star.textContent = favorites.has(item.id) ? '★' : '☆'; star.title = '收藏';
      star.addEventListener('click', () => { if (favorites.has(item.id)) favorites.delete(item.id); else favorites.add(item.id); localStorage.setItem('gptdaddy-favorites', JSON.stringify([...favorites])); renderCatalog(); });
      top.append(title, star);
      const detail = document.createElement('small'); detail.textContent = `${item.source === 'import' ? '本地导入 · ' : ''}${item.status === 'processing' ? '正在处理视频 · ' : item.status === 'unsupported-codec' ? '编码不支持 · ' : ''}${item.capability} · ${((item.bytes || 0) / 1048576).toFixed(1)} MB`;
      const playable = ['native-video', 'native-image'].includes(item.capability) && !item.missing;
      const apply = document.createElement('button'); apply.textContent = playable ? '应用' : '暂不可应用'; apply.disabled = !playable;
      apply.addEventListener('click', async () => {
        apply.disabled = true; message('正在应用壁纸…');
        try { status = await request('apply', { id: item.id }); renderStatus(); message(status.lifecycle.active ? '壁纸已应用' : '已保存，等待 Codex 连接'); }
        catch (error) { message(error.message); apply.disabled = false; }
      });
      card.append(top, detail, apply);
      if (item.source === 'import') {
        if (previewCount++ < 8) {
          const preview = document.createElement('img'); preview.className = 'card-preview'; preview.alt = `${item.title} 预览`;
          card.insertBefore(preview, apply);
          void request('preview', { id: item.id }).then((url) => { if (url && card.isConnected) preview.src = url; else preview.remove(); }).catch(() => preview.remove());
        }
        const controls = document.createElement('div'); controls.className = 'actions';
        const make = (label, handler) => { const button = document.createElement('button'); button.textContent = label; button.addEventListener('click', handler); controls.append(button); };
        make('设为默认', async () => { try { status = await request('setDefault', { id: item.id }); renderStatus(); message('默认壁纸已保存并应用'); } catch (error) { message(error.message); } });
        make('重命名', async () => { const title = window.prompt('壁纸名称', item.title); if (title === null) return; try { status = await request('renameImport', { id: item.id, title }); await refresh(); } catch (error) { message(error.message); } });
        make('删除', async () => { if (!window.confirm(`仅删除 GPTDaddy 内部副本“${item.title}”？原始文件不会删除。`)) return; try { status = await request('deleteImport', { id: item.id }); catalogRevision = null; await refresh(); message('内部副本已删除'); } catch (error) { message(error.message); } });
        card.append(controls);
      }
      list.append(card);
    }
    if (!items.length) list.textContent = catalogLoaded ? '没有符合条件的壁纸。' : '正在读取已缓存壁纸…';
  }
  async function refresh() {
    const generation = ++refreshGeneration;
    const nextStatus = await request('status');
    if (generation !== refreshGeneration) return;
    status = nextStatus;
    renderStatus();
    if (catalogLoaded && catalogRevision === nextStatus.catalog?.revision) return;
    const nextCatalog = await request('list');
    if (generation !== refreshGeneration) return;
    catalog = nextCatalog;
    catalogLoaded = true;
    catalogRevision = nextStatus.catalog?.revision;
    renderCatalog();
  }
  shadow.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    shadow.querySelectorAll('[data-tab]').forEach((tab) => tab.classList.toggle('active', tab === button));
    shadow.querySelectorAll('[data-view]').forEach((view) => { view.hidden = view.dataset.view !== button.dataset.tab; });
  }));
  for (const selector of ['[data-search]', '[data-category]', '[data-favorites-only]', '[data-sort]']) $(selector).addEventListener('input', renderCatalog);
  shadow.querySelectorAll('[data-setting]').forEach((input) => input.addEventListener('input', () => { themeDirty = true; $('[data-output="' + input.dataset.setting + '"]').textContent = input.value + (input.dataset.setting === 'blurPx' ? ' px' : ' %'); }));
  $('[data-font-auto]').addEventListener('change', () => { themeDirty = true; $('[data-font-color]').disabled = $('[data-font-auto]').checked; });
  $('[data-font-color]').addEventListener('input', () => { themeDirty = true; });
  $('[data-composer-auto]').addEventListener('change', () => { themeDirty = true; $('[data-composer-color]').disabled = $('[data-composer-auto]').checked; });
  $('[data-composer-color]').addEventListener('input', () => { themeDirty = true; });
  $('[data-page-color]').addEventListener('input', (event) => { themeDirty = true; $('[data-page-hex]').value = event.target.value; previewPageColor(event.target.value); });
  $('[data-page-hex]').addEventListener('input', (event) => { themeDirty = true; if (previewPageColor(event.target.value)) $('[data-page-color]').value = event.target.value; });
  $('[data-native-restart]').addEventListener('change', async (event) => {
    try { status = await request('nativeRestart', { enabled: event.target.checked }); renderStatus(); message('自动恢复设置已保存'); }
    catch (error) { await refresh().catch(() => {}); message(error.message); }
  });
  async function importFile(file) {
    if (!file) return;
    let uploadId = null;
    try {
      const started = await request('importBegin', { name: file.name });
      uploadId = started.uploadId;
      for (let offset = 0; offset < file.size; offset += 48 * 1024) {
        const bytes = new Uint8Array(await file.slice(offset, offset + 48 * 1024).arrayBuffer());
        const base64 = btoa(String.fromCharCode(...bytes));
        await request('importChunk', { uploadId, base64 });
        if (offset % (2 * 1024 * 1024) < 48 * 1024) message(`正在导入 ${file.name}：${Math.round(Math.min(100, (offset + bytes.length) / file.size * 100))}%`);
      }
      const result = await request('importFinish', { uploadId });
      uploadId = null;
      catalogRevision = null;
      await refresh();
      message(result.item.status === 'processing' ? '视频已保存，正在后台检查编码和生成预览' : '本地壁纸已导入，可在壁纸库应用');
    } catch (error) {
      if (uploadId) await request('importCancel', { uploadId }).catch(() => {});
      message(`导入失败：${error.message}`);
    }
  }
  $('[data-import-file]').addEventListener('change', (event) => { void importFile(event.target.files?.[0]); event.target.value = ''; });
  panel.addEventListener('dragover', (event) => { if (event.dataTransfer?.types?.includes('Files')) event.preventDefault(); });
  panel.addEventListener('drop', (event) => { if (event.dataTransfer?.files?.length) { event.preventDefault(); void importFile(event.dataTransfer.files[0]); } });
  const refreshTimer = setInterval(() => { if (!panel.hidden) void refresh().catch((error) => message(error.message)); }, 5000);
  shadow.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', async () => {
    const action = button.dataset.action;
    if (action === 'close') { panel.hidden = true; return; }
    if (action === 'hide') { panel.hidden = true; launcher.classList.add('edge'); launcher.textContent = '◂'; return; }
    if (action === 'import') { $('[data-import-file]').click(); return; }
    if (action === 'reset-page-color') { themeDirty = true; $('[data-page-color]').value = '#101820'; $('[data-page-hex]').value = '#101820'; previewPageColor('#101820'); message('默认颜色已预览；点击“应用并保存”后生效'); return; }
    try {
      if (action === 'save') {
        const settings = {};
        for (const key of ['opacity', 'scrimOpacity', 'blurPx', 'zoom']) settings[key] = uiToSetting(key, $(`[data-setting="${key}"]`).value);
        settings.fontColor = $('[data-font-auto]').checked ? null : $('[data-font-color]').value;
        settings.composerBackgroundColor = $('[data-composer-auto]').checked ? null : $('[data-composer-color]').value;
        const pageColor = $('[data-page-hex]').value;
        if (!/^#[0-9a-fA-F]{6}$/.test(pageColor)) throw new Error('GPTDaddy 页面颜色需要 #RRGGBB 格式');
        if (status?.wallpaper) {
          status = { ...status, wallpaper: { ...status.wallpaper, ...settings }, ui: { ...status.ui, pageColor } };
          renderStatus();
        }
        try {
          status = await request('settings', settings);
          status = await request('ui', { pageColor });
          themeDirty = false;
          renderStatus();
          message('设置已保存');
        } catch (error) {
          await refresh().catch(() => {});
          message(error.message);
        }
        return;
      } else status = await request(action);
      if (action !== 'remove') { renderStatus(); message(action === 'save' ? '设置已保存' : action === 'pause' ? '已暂停' : '正在播放'); }
    } catch (error) { message(error.message); }
  }));

  let drag = null;
  launcher.addEventListener('pointerdown', (event) => { drag = { x: event.clientX, y: event.clientY, left: launcher.getBoundingClientRect().left, top: launcher.getBoundingClientRect().top, moved: false }; launcher.setPointerCapture(event.pointerId); });
  launcher.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) < 5 && !drag.moved) return;
    drag.moved = true; launcher.classList.remove('edge');
    launcher.style.right = 'auto'; launcher.style.bottom = 'auto';
    launcher.style.left = Math.max(0, Math.min(window.innerWidth - launcher.offsetWidth, drag.left + dx)) + 'px';
    launcher.style.top = Math.max(0, Math.min(window.innerHeight - launcher.offsetHeight, drag.top + dy)) + 'px';
  });
  launcher.addEventListener('pointerup', () => {
    if (!drag?.moved) { launcher.classList.remove('edge'); launcher.textContent = '✦'; panel.hidden = !panel.hidden; if (!panel.hidden) void refresh().catch((error) => message(error.message)); }
    drag = null;
  });

  document.body.append(root);
  const observer = new MutationObserver(() => { if (!root.isConnected && document.body) document.body.append(root); });
  observer.observe(document.documentElement, { childList: true });
  window.__gptDaddyRemovePanel = () => { observer.disconnect(); clearInterval(refreshTimer); for (const item of pending.values()) clearTimeout(item.timer); pending.clear(); root.remove(); delete window.__gptDaddyControlResponse; delete window.__gptDaddyRemovePanel; };
  return true;
}

export function buildInappPanelScript() {
  return `(() => { const uiToSetting = ${uiToSetting.toString()}; const settingToUi = ${settingToUi.toString()}; return (${installInappPanel.toString()})(); })()`;
}
