import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetaIndex } from './meta-index.js';

const fixtureRoot = 'src/core/unity/__fixtures__/mini-unity';

test('buildMetaIndex maps script guid to script path', async () => {
  const index = await buildMetaIndex(fixtureRoot);
  assert.equal(index.get('a6d481d58c0b4f646b7106ceaf633d6e')?.endsWith('Global.cs'), true);
});
