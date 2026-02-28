import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProfileConfig } from './benchmark-unity.js';

test('quick profile uses reduced sample limits', () => {
  const c = resolveProfileConfig('quick');
  assert.equal(c.maxSymbols, 10);
  assert.equal(c.maxTasks, 5);
});
