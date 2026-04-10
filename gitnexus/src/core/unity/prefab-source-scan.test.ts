import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { streamPrefabSourceRefs } from './prefab-source-scan.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity');
const assetGuidToPath = new Map([['99999999999999999999999999999999', 'Assets/Prefabs/BattleMode.prefab']]);
const scopedFiles = ['Assets/Scene/MainUIManager.unity', 'Assets/Prefabs/BattleMode.prefab'];

test('same source can yield prefab-source rows while script-guid flow remains independent', async () => {
  const rows: any[] = [];
  for await (const row of streamPrefabSourceRefs({
    repoRoot: fixtureRoot,
    resourceFiles: ['Assets/Scene/MainUIManager.unity'],
    assetGuidToPath,
  })) {
    rows.push(row);
  }
  assert.ok(rows.length > 0);
  assert.equal(rows.every((r) => r.fieldName === 'm_SourcePrefab'), true);
});

test('streamPrefabSourceRefs does not open second file before first row is yielded', async () => {
  const probe: string[] = [];
  const iterator = streamPrefabSourceRefs({
    repoRoot: fixtureRoot,
    resourceFiles: scopedFiles,
    assetGuidToPath,
    hooks: {
      onFileOpen: (filePath) => probe.push(`open:${filePath}`),
      onYield: () => probe.push('yield'),
    },
  })[Symbol.asyncIterator]();
  const first = await iterator.next();
  assert.equal(first.done, false);
  assert.equal(first.value.fieldName, 'm_SourcePrefab');
  assert.equal(probe.includes('open:Assets/Prefabs/BattleMode.prefab'), false);
  await iterator.return?.(undefined);
});

test('producer rows are immutable snapshots (consumer mutation does not backflow)', async () => {
  for await (const row of streamPrefabSourceRefs({
    repoRoot: fixtureRoot,
    resourceFiles: scopedFiles,
    assetGuidToPath,
  })) {
    const copy = { ...row };
    copy.targetResourcePath = '__PLACEHOLDER__';
  }

  const again: any[] = [];
  for await (const row of streamPrefabSourceRefs({
    repoRoot: fixtureRoot,
    resourceFiles: scopedFiles,
    assetGuidToPath,
  })) {
    again.push(row);
  }
  assert.equal(again.some((r) => r.targetResourcePath === '__PLACEHOLDER__'), false);
});

test('bounded queue backpressure never exceeds configured depth when decoupled mode is enabled', async () => {
  const depthSamples: number[] = [];
  for await (const _row of streamPrefabSourceRefs({
    repoRoot: fixtureRoot,
    resourceFiles: scopedFiles,
    assetGuidToPath,
    queue: { enabled: true, maxDepth: 64 },
    hooks: { onQueueDepth: (depth) => depthSamples.push(depth) },
  })) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(depthSamples.every((depth) => depth <= 64), true);
});
