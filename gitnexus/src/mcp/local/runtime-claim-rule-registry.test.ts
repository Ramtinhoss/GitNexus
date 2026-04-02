import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadRuleRegistry } from './runtime-claim-rule-registry.js';

test('loads active runtime claim rules from project catalog', async () => {
  const repoPath = path.resolve('.');
  const registry = await loadRuleRegistry(repoPath);
  assert.equal(registry.activeRules[0].id, 'unity.gungraph.reload.output-getvalue.v1');
  assert.equal(registry.activeRules[0].version, '1.0.0');
});
