import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadAgentContextDataset } from './io.js';

test('loadAgentContextDataset validates required scenario fields', async () => {
  const invalidRoot = path.resolve('src/benchmark/agent-context/__fixtures__/invalid/missing-checks');
  await assert.rejects(() => loadAgentContextDataset(invalidRoot), /missing required field/i);
});

test('loadAgentContextDataset loads valid thresholds and scenarios', async () => {
  const validRoot = path.resolve('src/benchmark/agent-context/__fixtures__/valid');
  const ds = await loadAgentContextDataset(validRoot);
  assert.equal(ds.scenarios.length, 1);
  assert.ok(ds.thresholds.coverage.minPerScenario > 0);
});

test('v1 scenario dataset loads exactly 3 scenarios', async () => {
  const v1Root = path.resolve('../benchmarks/agent-context/neonspark-refactor-v1');
  const ds = await loadAgentContextDataset(v1Root);
  assert.equal(ds.scenarios.length, 3);
});
