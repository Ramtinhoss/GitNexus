import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeRepoAlias,
  parseExtensionList,
  resolveEffectiveAnalyzeOptions,
  validateStoredOptions,
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

test('resolveEffectiveAnalyzeOptions reuses stored settings when CLI omits them', async () => {
  const resolved = await resolveEffectiveAnalyzeOptions(
    {},
    {
      includeExtensions: ['.cs'],
      scopeRules: ['Assets/NEON/Code'],
      repoAlias: 'neonspark-v1-subset',
      embeddings: true,
      aiContext: false,
    },
  );

  assert.deepEqual(resolved.includeExtensions, ['.cs']);
  assert.deepEqual(resolved.scopeRules, ['Assets/NEON/Code']);
  assert.equal(resolved.repoAlias, 'neonspark-v1-subset');
  assert.equal(resolved.embeddings, true);
  assert.equal(resolved.aiContext, false);
});

test('resolveEffectiveAnalyzeOptions disables reuse via reuseOptions=false', async () => {
  const resolved = await resolveEffectiveAnalyzeOptions(
    { reuseOptions: false },
    {
      includeExtensions: ['.cs'],
      scopeRules: ['Assets/NEON/Code'],
      repoAlias: 'neonspark-v1-subset',
      embeddings: true,
      csharpDefineCsproj: '/tmp/Assembly-CSharp.csproj',
      aiContext: false,
    },
  );

  assert.deepEqual(resolved.includeExtensions, []);
  assert.deepEqual(resolved.scopeRules, []);
  assert.equal(resolved.repoAlias, undefined);
  assert.equal(resolved.embeddings, false);
  assert.equal(resolved.csharpDefineCsproj, undefined);
  assert.equal(resolved.aiContext, true);
});

test('resolveEffectiveAnalyzeOptions prefers explicit CLI values over stored settings', async () => {
  const resolved = await resolveEffectiveAnalyzeOptions(
    {
      extensions: '.ts',
      scope: 'src/',
      repoAlias: 'new-alias',
      embeddings: false,
      aiContext: true,
    },
    {
      includeExtensions: ['.cs'],
      scopeRules: ['Assets/NEON/Code'],
      repoAlias: 'old-alias',
      embeddings: true,
      aiContext: false,
    },
  );

  assert.deepEqual(resolved.includeExtensions, ['.ts']);
  assert.deepEqual(resolved.scopeRules, ['src']);
  assert.equal(resolved.repoAlias, 'new-alias');
  assert.equal(resolved.embeddings, false);
  assert.equal(resolved.aiContext, true);
});

test('resolveEffectiveAnalyzeOptions no stored uses defaults', async () => {
  const resolved = await resolveEffectiveAnalyzeOptions({}, undefined);

  assert.deepEqual(resolved.includeExtensions, []);
  assert.deepEqual(resolved.scopeRules, []);
  assert.equal(resolved.repoAlias, undefined);
  assert.equal(resolved.embeddings, false);
  assert.equal(resolved.csharpDefineCsproj, undefined);
  assert.equal(resolved.aiContext, true);
});

test('resolveEffectiveAnalyzeOptions reuses stored scopeRules when CLI scope is omitted', async () => {
  const resolved = await resolveEffectiveAnalyzeOptions(
    { extensions: '.ts' },
    {
      scopeRules: ['Assets/', 'Packages/com.veewo.*'],
    },
  );

  assert.deepEqual(resolved.scopeRules, ['Assets/', 'Packages/com.veewo.*']);
});

test('resolveEffectiveAnalyzeOptions parses --scope comma-separated rules', async () => {
  const resolved = await resolveEffectiveAnalyzeOptions(
    { scope: 'Assets/,Packages/com.veewo.*' },
    undefined,
  );

  assert.deepEqual(resolved.scopeRules, ['Assets/', 'Packages/com.veewo.*']);
});

test('resolveEffectiveAnalyzeOptions reuses stored csharpDefineCsproj', async () => {
  const resolved = await resolveEffectiveAnalyzeOptions(
    {},
    {
      csharpDefineCsproj: '/path/to/Assembly-CSharp.csproj',
    },
  );

  assert.equal(resolved.csharpDefineCsproj, '/path/to/Assembly-CSharp.csproj');
});

test('resolveEffectiveAnalyzeOptions CLI csharpDefineCsproj overrides stored', async () => {
  const resolved = await resolveEffectiveAnalyzeOptions(
    { csharpDefineCsproj: '/new/path.csproj' },
    {
      csharpDefineCsproj: '/old/path.csproj',
    },
  );

  assert.equal(resolved.csharpDefineCsproj, '/new/path.csproj');
});

test('resolveEffectiveAnalyzeOptions reuses stored aiContext=false', async () => {
  const resolved = await resolveEffectiveAnalyzeOptions(
    {},
    {
      aiContext: false,
    },
  );

  assert.equal(resolved.aiContext, false);
});

test('resolveEffectiveAnalyzeOptions CLI aiContext=true overrides stored false', async () => {
  const resolved = await resolveEffectiveAnalyzeOptions(
    { aiContext: true },
    {
      aiContext: false,
    },
  );

  assert.equal(resolved.aiContext, true);
});

// ─── validateStoredOptions tests ────────────────────────────────────

test('validateStoredOptions returns defaults when stored is undefined', async () => {
  const result = await validateStoredOptions(undefined, '/tmp');
  assert.deepEqual(result.includeExtensions, []);
  assert.deepEqual(result.scopeRules, []);
  assert.equal(result.repoAlias, undefined);
  assert.equal(result.embeddings, false);
  assert.equal(result.csharpDefineCsproj, undefined);
  assert.equal(result.aiContext, true);
});

test('validateStoredOptions passes valid options unchanged', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-validate-'));
  const csprojPath = path.join(tmpDir, 'Assembly-CSharp.csproj');
  await fs.writeFile(csprojPath, '<Project />', 'utf-8');

  const result = await validateStoredOptions({
    includeExtensions: ['.cs', '.ts'],
    scopeRules: ['Assets/'],
    repoAlias: 'my-repo',
    csharpDefineCsproj: csprojPath,
    embeddings: true,
    aiContext: false,
  }, tmpDir);

  assert.deepEqual(result.includeExtensions, ['.cs', '.ts']);
  assert.deepEqual(result.scopeRules, ['Assets/']);
  assert.equal(result.repoAlias, 'my-repo');
  assert.equal(result.csharpDefineCsproj, csprojPath);
  assert.equal(result.embeddings, true);
  assert.equal(result.aiContext, false);
});

test('validateStoredOptions warns on invalid repoAlias and falls back', async () => {
  const result = await validateStoredOptions({
    repoAlias: 'bad alias!',
  }, '/tmp');

  assert.equal(result.repoAlias, undefined);
});

test('validateStoredOptions filters invalid extensions', async () => {
  const result = await validateStoredOptions({
    includeExtensions: ['cs', '.ts', '', '.go'],
  }, '/tmp');

  assert.deepEqual(result.includeExtensions, ['.ts', '.go']);
});

test('validateStoredOptions filters empty scopeRules', async () => {
  const result = await validateStoredOptions({
    scopeRules: ['', '  ', 'Assets/', 'Packages/com.veewo.*'],
  }, '/tmp');

  assert.deepEqual(result.scopeRules, ['Assets/', 'Packages/com.veewo.*']);
});

test('validateStoredOptions warns on missing csharpDefineCsproj file', async () => {
  const result = await validateStoredOptions({
    csharpDefineCsproj: '/nonexistent/path.csproj',
  }, '/tmp');

  assert.equal(result.csharpDefineCsproj, undefined);
});
