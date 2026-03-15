import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUnityHydrationMode, parseUnityResourcesMode } from './options.js';

test('parseUnityResourcesMode defaults to off', () => {
  assert.equal(parseUnityResourcesMode(undefined), 'off');
});

test('parseUnityResourcesMode validates mode', () => {
  assert.equal(parseUnityResourcesMode('on'), 'on');
  assert.throws(() => parseUnityResourcesMode('bad'), /unity resources mode/i);
});

test('parseUnityHydrationMode defaults to compact', () => {
  assert.equal(parseUnityHydrationMode(undefined), 'compact');
});

test('parseUnityHydrationMode validates mode', () => {
  assert.equal(parseUnityHydrationMode('compact'), 'compact');
  assert.throws(() => parseUnityHydrationMode('bad'), /unity hydration mode/i);
});
