import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadBenchmarkDataset } from './io.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../..');

test('loadBenchmarkDataset parses thresholds and jsonl rows', async () => {
  const root = path.resolve(projectRoot, '../benchmarks/unity-baseline/v1');
  const ds = await loadBenchmarkDataset(root);
  assert.equal(typeof ds.thresholds.query.precisionMin, 'number');
  assert.ok(ds.symbols.length > 0);
  assert.ok(ds.relations.length > 0);
  assert.ok(ds.tasks.length > 0);
});

test('loadBenchmarkDataset rejects missing required fields', async () => {
  const badRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-bad-dataset-'));
  try {
    await fs.writeFile(path.join(badRoot, 'thresholds.json'), JSON.stringify({
      query: { precisionMin: 0.7, recallMin: 0.7, avgLatencyMsMax: 200, p95LatencyMsMax: 400 },
      context: { coverageMin: 0.7, latencyMsMax: 400 },
      impact: { recallMin: 0.7, avgLatencyMsMax: 400 },
    }), 'utf-8');
    await fs.writeFile(path.join(badRoot, 'symbols.jsonl'), `${JSON.stringify({
      symbol_uid: 'Class:Foo',
      file_path: 'Assets/Foo.cs',
      symbol_name: 'Foo',
      symbol_type: 'Class',
      start_line: 1,
      end_line: 10,
    })}\n`, 'utf-8');
    await fs.writeFile(path.join(badRoot, 'relations.jsonl'), `${JSON.stringify({
      src_uid: 'Class:Foo',
      edge_type: 'CALLS',
      dst_uid: 'Method:Bar',
      must_exist: true,
    })}\n`, 'utf-8');
    await fs.writeFile(path.join(badRoot, 'tasks.jsonl'), `${JSON.stringify({
      tool: 'query',
      input: {},
      must_hit_uids: [],
      // intentionally omit must_not_hit_uids
    })}\n`, 'utf-8');

    await assert.rejects(() => loadBenchmarkDataset(badRoot), /missing required field/i);
  } finally {
    await fs.rm(badRoot, { recursive: true, force: true });
  }
});

test('loadBenchmarkDataset parses neonspark-v1 dataset', async () => {
  const root = path.resolve(projectRoot, '../benchmarks/unity-baseline/neonspark-v1');
  const ds = await loadBenchmarkDataset(root);
  assert.equal(ds.symbols.length, 20);
  assert.ok(ds.relations.length > 0);
  assert.ok(ds.tasks.some((t) => t.tool === 'query'));
  assert.ok(ds.tasks.some((t) => t.tool === 'context'));
  assert.ok(ds.tasks.some((t) => t.tool === 'impact'));
});

test('loadBenchmarkDataset parses neonspark-v2 dataset', async () => {
  const root = path.resolve(projectRoot, '../benchmarks/unity-baseline/neonspark-v2');
  const ds = await loadBenchmarkDataset(root);
  assert.ok(ds.symbols.length >= 40 && ds.symbols.length <= 60);
  assert.ok(ds.relations.length > 0);
  assert.ok(ds.tasks.length >= 24);
  assert.ok(ds.tasks.some((t) => t.tool === 'query'));
  assert.ok(ds.tasks.some((t) => t.tool === 'context'));
  assert.ok(ds.tasks.some((t) => t.tool === 'impact'));
});

test('latest unity hydration gate report includes hydrationMetaSummary schema', async () => {
  const reportPath = path.resolve(projectRoot, 'docs/reports/2026-03-15-unity-hydration-gates.json');
  const raw = await fs.readFile(reportPath, 'utf-8');
  const report = JSON.parse(raw) as any;
  assert.ok(report.hydrationMetaSummary);
  assert.equal(typeof report.hydrationMetaSummary.compactNeedsRetryRate, 'number');
  assert.equal(typeof report.hydrationMetaSummary.parityCompleteRate, 'number');
});
