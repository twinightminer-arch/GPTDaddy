import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv']);

export function isPathInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export function librariesFromVdfText(text) {
  const libraries = [];
  const blockHeader = /"\d+"\s*\{/g;
  for (const match of text.matchAll(blockHeader)) {
    const openingBrace = match.index + match[0].lastIndexOf('{');
    let depth = 0;
    let closingBrace = -1;
    for (let index = openingBrace; index < text.length; index += 1) {
      if (text[index] === '{') depth += 1;
      else if (text[index] === '}') {
        depth -= 1;
        if (depth === 0) { closingBrace = index; break; }
      }
    }
    if (closingBrace < 0) continue;
    const block = text.slice(openingBrace + 1, closingBrace);
    if (!/"431960"\s+"\d+"/.test(block)) continue;
    const pathMatch = block.match(/"path"\s+"([^"]+)"/);
    if (pathMatch) libraries.push(pathMatch[1].replace(/\\\\/g, '\\'));
  }
  return libraries;
}

function steamRoots() {
  const candidates = [];
  const registrySteam = process.env.GPTDADDY_STEAM_ROOT;
  if (registrySteam) candidates.push(registrySteam);
  candidates.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam', 'D:\\Steam');
  return [...new Set(candidates.filter((item) => existsSync(item)))];
}

export function discoverSteamLibraries() {
  const libraries = new Set();
  for (const root of steamRoots()) {
    libraries.add(root);
    const vdf = join(root, 'steamapps', 'libraryfolders.vdf');
    if (!existsSync(vdf)) continue;
    try {
      for (const library of librariesFromVdfText(readFileSync(vdf, 'utf8'))) libraries.add(library);
    } catch { /* malformed Steam metadata is ignored */ }
  }
  return [...libraries];
}

function safeFile(root, relativePath) {
  if (!relativePath || typeof relativePath !== 'string') return null;
  const candidate = resolve(root, relativePath);
  return isPathInside(root, candidate) && existsSync(candidate) ? candidate : null;
}

export function readProject(projectRoot, source = 'workshop', cached = null) {
  const metadataFile = join(projectRoot, 'project.json');
  if (!existsSync(metadataFile)) return null;
  let metadataStat;
  try { metadataStat = statSync(metadataFile); } catch { return null; }
  let cachedMediaStat = null;
  try { if (cached?.playablePath) cachedMediaStat = statSync(cached.playablePath); } catch { /* stale entry */ }
  if (cached?.metadataMtimeMs === metadataStat.mtimeMs &&
      cached?.projectRoot === projectRoot &&
      (!cached.playablePath || cachedMediaStat?.mtimeMs === cached.mediaMtimeMs) &&
      (!cached.previewPath || existsSync(cached.previewPath))) return cached;
  let metadata;
  try { metadata = JSON.parse(readFileSync(metadataFile, 'utf8')); } catch { return null; }
  const type = String(metadata.type || '').toLowerCase();
  const filePath = safeFile(projectRoot, metadata.file);
  const previewPath = safeFile(projectRoot, metadata.preview);
  const fileExtension = filePath ? extname(filePath).toLowerCase() : '';
  let capability = 'static-preview';
  let playablePath = previewPath;
  if (type === 'video' && filePath && VIDEO_EXTENSIONS.has(fileExtension)) {
    capability = fileExtension === '.mp4' || fileExtension === '.webm' ? 'native-video' : 'needs-transcode';
    playablePath = filePath;
  } else if (previewPath && extname(previewPath).toLowerCase() === '.gif') {
    capability = 'animated-preview';
  } else if (!previewPath) {
    capability = 'unsupported';
    playablePath = null;
  }
  const id = source === 'workshop' ? basename(projectRoot) : `local:${basename(projectRoot)}`;
  const playableStat = playablePath ? statSync(playablePath) : null;
  return {
    id,
    title: String(metadata.title || id),
    type,
    source,
    capability,
    projectRoot,
    filePath,
    previewPath,
    playablePath,
    contentRating: String(metadata.contentrating || 'Unknown'),
    tags: Array.isArray(metadata.tags) ? metadata.tags : [],
    bytes: playableStat?.size || 0,
    metadataMtimeMs: metadataStat.mtimeMs,
    mediaMtimeMs: playableStat?.mtimeMs || null,
  };
}

function projectDirectories(root) {
  if (!existsSync(root)) return [];
  try { return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(root, entry.name)); }
  catch { return []; }
}

export function enumerateWallpaperSources({ libraryDirs = discoverSteamLibraries(), extraRoots = [], previous = [] } = {}) {
  const rows = [];
  const visited = new Set();
  const cached = new Map(previous.map((item) => [item.projectRoot, item]));
  for (const library of libraryDirs) {
    const workshop = join(library, 'steamapps', 'workshop', 'content', '431960');
    for (const projectRoot of projectDirectories(workshop)) {
      const resolved = resolve(projectRoot).toLowerCase();
      if (visited.has(resolved)) continue;
      visited.add(resolved);
      const project = readProject(projectRoot, 'workshop', cached.get(projectRoot));
      if (project) rows.push(project);
    }
    const local = join(library, 'steamapps', 'common', 'wallpaper_engine', 'projects', 'myprojects');
    for (const projectRoot of projectDirectories(local)) {
      const resolved = resolve(projectRoot).toLowerCase();
      if (visited.has(resolved)) continue;
      visited.add(resolved);
      const project = readProject(projectRoot, 'local', cached.get(projectRoot));
      if (project) rows.push(project);
    }
  }
  for (const root of extraRoots) {
    for (const projectRoot of projectDirectories(root)) {
      const project = readProject(projectRoot, 'manual', cached.get(projectRoot));
      if (project) rows.push(project);
    }
  }
  return rows.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
}
