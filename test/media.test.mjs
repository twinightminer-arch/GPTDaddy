import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRange } from '../src/server/media.mjs';

test('parses ordinary and suffix byte ranges', () => {
  assert.deepEqual(parseRange('bytes=10-19', 100), { start: 10, end: 19 });
  assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=100-101', 100), { invalid: true });
});
