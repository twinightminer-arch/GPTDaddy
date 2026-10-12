import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { librariesFromVdfText, readProject } from '../src/wallpaper/catalog.mjs';

test('finds the Steam library that owns Wallpaper Engine', () => {
  const input = `"libraryfolders" { "0" { "path" "D:\\\\STEAM" "apps" { "431960" "123" } } "1" { "path" "E:\\\\Games" "apps" { "10" "1" } } }`;
  assert.deepEqual(librariesFromVdfText(input), ['D:\\STEAM']);
});

test('classifies a real MP4 as native video', () => {
  const root = mkdtempSync(join(tmpdir(), 'gptdaddy-catalog-'));
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'clip.mp4'), 'video');
  writeFileSync(join(root, 'preview.jpg'), 'image');
  writeFileSync(join(root, 'project.json'), JSON.stringify({ title: 'Test', type: 'video', file: 'clip.mp4', preview: 'preview.jpg' }));
  const project = readProject(root, 'workshop');
  assert.equal(project.capability, 'native-video');
  assert.equal(project.playablePath, join(root, 'clip.mp4'));
});

test('rejects media paths that escape the project directory', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gptdaddy-escape-'));
  const root = join(parent, 'project');
  mkdirSync(root);
  writeFileSync(join(parent, 'outside.mp4'), 'video');
  writeFileSync(join(root, 'project.json'), JSON.stringify({ title: 'Escape', type: 'video', file: '..\\outside.mp4' }));
  assert.equal(readProject(root, 'workshop').capability, 'unsupported');
});
