import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPipelineRunOptionsForAnalyze } from './analyze.js';

test('buildPipelineRunOptionsForAnalyze passes csharp define csproj option through to pipeline', () => {
  const out = buildPipelineRunOptionsForAnalyze(
    { includeExtensions: ['.cs'], scopeRules: ['Assets/**'], csharpDefineCsproj: '/tmp/Assembly-CSharp.csproj' },
  );

  assert.deepEqual(out, {
    includeExtensions: ['.cs'],
    scopeRules: ['Assets/**'],
    csharpDefineCsproj: '/tmp/Assembly-CSharp.csproj',
  });
});

test('buildPipelineRunOptionsForAnalyze omits csharpDefineCsproj when not provided', () => {
  const out = buildPipelineRunOptionsForAnalyze(
    { includeExtensions: ['.cs'], scopeRules: ['Assets/**'] },
  );

  assert.deepEqual(out, {
    includeExtensions: ['.cs'],
    scopeRules: ['Assets/**'],
  });
  assert.equal(Object.keys(out).includes('csharpDefineCsproj'), false);
});
