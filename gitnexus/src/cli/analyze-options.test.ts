import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeRepoAlias,
  parseExtensionList,
  resolveAnalyzeScopeRules,
  resolveEffectiveAnalyzeOptions,
} from './analyze-options.js';

test('parseExtensionList normalizes dot prefixes', () => {
  const exts = parseExtensionList('cs,.ts, go ');
  assert.deepEqual(exts, ['.cs', '.ts', '.go']);
});

test('normalizeRepoAlias validates format', () => {
  assert.equal(normalizeRepoAlias(undefined), undefined);
  assert.equal(normalizeRepoAlias('neonspark-v1-subset'), 'neonspark-v1-subset');
  assert.throws(() => normalizeRepoAlias('ab'), /repo alias/i);
  assert.throws(() => normalizeRepoAlias('bad alias'), /repo alias/i);
});

test('resolveAnalyzeScopeRules combines manifest and repeated prefixes', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-scope-test-'));
  const manifestPath = path.join(tmpDir, 'scope.txt');
  await fs.writeFile(manifestPath, '# comment\nAssets/NEON/Code\n\nPackages/com.veewo.*\n', 'utf-8');

  const rules = await resolveAnalyzeScopeRules({
    scopeManifest: manifestPath,
    scopePrefix: ['Packages/com.neonspark.*'],
  });

  assert.deepEqual(rules, [
    'Assets/NEON/Code',
    'Packages/com.veewo.*',
    'Packages/com.neonspark.*',
  ]);
});

test('resolveAnalyzeScopeRules fails when manifest has no usable rule', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-scope-test-'));
  const manifestPath = path.join(tmpDir, 'empty-scope.txt');
  await fs.writeFile(manifestPath, '# only comments\n\n', 'utf-8');

  await assert.rejects(
    resolveAnalyzeScopeRules({ scopeManifest: manifestPath }),
    /no valid scope rules/i,
  );
});

test('resolveEffectiveAnalyzeOptions reuses stored settings when CLI omits them', async () => {
  const resolved = await resolveEffectiveAnalyzeOptions(
    {},
    {
      includeExtensions: ['.cs'],
      scopeRules: ['Assets/NEON/Code'],
      repoAlias: 'neonspark-v1-subset',
      embeddings: true,
    },
  );

  assert.deepEqual(resolved.includeExtensions, ['.cs']);
  assert.deepEqual(resolved.scopeRules, ['Assets/NEON/Code']);
  assert.equal(resolved.repoAlias, 'neonspark-v1-subset');
  assert.equal(resolved.embeddings, true);
});

test('resolveEffectiveAnalyzeOptions disables reuse via reuseOptions=false', async () => {
  const resolved = await resolveEffectiveAnalyzeOptions(
    { reuseOptions: false },
    {
      includeExtensions: ['.cs'],
      scopeRules: ['Assets/NEON/Code'],
      repoAlias: 'neonspark-v1-subset',
      embeddings: true,
    },
  );

  assert.deepEqual(resolved.includeExtensions, []);
  assert.deepEqual(resolved.scopeRules, []);
  assert.equal(resolved.repoAlias, undefined);
  assert.equal(resolved.embeddings, false);
});

test('resolveEffectiveAnalyzeOptions prefers explicit CLI values over stored settings', async () => {
  const resolved = await resolveEffectiveAnalyzeOptions(
    {
      extensions: '.ts',
      scopePrefix: ['src'],
      repoAlias: 'new-alias',
      embeddings: false,
    },
    {
      includeExtensions: ['.cs'],
      scopeRules: ['Assets/NEON/Code'],
      repoAlias: 'old-alias',
      embeddings: true,
    },
  );

  assert.deepEqual(resolved.includeExtensions, ['.ts']);
  assert.deepEqual(resolved.scopeRules, ['src']);
  assert.equal(resolved.repoAlias, 'new-alias');
  assert.equal(resolved.embeddings, false);
});
