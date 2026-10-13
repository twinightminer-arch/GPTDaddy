import { buildInappPanelScript } from './inapp-panel.mjs';

async function installWallpaperHost(initialConfig) {
  const GLOBAL_KEY = '__gptDaddyWallpaperControllerV1';
  const CONTROLLER_VERSION = String(initialConfig.pluginVersion || 'development');
  const HOST_ID = 'gptdaddy-wallpaper-host';
  const STYLE_ID = 'gptdaddy-wallpaper-style';

  if (window[GLOBAL_KEY]?.version === CONTROLLER_VERSION) {
    return window[GLOBAL_KEY].configure(initialConfig);
  }
  window[GLOBAL_KEY]?.remove?.();
  delete window[GLOBAL_KEY];

  const state = {
    config: { ...initialConfig },
    activeVideo: null,
    standbyVideo: null,
    activeImage: null,
    standbyImage: null,
    desiredPlaying: true,
    pausedByHost: false,
    lastFrameAt: 0,
    presentedCallbacks: 0,
    sourceLoadedAt: performance.now(),
    visibleAt: performance.now(),
    lastAdvanceAt: performance.now(),
    lastMediaTime: -1,
    recoveryAttempts: 0,
    lastRecoveryAt: 0,
    freezes: 0,
    sourceChanges: 0,
    transfer: null,
    recovering: false,
  };

  const textTokens = {
    '--color-text': 1,
    '--color-text-secondary': 0.74,
    '--color-text-primary': 1,
    '--color-text-primary-surface': 1,
    '--color-text-primary-soft': 1,
    '--color-text-primary-soft-alt': 1,
    '--color-text-primary-ghost': 1,
    '--color-text-primary-ghost-hover': 1,
    '--color-text-primary-outline': 1,
    '--color-text-prose': 1,
    '--user-message-text-color': 1,
    '--codex-base-ink': 1,
    '--wb-text-primary': 1,
    '--color-text-secondary-solid': 0.74,
    '--color-text-secondary-ghost': 0.74,
    '--color-text-secondary-soft-alt': 0.74,
    '--color-text-secondary-outline': 0.74,
    '--color-codex-description': 0.74,
    '--app-color-text-foreground-secondary': 0.74,
    '--app-color-text-button-secondary': 1,
    '--color-text-tertiary': 0.54,
    '--color-token-text-tertiary': 0.54,
    '--app-color-foreground-application-menu': 1,
  };
  const originalTextTokens = new Map(Object.keys(textTokens).map((name) => [name, document.documentElement.style.getPropertyValue(name)]));

  function applyFontColor() {
    const color = state.config.fontColor;
    const custom = typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
    if (custom) {
      document.documentElement.setAttribute('data-gptdaddy-font-color', '');
      document.documentElement.style.setProperty('--gptdaddy-font-color', color);
    } else {
      document.documentElement.removeAttribute('data-gptdaddy-font-color');
      document.documentElement.style.removeProperty('--gptdaddy-font-color');
    }
    for (const [name, strength] of Object.entries(textTokens)) {
      if (custom) {
        document.documentElement.style.setProperty(name, strength === 1 ? color : `color-mix(in srgb, ${color} ${Math.round(strength * 100)}%, transparent)`);
      } else {
        const original = originalTextTokens.get(name);
        if (original) document.documentElement.style.setProperty(name, original);
        else document.documentElement.style.removeProperty(name);
      }
    }
    applyChromeFontColor();
  }

  // These selectors come from the Codex renderer DOM, not the GPTDaddy panel.
  const chromeSelectors = [
    '#root .app-shell-left-panel',
    '#root .app-shell-left-panel div',
    '#root .app-shell-left-panel button',
    '#root .app-shell-left-panel a',
    '#root .app-shell-left-panel span',
    '#root .app-shell-left-panel svg',
    '#root [class*="ApplicationMenuTopBar"] button',
    '#root header[class*="titlebar" i] button',
    '#root header[class*="titlebar" i] span',
    '#root header[class*="titlebar" i] svg',
    '#root [class*="app-shell-header-toolbar"] button',
    '#root [class*="app-shell-header-toolbar"] div',
    '#root [class*="app-shell-header-toolbar"] span',
    '#root [class*="app-shell-header-toolbar"] svg',
  ];
  const chromeOriginals = new Map();
  function restoreChromeFontColor() {
    for (const [element, original] of chromeOriginals) {
      if (original.value) element.style.setProperty('color', original.value, original.priority);
      else element.style.removeProperty('color');
      element.removeAttribute('data-gptdaddy-chrome');
    }
    chromeOriginals.clear();
  }
  function applyChromeFontColor() {
    markSpecialSurfaces();
    const color = state.config.fontColor;
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      restoreChromeFontColor();
      return;
    }
    for (const element of chromeOriginals.keys()) {
      if (!element.isConnected) chromeOriginals.delete(element);
    }
    for (const selector of chromeSelectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (!chromeOriginals.has(element)) chromeOriginals.set(element, {
          value: element.style.getPropertyValue('color'),
          priority: element.style.getPropertyPriority('color'),
        });
        element.style.setProperty('color', color, 'important');
        element.setAttribute('data-gptdaddy-chrome', '');
      }
    }
  }

  function markSpecialSurfaces() {
    for (const menu of document.querySelectorAll('[role="menu"][aria-labelledby]')) {
      const trigger = document.getElementById(menu.getAttribute('aria-labelledby'));
      if (trigger?.getAttribute('data-composer-navigation-target') === 'permissions') {
        menu.setAttribute('data-gptdaddy-permissions-menu', '');
      } else {
        menu.removeAttribute('data-gptdaddy-permissions-menu');
      }
      if (trigger?.getAttribute('aria-label') === '打开个人资料菜单' || trigger?.closest('[data-gptdaddy-profile-menu]')) {
        menu.setAttribute('data-gptdaddy-profile-menu', '');
      } else {
        menu.removeAttribute('data-gptdaddy-profile-menu');
      }
    }
    for (const shell of document.querySelectorAll('#root [class^="_shell_"]')) {
      const row = shell.querySelector('[class^="_headerRow_"]');
      const title = row?.querySelector('h1,h2')?.textContent?.trim() || row?.innerText?.trim().split('\n')[0];
      if (title === '资料库' || title === '插件' || title === '技能') shell.setAttribute('data-gptdaddy-flat-header', '');
      else shell.removeAttribute('data-gptdaddy-flat-header');
    }
    for (const dialog of document.querySelectorAll('.codex-dialog')) {
      const fullAccessTitle = dialog.matches('[role="dialog"]') && /(?:完整|完全)访问权限|full access/i.test(dialog.querySelector('h2')?.textContent || '');
      dialog.toggleAttribute('data-gptdaddy-full-access-confirm', fullAccessTitle);
      if (dialog.textContent?.includes('编辑个人资料') && dialog.querySelector('[class^="_surface_"]')) {
        dialog.setAttribute('data-gptdaddy-profile-editor', '');
      } else {
        dialog.removeAttribute('data-gptdaddy-profile-editor');
      }
    }
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    html, body, #root { background: transparent !important; }
    body > #root { position: relative !important; z-index: 1 !important; }
    main, aside, [role="navigation"], [role="main"],
    [class*="bg-surface"], [class*="bg-elevated"] {
      background-color: rgb(var(--gptdaddy-surface-rgb, 248 250 253) / var(--gptdaddy-panel-opacity, .1)) !important;
      backdrop-filter: blur(var(--gptdaddy-panel-blur, 0px)) !important;
    }
    #root #app-shell-sidebar > div > div {
      background-color: rgb(var(--gptdaddy-surface-rgb, 248 250 253) / var(--gptdaddy-panel-opacity, .1)) !important;
      backdrop-filter: blur(var(--gptdaddy-panel-blur, 0px)) !important;
    }
    #root [class*="MainContentTopFade"],
    #root main .bg-gradient-to-t.from-surface {
      background-image: none !important;
    }
    [data-radix-popper-content-wrapper] {
      backdrop-filter: none !important;
    }
    [role="menu"], [data-radix-popper-content-wrapper] > [role="dialog"] {
      background-color: rgb(var(--gptdaddy-surface-rgb, 248 250 253) / .88) !important;
      backdrop-filter: blur(18px) saturate(1.12) !important;
    }
    html[data-gptdaddy-composer-color] [role="menu"][data-gptdaddy-profile-menu] {
      background-color: var(--gptdaddy-composer-surface) !important;
      color: var(--gptdaddy-composer-ink) !important;
      backdrop-filter: none !important;
    }
    html[data-gptdaddy-composer-color] [role="menu"][data-gptdaddy-profile-menu] :is([role="menuitem"], button, span, svg) {
      color: var(--gptdaddy-composer-ink) !important;
    }
    html[data-gptdaddy-composer-color] [role="menu"][data-gptdaddy-profile-menu] :is([role="menuitem"]:hover, [role="menuitem"][data-highlighted]) {
      background-color: color-mix(in srgb, var(--gptdaddy-composer-ink) 10%, transparent) !important;
    }
    html[data-gptdaddy-font-color] :is([role="menu"], [data-radix-popper-content-wrapper] > [role="dialog"]) :is(button, [role="menuitem"], [role="option"], span, svg) {
      color: var(--gptdaddy-font-color) !important;
    }
    [class*="ComposerTopMenuShell"] > div,
    [class*="ComposerTopMenuShell"] .text-codex-description.sticky,
    [role="menu"][data-gptdaddy-permissions-menu] {
      background-color: var(--gptdaddy-composer-surface, var(--color-surface-elevated-secondary, #edf8ff)) !important;
      backdrop-filter: none !important;
    }
    html[data-gptdaddy-font-color] [class*="ComposerTopMenuShell"] :is(button, span, svg) {
      color: var(--gptdaddy-font-color) !important;
    }
    html[data-gptdaddy-composer-color] #root :is([class*="ComposerLayoutRoot"], [data-composer-utility-bar-variant="home"] [class*="ComposerLayoutBody"]) {
      background-color: var(--gptdaddy-composer-surface) !important;
    }
    html[data-gptdaddy-composer-color] #root [class~="group/home-composer-layout"] [class*="_rail_"]:has(> [class~="bg-background-composer-action-bar"]),
    html[data-gptdaddy-composer-color] #root [class~="group/home-composer-layout"] [class~="bg-background-composer-action-bar"] {
      background-color: var(--gptdaddy-composer-surface) !important;
      border-radius: 22px 22px 0 0 !important;
    }
    html[data-gptdaddy-composer-color] #root [class~="group/home-composer-layout"] [class*="_rail_"]:has(> [class~="bg-background-composer-action-bar"]) {
      margin-inline: 0 !important;
    }
    html[data-gptdaddy-composer-color] #root [class~="group/home-composer-layout"] [class*="ComposerLayoutRoot"] {
      background-color: transparent !important;
    }
    html[data-gptdaddy-composer-color] #root [class~="group/home-composer-layout"] [class~="bg-background-composer-action-bar"] :is(button, span, svg) {
      color: var(--gptdaddy-composer-ink) !important;
    }
    html[data-gptdaddy-composer-color] #root [class~="group/home-composer-layout"] [class*="ComposerLayoutBody"] .ProseMirror .placeholder {
      color: color-mix(in srgb, var(--gptdaddy-composer-ink) 72%, transparent) !important;
    }
    html[data-gptdaddy-composer-color] #root [class~="group/profile-section"] [class*="_showcaseEmptyState_"],
    html[data-gptdaddy-composer-color] [data-gptdaddy-profile-editor] [class^="_surface_"] {
      background-color: var(--gptdaddy-composer-surface) !important;
      color: var(--gptdaddy-composer-ink) !important;
    }
    html[data-gptdaddy-composer-color] #root [class~="group/profile-section"] [class*="_showcaseEmptyState_"] :is(div, span, p, button, label),
    html[data-gptdaddy-composer-color] [data-gptdaddy-profile-editor] [class^="_surface_"] :is(div, span, p, button, label) {
      color: var(--gptdaddy-composer-ink) !important;
    }
    .codex-dialog[role="dialog"][data-gptdaddy-full-access-confirm] {
      background-color: var(--gptdaddy-composer-surface, var(--color-surface-elevated-secondary, #edf8ff)) !important;
      background-image: none !important;
      color: var(--gptdaddy-confirm-ink, #18334f) !important;
      backdrop-filter: none !important;
      border-radius: 24px !important;
    }
    .codex-dialog[role="dialog"][data-gptdaddy-full-access-confirm] :is(h2, p, span, div, button, a, label) {
      color: var(--gptdaddy-confirm-ink, #18334f) !important;
      text-shadow: none !important;
    }
    #root [class~="group/settings"] [class*="after:inset-x-4"][class*="rounded-2xl"][class*="overflow-hidden"],
    #root [class~="group/settings"] [class*="ring-border-subtle"][class*="rounded-2xl"][class*="overflow-hidden"],
    #root [class~="group/settings"] [class*="after:inset-x-4"][class*="rounded-2xl"][class*="overflow-visible"] {
      background-color: transparent !important;
      backdrop-filter: none !important;
      border-color: transparent !important;
      box-shadow: none !important;
    }
    #root [class~="group/settings"] :is(section, label, p, span, button) {
      text-shadow: 0 1px 3px rgb(0 0 0 / .65);
    }
    #root [data-gptdaddy-flat-header]::before {
      background: transparent !important;
      opacity: 0 !important;
    }
    html[data-gptdaddy-composer-contrast] [class*="ComposerTopMenuShell"] :is(button, span, [role="option"]),
    html[data-gptdaddy-composer-contrast] [role="menu"][data-gptdaddy-permissions-menu] :is(button, span, [role="menuitem"]),
    html[data-gptdaddy-composer-contrast] #root [class*="ComposerLayoutRoot"] :is(button, span, textarea, [contenteditable="true"]) {
      color: var(--gptdaddy-composer-ink) !important;
    }
    html[data-gptdaddy-composer-contrast] #root [class*="ComposerLayoutRoot"] :is(textarea, [contenteditable="true"])::placeholder {
      color: color-mix(in srgb, var(--gptdaddy-composer-ink) 65%, transparent) !important;
    }
    html[data-gptdaddy-font-color] #root .app-shell-left-panel svg [fill="currentColor"],
    html[data-gptdaddy-font-color] #root header[class*="titlebar" i] svg [fill="currentColor"],
    html[data-gptdaddy-font-color] #root [class*="app-shell-header-toolbar"] svg [fill="currentColor"] {
      fill: var(--gptdaddy-font-color) !important;
    }
    html[data-gptdaddy-font-color] #root .app-shell-left-panel svg [stroke="currentColor"],
    html[data-gptdaddy-font-color] #root header[class*="titlebar" i] svg [stroke="currentColor"],
    html[data-gptdaddy-font-color] #root [class*="app-shell-header-toolbar"] svg [stroke="currentColor"] {
      stroke: var(--gptdaddy-font-color) !important;
    }
    html[data-gptdaddy-font-color] #root main :is(p, h1, h2, h3, h4, h5, h6, li, blockquote),
    html[data-gptdaddy-font-color] #root main :is(p, h1, h2, h3, h4, h5, h6, li, blockquote) span,
    html[data-gptdaddy-font-color] #root aside :is(p, a, span, h1, h2, h3) {
      color: var(--gptdaddy-font-color) !important;
    }
    #root [class~="group/settings"] :is(button, input, textarea, select)[class~="bg-primary-soft-alpha"],
    #root [class~="group/settings"] :is(button, input, textarea, select)[class~="bg-primary-soft"],
    #root [class~="group/settings"] :is(button, input, textarea, select)[class~="bg-primary-soft-alpha"] :is(span, div),
    #root [class~="group/settings"] :is(button, input, textarea, select)[class~="bg-primary-soft"] :is(span, div) {
      color: #18334f !important;
      text-shadow: none !important;
    }
    #root [class~="group/settings"] :is(input, textarea)[class~="bg-primary-soft-alpha"]::placeholder,
    #root [class~="group/settings"] :is(input, textarea)[class~="bg-primary-soft"]::placeholder {
      color: rgb(24 51 79 / .65) !important;
    }
    html[data-gptdaddy-composer-color] body [role="menu"][data-gptdaddy-profile-menu] :is([role="menuitem"], button, div, span, svg),
    html[data-gptdaddy-composer-color] #root [class~="group/profile-section"] [class*="_showcaseEmptyState_"] :is(div, span, p, button, label),
    html[data-gptdaddy-composer-color] body [data-gptdaddy-profile-editor] [class^="_surface_"] :is(div, span, p, button, label) {
      color: var(--gptdaddy-composer-ink) !important;
      text-shadow: none !important;
    }
    #${HOST_ID} { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; background: #090b0f; }
    #${HOST_ID} .gptdaddy-media { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; transition: opacity 260ms ease; }
    #${HOST_ID} .gptdaddy-scrim { position: absolute; inset: 0; pointer-events: none; }
  `;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('aria-hidden', 'true');
  host.dataset.gptdaddyVersion = initialConfig.pluginVersion || CONTROLLER_VERSION;
  const shadow = host.attachShadow({ mode: 'open' });
  const shadowStyle = document.createElement('style');
  shadowStyle.textContent = `
    :host { all: initial; }
    video, img { position:absolute; inset:0; width:100%; height:100%; opacity:0; transition:opacity 260ms ease; will-change:opacity,transform; }
    .visible { opacity:1; }
    .scrim { position:absolute; inset:0; }
  `;
  const mediaA = document.createElement('video');
  const mediaB = document.createElement('video');
  const imageA = document.createElement('img');
  const imageB = document.createElement('img');
  const scrim = document.createElement('div');
  mediaA.className = 'visible';
  scrim.className = 'scrim';
  for (const video of [mediaA, mediaB]) {
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
  }
  shadow.append(shadowStyle, mediaA, mediaB, imageA, imageB, scrim);
  state.activeVideo = mediaA;
  state.standbyVideo = mediaB;
  state.standbyImage = imageA;

  function ensureAttached() {
    if (!document.head?.contains(style)) document.head?.append(style);
    if (!host.isConnected && document.body) document.body.prepend(host);
  }

  let bodyObserver = null;
  function bindBodyObserver() {
    bodyObserver?.disconnect();
    if (!document.body) return;
    bodyObserver = new MutationObserver(() => {
      if (!host.isConnected) queueMicrotask(ensureAttached);
    });
    bodyObserver.observe(document.body, { childList: true });
  }

  const documentObserver = new MutationObserver(() => {
    ensureAttached();
    bindBodyObserver();
    bindChromeObserver();
  });
  documentObserver.observe(document.documentElement, { childList: true });
  ensureAttached();
  bindBodyObserver();

  let chromeTimer = null;
  const chromeObserver = new MutationObserver(() => {
    if (chromeTimer) return;
    chromeTimer = setTimeout(() => {
      chromeTimer = null;
      applyChromeFontColor();
    }, 120);
  });
  function bindChromeObserver() {
    chromeObserver.disconnect();
    if (document.body) chromeObserver.observe(document.body, { childList: true, subtree: true });
    applyChromeFontColor();
  }
  bindChromeObserver();

  function applyVisualSettings() {
    const config = state.config;
    document.documentElement.style.setProperty('--gptdaddy-panel-opacity', String(config.opacity ?? 0.72));
    document.documentElement.style.setProperty('--gptdaddy-panel-blur', `${Number(config.blurPx ?? 0)}px`);
    const composerColor = config.composerBackgroundColor;
    if (typeof composerColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(composerColor)) {
      document.documentElement.setAttribute('data-gptdaddy-composer-color', '');
      document.documentElement.style.setProperty('--gptdaddy-composer-surface', composerColor);
      const fontColor = config.fontColor;
      const preferredInk = typeof fontColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(fontColor) ? fontColor : '#18334f';
      const contrast = contrastRatio(preferredInk, composerColor);
      const fallbackInk = contrastRatio('#18334f', composerColor) > contrastRatio('#ffffff', composerColor) ? '#18334f' : '#ffffff';
      document.documentElement.style.setProperty('--gptdaddy-composer-ink', contrast < 4.5 ? fallbackInk : preferredInk);
      const confirmInk = contrastRatio(preferredInk, composerColor) >= 4.5 ? preferredInk
        : contrastRatio('#18334f', composerColor) >= 4.5 ? '#18334f'
          : contrastRatio('#000000', composerColor) > contrastRatio('#ffffff', composerColor) ? '#000000' : '#ffffff';
      document.documentElement.style.setProperty('--gptdaddy-confirm-ink', confirmInk);
      if (contrast < 4.5) {
        document.documentElement.setAttribute('data-gptdaddy-composer-contrast', '');
      } else {
        document.documentElement.removeAttribute('data-gptdaddy-composer-contrast');
      }
    } else {
      document.documentElement.removeAttribute('data-gptdaddy-composer-color');
      document.documentElement.style.removeProperty('--gptdaddy-composer-surface');
      document.documentElement.removeAttribute('data-gptdaddy-composer-contrast');
      document.documentElement.style.removeProperty('--gptdaddy-composer-ink');
      document.documentElement.style.removeProperty('--gptdaddy-confirm-ink');
    }
    updateThemeSurface();
    applyFontColor();
    host.style.filter = `blur(${Number(config.blurPx ?? 0)}px)`;
    const transform = `scale(${Number(config.zoom ?? 100) / 100})`;
    for (const media of [mediaA, mediaB, imageA, imageB]) {
      if (media.tagName === 'VIDEO') media.muted = config.muted !== false;
      media.style.objectFit = config.fit || 'cover';
      media.style.objectPosition = `${Number(config.positionX ?? 50)}% ${Number(config.positionY ?? 50)}%`;
      media.style.transform = transform;
    }
    scrim.style.background = `rgba(0,0,0,${Number(config.scrimOpacity ?? 0.2)})`;
  }

  function contrastRatio(first, second) {
    const luminance = (hex) => {
      const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
      const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  }

  let surfaceRgb = '';
  function updateThemeSurface() {
    const rootStyle = getComputedStyle(document.documentElement);
    const colorScheme = rootStyle.colorScheme;
    const color = rootStyle.color.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [24, 51, 79];
    const custom = state.config.fontColor;
    const sample = typeof custom === 'string' && /^#[0-9a-fA-F]{6}$/.test(custom)
      ? [1, 3, 5].map((offset) => parseInt(custom.slice(offset, offset + 2), 16)) : color;
    const textBrightness = sample[0] * 0.2126 + sample[1] * 0.7152 + sample[2] * 0.0722;
    const darkSurface = custom ? textBrightness > 140 : (colorScheme.includes('dark') && !colorScheme.includes('light') || textBrightness > 140);
    const next = darkSurface
      ? '20 23 29' : '248 250 253';
    if (next !== surfaceRgb) {
      surfaceRgb = next;
      document.documentElement.style.setProperty('--gptdaddy-surface-rgb', next);
    }
  }

  function armFrameTelemetry(video) {
    if (typeof video.requestVideoFrameCallback !== 'function') return;
    const onFrame = () => {
      if (video !== state.activeVideo) return;
      state.lastFrameAt = performance.now();
      state.presentedCallbacks += 1;
      state.recoveryAttempts = 0;
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  }

  async function swapSource(sourceUrl, sourceToken = sourceUrl, ownedBlobUrl = null, kind = 'video') {
    if (!sourceUrl || (state.activeImage || state.activeVideo)?.dataset.sourceToken === sourceToken) return;
    const image = kind === 'image';
    const incoming = image ? state.standbyImage : state.standbyVideo;
    const outgoing = state.activeImage || state.activeVideo;
    incoming.classList.remove('visible');
    incoming.dataset.source = sourceUrl;
    incoming.dataset.sourceToken = sourceToken;
    if (ownedBlobUrl) incoming.dataset.blobUrl = ownedBlobUrl;
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Wallpaper media load timed out')), 15000);
      incoming.addEventListener(image ? 'load' : 'canplay', () => { clearTimeout(timer); resolve(); }, { once: true });
      incoming.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Wallpaper media failed to load')); }, { once: true });
    });
    incoming.src = sourceUrl;
    if (!image) { incoming.currentTime = 0; incoming.load(); }
    await ready;
    if (!image && state.desiredPlaying && !state.pausedByHost) await incoming.play();
    incoming.classList.add('visible');
    outgoing.classList.remove('visible');
    setTimeout(() => {
      if (outgoing === state.activeVideo || outgoing === state.activeImage) return;
      if (outgoing.tagName === 'VIDEO') outgoing.pause();
      outgoing.removeAttribute('src');
      if (outgoing.tagName === 'VIDEO') outgoing.load();
      if (outgoing.dataset.blobUrl) URL.revokeObjectURL(outgoing.dataset.blobUrl);
      delete outgoing.dataset.source;
      delete outgoing.dataset.sourceToken;
      delete outgoing.dataset.blobUrl;
    }, 320);
    if (image) {
      state.activeImage = incoming;
      state.activeVideo = null;
      state.standbyImage = incoming === imageA ? imageB : imageA;
    } else {
      state.activeVideo = incoming;
      state.activeImage = null;
      state.standbyVideo = incoming === mediaA ? mediaB : mediaA;
    }
    state.lastFrameAt = 0;
    state.presentedCallbacks = 0;
    state.sourceLoadedAt = performance.now();
    state.lastAdvanceAt = performance.now();
    state.lastMediaTime = image ? 0 : incoming.currentTime;
    state.sourceChanges += 1;
    if (!image) armFrameTelemetry(incoming);
  }

  async function recoverFrozenVideo(now) {
    if (state.recovering || document.hidden) return false;
    const cooldowns = [0, 5000, 15000, 60000];
    if (state.recoveryAttempts >= cooldowns.length) return false;
    const cooldown = cooldowns[state.recoveryAttempts];
    if (now - state.lastRecoveryAt < cooldown) return false;
    const video = state.activeVideo;
    const savedTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    state.lastRecoveryAt = now;
    state.recoveryAttempts += 1;
    state.freezes += 1;
    state.recovering = true;
    const playWithTimeout = async () => {
      let timer;
      try {
        await Promise.race([
          video.play(),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Wallpaper play timed out')), 5000); }),
        ]);
      } finally { clearTimeout(timer); }
    };
    try {
      if (state.recoveryAttempts === 1) {
        await playWithTimeout();
      } else if (state.recoveryAttempts === 2) {
        video.currentTime = savedTime + 0.01;
        await playWithTimeout();
      } else {
        video.load();
        if (video.readyState < 1) await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Wallpaper metadata reload timed out')), 5000);
          video.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve(); }, { once: true });
          video.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Wallpaper metadata reload failed')); }, { once: true });
        });
        video.currentTime = savedTime;
        await playWithTimeout();
      }
      return true;
    } catch {
      return false;
    } finally {
      state.recovering = false;
    }
  }

  const onVisibilityChange = () => {
    if (document.hidden) return;
    state.visibleAt = performance.now();
    state.lastAdvanceAt = performance.now();
    if (state.desiredPlaying && !state.pausedByHost && state.activeVideo?.src && state.activeVideo.paused) {
      void state.activeVideo.play().catch(() => {});
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const watchdog = setInterval(() => {
    updateThemeSurface();
    applyChromeFontColor();
    const video = state.activeVideo;
    if (!video || !state.desiredPlaying || state.pausedByHost || document.hidden || !video.src) return;
    const now = performance.now();
    if (Math.abs(video.currentTime - state.lastMediaTime) > 0.02) {
      state.lastMediaTime = video.currentTime;
      state.lastAdvanceAt = now;
    }
    const frameStalled = typeof video.requestVideoFrameCallback === 'function' &&
      now - Math.max(state.lastFrameAt, state.sourceLoadedAt, state.visibleAt) > 4500;
    const mediaTimeStalled = now - state.lastAdvanceAt > 4500;
    if (frameStalled || mediaTimeStalled) void recoverFrozenVideo(now);
  }, 2000);

  const controller = {
    version: CONTROLLER_VERSION,
    async configure(next) {
      state.config = { ...state.config, ...next };
      applyVisualSettings();
      ensureAttached();
      if (next.sourceUrl) await swapSource(next.sourceUrl);
      return this.snapshot();
    },
    beginBlob(token, totalBytes, mime = 'video/mp4') {
      if ((state.activeImage || state.activeVideo)?.dataset.sourceToken === token) return false;
      state.transfer = { token, totalBytes, mime, received: 0, chunks: [] };
      return true;
    },
    pushBlob(token, base64) {
      const transfer = state.transfer;
      if (!transfer || transfer.token !== token) return false;
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      transfer.chunks.push(bytes);
      transfer.received += bytes.length;
      return transfer.received;
    },
    async finishBlob(token) {
      const transfer = state.transfer;
      if (!transfer || transfer.token !== token || transfer.received !== transfer.totalBytes) throw new Error('Incomplete wallpaper transfer');
      state.transfer = null;
      const blobUrl = URL.createObjectURL(new Blob(transfer.chunks, { type: transfer.mime }));
      transfer.chunks.length = 0;
      try { await swapSource(blobUrl, token, blobUrl, transfer.mime.startsWith('image/') ? 'image' : 'video'); }
      catch (error) { URL.revokeObjectURL(blobUrl); throw error; }
      return this.snapshot();
    },
    async pause(reason = 'host') {
      state.pausedByHost = true;
      state.activeVideo?.pause();
      return { paused: true, reason };
    },
    async resume(reason = 'host') {
      state.pausedByHost = false;
      state.desiredPlaying = true;
      if (state.activeVideo?.src) await state.activeVideo.play();
      return { paused: false, reason };
    },
    snapshot() {
      const video = state.activeVideo;
      const image = state.activeImage;
      const quality = video?.getVideoPlaybackQuality?.();
      return {
        installed: host.isConnected,
        sourceUrl: (image || video)?.dataset.sourceToken || null,
        mediaKind: image ? 'image' : 'video',
        currentTime: video?.currentTime || 0,
        paused: image ? false : video?.paused ?? true,
        readyState: image ? (image.complete && image.naturalWidth ? 4 : 0) : video?.readyState ?? 0,
        presentedFrames: quality?.totalVideoFrames ?? null,
        presentedCallbacks: image ? (image.complete && image.naturalWidth ? 1 : 0) : state.presentedCallbacks,
        droppedFrames: quality?.droppedVideoFrames ?? null,
        lastFrameAgeMs: image ? 0 : state.lastFrameAt ? Math.round(performance.now() - state.lastFrameAt) : null,
        recoveryAttempts: state.recoveryAttempts,
        freezes: state.freezes,
        sourceChanges: state.sourceChanges,
      };
    },
    remove() {
      window.__gptDaddyRemovePanel?.();
      clearInterval(watchdog);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      bodyObserver?.disconnect();
      documentObserver.disconnect();
      chromeObserver.disconnect();
      clearTimeout(chromeTimer);
      restoreChromeFontColor();
      for (const menu of document.querySelectorAll('[data-gptdaddy-permissions-menu]')) menu.removeAttribute('data-gptdaddy-permissions-menu');
      for (const menu of document.querySelectorAll('[data-gptdaddy-profile-menu]')) menu.removeAttribute('data-gptdaddy-profile-menu');
      for (const shell of document.querySelectorAll('[data-gptdaddy-flat-header]')) shell.removeAttribute('data-gptdaddy-flat-header');
      for (const dialog of document.querySelectorAll('[data-gptdaddy-profile-editor]')) dialog.removeAttribute('data-gptdaddy-profile-editor');
      for (const dialog of document.querySelectorAll('[data-gptdaddy-full-access-confirm]')) dialog.removeAttribute('data-gptdaddy-full-access-confirm');
      for (const video of [mediaA, mediaB]) { video.pause(); video.removeAttribute('src'); video.load(); }
      for (const image of [imageA, imageB]) image.removeAttribute('src');
      for (const media of [mediaA, mediaB, imageA, imageB]) if (media.dataset.blobUrl) URL.revokeObjectURL(media.dataset.blobUrl);
      style.remove();
      host.remove();
      document.documentElement.style.removeProperty('--gptdaddy-panel-opacity');
      document.documentElement.style.removeProperty('--gptdaddy-panel-blur');
      document.documentElement.removeAttribute('data-gptdaddy-composer-color');
      document.documentElement.style.removeProperty('--gptdaddy-composer-surface');
      document.documentElement.removeAttribute('data-gptdaddy-composer-contrast');
      document.documentElement.style.removeProperty('--gptdaddy-composer-ink');
      document.documentElement.style.removeProperty('--gptdaddy-confirm-ink');
      document.documentElement.style.removeProperty('--gptdaddy-surface-rgb');
      document.documentElement.removeAttribute('data-gptdaddy-font-color');
      document.documentElement.style.removeProperty('--gptdaddy-font-color');
      for (const [name, original] of originalTextTokens) {
        if (original) document.documentElement.style.setProperty(name, original);
        else document.documentElement.style.removeProperty(name);
      }
      delete window[GLOBAL_KEY];
      return true;
    },
  };
  window[GLOBAL_KEY] = controller;
  applyVisualSettings();
  return controller.configure(initialConfig);
}

export function buildInjectionScript(config) {
  return `(${installWallpaperHost.toString()})(${JSON.stringify(config)});${buildInappPanelScript()}`;
}

export const SNAPSHOT_EXPRESSION = 'window.__gptDaddyWallpaperControllerV1?.snapshot?.() ?? null';
export const REMOVE_EXPRESSION = 'window.__gptDaddyWallpaperControllerV1?.remove?.() ?? false';
export const PAUSE_EXPRESSION = 'window.__gptDaddyWallpaperControllerV1?.pause?.("host") ?? false';
export const RESUME_EXPRESSION = 'window.__gptDaddyWallpaperControllerV1?.resume?.("host") ?? false';
