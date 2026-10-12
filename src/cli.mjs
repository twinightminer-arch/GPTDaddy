#!/usr/bin/env node
import { detectCodexWindows } from './codex/windows-discovery.mjs';
import { enumerateWallpaperSources } from './wallpaper/catalog.mjs';
import { runDaemon } from './daemon.mjs';

const command = process.argv[2] || 'daemon';

if (command === 'daemon') {
  await runDaemon();
} else if (command === 'doctor') {
  const codex = detectCodexWindows();
  const projects = enumerateWallpaperSources();
  console.log(JSON.stringify({
    codex,
    cdpReady: Boolean(codex.running && codex.cdpEnabled && codex.cdpLoopbackOnly),
    wallpapers: {
      total: projects.length,
      nativeVideo: projects.filter((item) => item.capability === 'native-video').length,
      animatedPreview: projects.filter((item) => item.capability === 'animated-preview').length,
      unsupported: projects.filter((item) => item.capability === 'unsupported').length,
    },
  }, null, 2));
} else if (command === 'list') {
  console.log(JSON.stringify(enumerateWallpaperSources().map(({ projectRoot, ...item }) => item), null, 2));
} else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 2;
}
