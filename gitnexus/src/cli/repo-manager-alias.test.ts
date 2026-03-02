import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readRegistry, registerRepo } from '../storage/repo-manager.js';

function makeMeta(repoPath: string, lastCommit: string) {
  return {
    repoPath,
    lastCommit,
    indexedAt: '2026-03-02T00:00:00.000Z',
    stats: { files: 10, nodes: 20, edges: 30 },
  };
}

test('registerRepo stores alias and rejects collisions on different paths', async () => {
  const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-home-'));
  const originalHome = process.env.GITNEXUS_HOME;
  process.env.GITNEXUS_HOME = tmpHome;
  try {
    const repoA = path.join(tmpHome, 'repo-a');
    const repoB = path.join(tmpHome, 'repo-b');
    await fs.mkdir(repoA, { recursive: true });
    await fs.mkdir(repoB, { recursive: true });

    await registerRepo(repoA, makeMeta(repoA, 'abc1234'), { repoAlias: 'neonspark-v1-subset' });
    const entries = await readRegistry();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, 'neonspark-v1-subset');
    assert.equal(entries[0].alias, 'neonspark-v1-subset');
    assert.equal(entries[0].sourceName, 'repo-a');

    await assert.rejects(
      registerRepo(repoB, makeMeta(repoB, 'def5678'), { repoAlias: 'neonspark-v1-subset' }),
      /already registered/i,
    );
  } finally {
    if (originalHome === undefined) {
      delete process.env.GITNEXUS_HOME;
    } else {
      process.env.GITNEXUS_HOME = originalHome;
    }
  }
});
