import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBenchmarkRepoName } from './runner.js';

test('resolveBenchmarkRepoName prefers explicit repo', () => {
  const resolved = resolveBenchmarkRepoName({
    repo: 'my-repo',
    repoAlias: 'alias-repo',
    targetPath: '/tmp/source',
  });
  assert.equal(resolved, 'my-repo');
});

test('resolveBenchmarkRepoName falls back to repo alias', () => {
  const resolved = resolveBenchmarkRepoName({
    repoAlias: 'neonspark-v1-subset',
    targetPath: '/tmp/source',
  });
  assert.equal(resolved, 'neonspark-v1-subset');
});

test('resolveBenchmarkRepoName uses target basename when no repo input exists', () => {
  const resolved = resolveBenchmarkRepoName({
    targetPath: '/Volumes/Shuttle/unity-projects/neonspark',
  });
  assert.equal(resolved, 'neonspark');
});
