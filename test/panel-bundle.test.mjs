import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

test('minified in-app panel keeps its setting helpers inside the serialized function', async () => {
  const result = await build({ entryPoints: ['src/wallpaper/inapp-panel.mjs'], bundle: true, minify: true, format: 'esm', write: false });
  const url = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`;
  const { buildInappPanelScript } = await import(url);
  const script = buildInappPanelScript();
  assert.doesNotThrow(() => new Function(script));
  const opening = script.slice(0, script.indexOf('gptdaddy-desktop-panel'));
  assert.match(opening, /scrimOpacity/);
  assert.match(opening, /zoom/);
  assert.doesNotMatch(script, /\bJt\(/);
  assert.match(script, /2026-10-29-panel-bundle-fix/);
  assert.match(script, /__gptDaddyRemovePanel/);
});
