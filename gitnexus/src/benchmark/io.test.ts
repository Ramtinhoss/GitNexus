import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadBenchmarkDataset } from './io.js';

test('loadBenchmarkDataset parses thresholds and jsonl rows', async () => {
  const root = path.resolve('../benchmarks/unity-baseline/v1');
  const ds = await loadBenchmarkDataset(root);
  assert.equal(typeof ds.thresholds.query.precisionMin, 'number');
  assert.ok(ds.symbols.length > 0);
  assert.ok(ds.relations.length > 0);
  assert.ok(ds.tasks.length > 0);
});

test('loadBenchmarkDataset rejects missing required fields', async () => {
  const badRoot = path.resolve('src/benchmark/__fixtures__/bad-dataset');
  await assert.rejects(() => loadBenchmarkDataset(badRoot), /missing required field/i);
});
