import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateLazyBindings } from './unity-lazy-hydrator.js';

test('hydrateLazyBindings processes pending paths in bounded chunks', async () => {
  const calls: string[][] = [];
  await hydrateLazyBindings({
    pendingPaths: ['a', 'b', 'c', 'd', 'e'],
    config: { lazyMaxPaths: 4, lazyBatchSize: 2, lazyMaxMs: 5000 },
    resolveBatch: async (paths) => {
      calls.push(paths);
      return new Map();
    },
  });

  assert.deepEqual(calls, [['a', 'b'], ['c', 'd']]);
});

test('parallel requests dedupe same hydration work', async () => {
  let resolveCalls = 0;
  const sharedInput = {
    pendingPaths: ['Assets/A.prefab'],
    config: { lazyMaxPaths: 10, lazyBatchSize: 5, lazyMaxMs: 5000 },
    dedupeKey: 'symbol:door::Assets/A.prefab',
    resolveBatch: async (_paths: string[]) => {
      resolveCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return new Map();
    },
  };

  await Promise.all([
    hydrateLazyBindings(sharedInput),
    hydrateLazyBindings(sharedInput),
  ]);

  assert.equal(resolveCalls, 1);
});

test('context lazy hydration returns partial results when budget exceeded and reports diagnostics', async () => {
  const out = await hydrateLazyBindings({
    pendingPaths: ['a', 'b', 'c', 'd'],
    config: { lazyMaxPaths: 4, lazyBatchSize: 2, lazyMaxMs: 1 },
    resolveBatch: async (paths) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Map(paths.map((p) => [p, []]));
    },
  });

  assert.equal(out.resolvedByPath.size, 2);
  assert.match(((out as any).diagnostics || []).join('\n'), /budget exceeded/i);
});

test('summary-only Unity analyze persistence still returns full bindings after lazy hydration', async () => {
  const out = await hydrateLazyBindings({
    pendingPaths: ['Assets/Doors/Door.prefab'],
    config: { lazyMaxPaths: 10, lazyBatchSize: 5, lazyMaxMs: 5000 },
    resolveBatch: async () => new Map([
      ['Assets/Doors/Door.prefab', [{
        resourcePath: 'Assets/Doors/Door.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '114',
        serializedFields: {
          scalarFields: [{ name: 'Shows', value: '1', sourceLayer: 'prefab' }],
          referenceFields: [],
        },
        resolvedReferences: [],
        evidence: { line: 12, lineText: 'm_Script: ...' },
      } as any]],
    ]),
  });
  assert.equal(
    out.resolvedByPath.get('Assets/Doors/Door.prefab')?.[0]?.serializedFields.scalarFields[0]?.name,
    'Shows',
  );
});
