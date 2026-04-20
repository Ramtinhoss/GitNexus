import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalyzeArgs, parseAnalyzeSummary } from './analyze-runner.js';

test('parseAnalyzeSummary extracts nodes/edges/time', () => {
  const sample = `
Repository indexed successfully (42.3s)
51,172 nodes | 108,578 edges | 2,545 clusters | 300 flows
`;
  const parsed = parseAnalyzeSummary(sample);
  assert.equal(parsed.totalSeconds, 42.3);
  assert.equal(parsed.nodes, 51172);
  assert.equal(parsed.edges, 108578);
});

test('buildAnalyzeArgs forwards alias and scope options', () => {
  const args = buildAnalyzeArgs('/repo/path', {
    extensions: '.cs,.ts',
    repoAlias: 'neonspark-v1-subset',
    scopeManifest: '/tmp/scope-manifest.txt',
    scopePrefix: ['Assets/NEON/Code', 'Packages/com.veewo.*'],
  });

  assert.deepEqual(args, [
    'dist/cli/index.js',
    'analyze',
    '--force',
    '--extensions',
    '.cs,.ts',
    '/repo/path',
    '--repo-alias',
    'neonspark-v1-subset',
    '--scope-manifest',
    '/tmp/scope-manifest.txt',
    '--scope-prefix',
    'Assets/NEON/Code',
    '--scope-prefix',
    'Packages/com.veewo.*',
  ]);
});

test('buildAnalyzeArgs omits --extensions when not explicitly provided', () => {
  const args = buildAnalyzeArgs('/repo/path', {
    repoAlias: 'neonspark-v1-subset',
    scopeManifest: '/tmp/scope-manifest.txt',
  } as any);

  assert.equal(args.includes('--extensions'), false);
});
