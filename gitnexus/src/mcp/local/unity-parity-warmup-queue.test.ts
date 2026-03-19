import test from 'node:test';
import assert from 'node:assert/strict';
import { createParityWarmupQueue } from './unity-parity-warmup-queue.js';

test('runWarmupTask respects max parallel limit', async () => {
  let running = 0;
  let maxSeen = 0;
  const queue = createParityWarmupQueue({ maxParallel: 2 });

  await Promise.all(Array.from({ length: 6 }).map(() => queue.run(async () => {
    running += 1;
    maxSeen = Math.max(maxSeen, running);
    await new Promise((resolve) => setTimeout(resolve, 20));
    running -= 1;
  })));

  assert.equal(maxSeen <= 2, true);
});
