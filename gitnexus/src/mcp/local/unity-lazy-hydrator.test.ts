import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateLazyBindings } from './unity-lazy-hydrator.js';

test('hydrateLazyBindings processes pending paths in bounded chunks', async () => {
  const calls: string[][] = [];
  await hydrateLazyBindings({
    pendingPaths: ['a', 'b', 'c', 'd', 'e'],
    config: { maxPendingPathsPerRequest: 4, batchSize: 2, maxHydrationMs: 5000 },
    resolveBatch: async (paths) => {
      calls.push(paths);
      return new Map();
    },
  });

  assert.deepEqual(calls, [['a', 'b'], ['c', 'd']]);
});
