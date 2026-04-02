import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHydrationPolicy,
  parseUnityEvidenceMode,
  parseUnityHydrationMode,
  parseUnityResourcesMode,
} from './options.js';

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

test('parseUnityEvidenceMode defaults to summary and validates mode', () => {
  assert.equal(parseUnityEvidenceMode(undefined), 'summary');
  assert.equal(parseUnityEvidenceMode('focused'), 'focused');
  assert.throws(() => parseUnityEvidenceMode('bad'), /unity evidence mode/i);
});

test('parseHydrationPolicy defaults to balanced and validates mode', () => {
  assert.equal(parseHydrationPolicy(undefined), 'balanced');
  assert.equal(parseHydrationPolicy('strict'), 'strict');
  assert.throws(() => parseHydrationPolicy('bad'), /hydration policy/i);
});
