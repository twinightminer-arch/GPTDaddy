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
      .control { display: block; margin: 12px 0 16px; color: #c4d3e1; }
      .control output { float: right; color: #fff; }
      .control input { display: block; width: 100%; accent-color: #ffbe66; margin-top: 8px; }
      .color-row { display: flex; gap: 12px; align-items: center; margin: 12px 0; color: #c4d3e1; }
      .color-row input[type="color"] { width: 50px; height: 36px; padding: 2px; border: 1px solid #ffffff30; border-radius: 8px; background: #182a3d; }
      .color-row input[type="checkbox"] { accent-color: #ffbe66; }
      .message { min-height: 20px; color: #ffce88; margin-top: 12px; }
    </style>
    <button class="launcher" title="打开 GPTDaddy；可拖动" aria-label="打开 GPTDaddy">✦</button>
    <section class="panel" aria-label="GPTDaddy 控制面板" hidden>
      <div class="head"><div><strong>GPTDaddy</strong><small>Codex 动态壁纸</small></div><div><button class="icon" data-action="hide" title="收起入口">◀</button><button class="icon" data-action="close" title="关闭面板">✕</button></div></div>
      <nav class="tabs"><button data-tab="home" class="active">首页</button><button data-tab="library">壁纸库</button><button data-tab="theme">主题</button><button data-tab="settings">设置</button></nav>
      <div class="body">
        <div class="view" data-view="home"><h2>播放状态</h2><div class="status"><strong data-status>正在读取…</strong><small data-detail></small></div><div class="actions"><button data-action="resume">继续播放</button><button data-action="pause">暂停</button><button data-action="remove" class="danger">恢复原界面</button></div><p style="margin-top:14px">普通对话切换不会重置视频进度；若 Codex 未开放安全连接，这里会显示真实状态。</p></div>
        <div class="view" data-view="library" hidden><h2>Wallpaper Engine 壁纸库</h2><div class="filters"><input type="search" data-search placeholder="搜索标题或标签"><select data-category><option value="all">全部</option><option value="native-video">可应用视频</option><option value="other">其他</option></select></div><div class="filter-row"><label><input type="checkbox" data-favorites-only> 仅收藏</label><select data-sort><option value="title">按名称</option><option value="size">按大小</option></select></div><div class="list" data-list></div></div>
        <div class="view" data-view="theme" hidden><h2>画面与可读性</h2><div class="color-row"><label for="gptdaddy-font-color">字体颜色</label><input id="gptdaddy-font-color" data-font-color type="color" value="#18334f"><label><input data-font-auto type="checkbox" checked> 自动跟随 Codex</label></div><div class="color-row"><label for="gptdaddy-composer-color">输入框背景颜色</label><input id="gptdaddy-composer-color" data-composer-color type="color" value="#ffffff"><label><input data-composer-auto type="checkbox"> 使用 Codex 原色</label></div><label class="control">内容背板不透明度 <output data-output="opacity"></output><input data-setting="opacity" type="range" min="0" max="100"></label><label class="control">背景遮罩 <output data-output="scrimOpacity"></output><input data-setting="scrimOpacity" type="range" min="0" max="100"></label><label class="control">背景模糊 <output data-output="blurPx"></output><input data-setting="blurPx" type="range" min="0" max="100"></label><label class="control">画面缩放 <output data-output="zoom"></output><input data-setting="zoom" type="range" min="0" max="100"></label><button class="save" data-action="save">应用并保存</button></div>
        <div class="view" data-view="settings" hidden><h2>连接与恢复</h2><p data-connection>正在读取…</p><p>设置保存在本机。关闭壁纸会移除背景层和控制面板，Codex 官方文件不变。</p><p>正式版普通启动若没有受支持的渲染器接入点，GPTDaddy 不会强制结束或劫持 Codex。</p></div>
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
  function renderStatus() {
    if (!status) return;
    const { lifecycle, wallpaper } = status;
    $('[data-status]').textContent = lifecycle.playbackHealthy ? '壁纸正在播放' : lifecycle.active ? '已加载，等待视频帧' : lifecycle.cdpAvailable ? '已连接，等待加载' : '当前无法接入 Codex';
    $('[data-detail]').textContent = wallpaper.enabled ? `当前项目：${wallpaper.id || '未选择'} · ${lifecycle.connectedTargets} 个窗口` : '壁纸功能已关闭';
    $('[data-connection]').textContent = lifecycle.cdpAvailable ? `安全连接已建立；CDP 端口 ${lifecycle.cdpPort}。` : '当前正常启动的 Codex 未开放可验证的 CDP 接口。';
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
      if (category === 'other' && item.capability === 'native-video') return false;
      if (onlyFavorites && !favorites.has(item.id)) return false;
      return `${item.title} ${(item.tags || []).join(' ')}`.toLocaleLowerCase().includes(query);
    }).sort((a, b) => sort === 'size' ? (b.bytes || 0) - (a.bytes || 0) : a.title.localeCompare(b.title));
    list.replaceChildren();
    for (const item of items.slice(0, 300)) {
      const card = document.createElement('div');
      card.className = 'card' + (status?.wallpaper?.enabled && status.wallpaper.id === item.id ? ' active' : '');
      const top = document.createElement('div'); top.className = 'card-top';
      const title = document.createElement('div'); title.className = 'card-title'; title.textContent = item.title;
      const star = document.createElement('button'); star.className = 'star'; star.textContent = favorites.has(item.id) ? '★' : '☆'; star.title = '收藏';
      star.addEventListener('click', () => { if (favorites.has(item.id)) favorites.delete(item.id); else favorites.add(item.id); localStorage.setItem('gptdaddy-favorites', JSON.stringify([...favorites])); renderCatalog(); });
      top.append(title, star);
      const detail = document.createElement('small'); detail.textContent = `${item.capability} · ${((item.bytes || 0) / 1048576).toFixed(1)} MB`;
      const apply = document.createElement('button'); apply.textContent = item.capability === 'native-video' ? '应用' : '暂不支持应用'; apply.disabled = item.capability !== 'native-video';
      apply.addEventListener('click', async () => {
        apply.disabled = true; message('正在应用壁纸…');
        try { status = await request('apply', { id: item.id }); renderStatus(); message(status.lifecycle.active ? '壁纸已应用' : '已保存，等待 Codex 连接'); }
        catch (error) { message(error.message); apply.disabled = false; }
      });
      card.append(top, detail, apply); list.append(card);
    }
    if (!items.length) list.textContent = '没有符合条件的壁纸。';
  }
  async function refresh() {
    [status, catalog] = await Promise.all([request('status'), request('list')]);
    renderStatus();
  }
  shadow.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    shadow.querySelectorAll('[data-tab]').forEach((tab) => tab.classList.toggle('active', tab === button));
    shadow.querySelectorAll('[data-view]').forEach((view) => { view.hidden = view.dataset.view !== button.dataset.tab; });
  }));
  for (const selector of ['[data-search]', '[data-category]', '[data-favorites-only]', '[data-sort]']) $(selector).addEventListener('input', renderCatalog);
  shadow.querySelectorAll('[data-setting]').forEach((input) => input.addEventListener('input', () => { $('[data-output="' + input.dataset.setting + '"]').textContent = input.value + (input.dataset.setting === 'blurPx' ? ' px' : ' %'); }));
  $('[data-font-auto]').addEventListener('change', () => { $('[data-font-color]').disabled = $('[data-font-auto]').checked; });
  $('[data-composer-auto]').addEventListener('change', () => { $('[data-composer-color]').disabled = $('[data-composer-auto]').checked; });
  shadow.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', async () => {
    const action = button.dataset.action;
    if (action === 'close') { panel.hidden = true; return; }
    if (action === 'hide') { panel.hidden = true; launcher.classList.add('edge'); launcher.textContent = '◂'; return; }
    try {
      if (action === 'save') {
        const settings = {};
        for (const key of ['opacity', 'scrimOpacity', 'blurPx', 'zoom']) settings[key] = uiToSetting(key, $(`[data-setting="${key}"]`).value);
        settings.fontColor = $('[data-font-auto]').checked ? null : $('[data-font-color]').value;
        settings.composerBackgroundColor = $('[data-composer-auto]').checked ? null : $('[data-composer-color]').value;
        if (status?.wallpaper) {
          status = { ...status, wallpaper: { ...status.wallpaper, ...settings } };
          renderStatus();
        }
        try {
          status = await request('settings', settings);
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
  window.__gptDaddyRemovePanel = () => { observer.disconnect(); for (const item of pending.values()) clearTimeout(item.timer); pending.clear(); root.remove(); delete window.__gptDaddyControlResponse; delete window.__gptDaddyRemovePanel; };
  return true;
}

export function buildInappPanelScript() {
  return `(() => { const uiToSetting = ${uiToSetting.toString()}; const settingToUi = ${settingToUi.toString()}; return (${installInappPanel.toString()})(); })()`;
}
