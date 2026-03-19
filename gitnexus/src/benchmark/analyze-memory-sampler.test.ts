import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalyzeMemoryReport } from './analyze-memory-sampler.js';

test('buildAnalyzeMemoryReport summarizes analyze and query measurements', () => {
  const report = buildAnalyzeMemoryReport({
    analyze: { realSec: 10, maxRssBytes: 1024, phases: { pipelineSec: 3, kuzuSec: 5, ftsSec: 1 } },
    queryCold: { realSec: 2, maxRssBytes: 512, resourceBindings: 4, unityDiagnostics: [] },
    queryWarm: { realSec: 1, maxRssBytes: 256, resourceBindings: 4, unityDiagnostics: [] },
  });
  assert.equal(report.summary.analyzeRealSec, 10);
  assert.equal(report.summary.coldResourceBindings, 4);
});
