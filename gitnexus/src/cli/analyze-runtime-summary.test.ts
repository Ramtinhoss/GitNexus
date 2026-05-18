import test from 'node:test';
import assert from 'node:assert/strict';
import { toPipelineRuntimeSummary } from './analyze-runtime-summary.js';

test('toPipelineRuntimeSummary drops graph reference and preserves reporting fields', () => {
  const out = toPipelineRuntimeSummary({
    totalFileCount: 12,
    communityResult: { stats: { totalCommunities: 3 } },
    processResult: { stats: { totalProcesses: 2 } },
    unityResult: { diagnostics: ['scanContext: scripts=1'] },
    csharpPreprocDiagnostics: {
      enabled: true,
      defineSymbolCount: 2,
      normalizedFiles: 1,
      fallbackFiles: 0,
      skippedFiles: 3,
      expressionErrors: 0,
      undefinedSymbols: [],
    },
  } as any);

  assert.equal('graph' in out, false);
  assert.equal(out.totalFileCount, 12);
  assert.equal(out.communityResult?.stats.totalCommunities, 3);
  assert.equal(out.csharpPreprocDiagnostics?.normalizedFiles, 1);
});
