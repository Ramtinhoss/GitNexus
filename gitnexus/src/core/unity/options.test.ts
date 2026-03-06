import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUnityResourcesMode } from './options.js';

test('parseUnityResourcesMode defaults to off', () => {
  assert.equal(parseUnityResourcesMode(undefined), 'off');
});

test('parseUnityResourcesMode validates mode', () => {
  assert.equal(parseUnityResourcesMode('on'), 'on');
  assert.throws(() => parseUnityResourcesMode('bad'), /unity resources mode/i);
});
