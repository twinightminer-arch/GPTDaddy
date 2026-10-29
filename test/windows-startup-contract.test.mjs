import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = (path) => readFileSync(join(process.cwd(), path), 'utf8');

test('installer removes the periodic watchdog and registers one hidden logon task', () => {
  const installer = source('installer/GPTDaddy.iss');
  const cleanup = source('scripts/install-daemon-watchdog.ps1');
  const startup = source('scripts/install-daemon-startup.ps1');
  const activate = source('scripts/activate-installed-daemon.ps1');
  const launcher = source('scripts/start-daemon-hidden.vbs');
  assert.match(installer, /wscript\.exe.*start-daemon-hidden\.vbs/i);
  assert.match(installer, /install-daemon-watchdog\.ps1"" -Uninstall/i);
  assert.match(installer, /install-daemon-startup\.ps1/i);
  assert.doesNotMatch(cleanup, /\bRegister-ScheduledTask|New-ScheduledTaskTrigger/i);
  assert.match(startup, /New-ScheduledTaskTrigger -AtLogOn/);
  assert.match(startup, /-WindowStyle Hidden/);
  assert.doesNotMatch(startup, /-RepetitionInterval|New-TimeSpan -Minutes 1/);
  assert.match(activate, /Start-ScheduledTask -TaskName 'GPTDaddy-Daemon-Startup'/);
  assert.match(launcher, /ensure-installed-daemon\.ps1/i);
  assert.match(launcher, /shell\.Run command, 0, False/i);
});

test('updated Codex fallback never sends Quit keys to another foreground process', () => {
  const activation = source('scripts/activate-packaged-codex.ps1');
  assert.match(activation, /owner != pid \|\| !IsWindowVisible\(window\)/);
  assert.match(activation, /QuitShortcutIfForeground\(\[uint32\]\$ExpectedProcessId\)/);
  assert.match(activation, /Codex is not the foreground window; no shortcut was sent/);
});
