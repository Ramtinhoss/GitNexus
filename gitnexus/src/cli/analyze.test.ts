import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildPipelineRunOptionsForAnalyze } from './analyze.js';
import { resolveScopeManifestForAnalyze } from './sync-manifest.js';

test('analyze auto-loads .gitnexus/sync-manifest.txt when CLI scope options are omitted', async () => {
  const repoPath = path.join('/tmp', 'demo-repo');
  const expectedManifest = path.join(repoPath, '.gitnexus', 'sync-manifest.txt');

  const resolved = await resolveScopeManifestForAnalyze(
    repoPath,
    {},
    async (candidate) => candidate === expectedManifest,
  );

  assert.equal(resolved, expectedManifest);
});

test('explicit --scope-manifest still wins over auto-detected default file', async () => {
  const repoPath = path.join('/tmp', 'demo-repo');
  const explicitManifest = path.join(repoPath, 'custom-manifest.txt');

  const resolved = await resolveScopeManifestForAnalyze(
    repoPath,
    { scopeManifest: explicitManifest },
    async () => true,
  );

  assert.equal(resolved, explicitManifest);
});

test('buildPipelineRunOptionsForAnalyze passes csharp define csproj option through to pipeline', () => {
  const out = buildPipelineRunOptionsForAnalyze(
    { includeExtensions: ['.cs'], scopeRules: ['Assets/**'] },
    { csharpDefineCsproj: '/tmp/Assembly-CSharp.csproj' },
  );

  assert.deepEqual(out, {
    includeExtensions: ['.cs'],
    scopeRules: ['Assets/**'],
    csharpDefineCsproj: '/tmp/Assembly-CSharp.csproj',
  });
});
