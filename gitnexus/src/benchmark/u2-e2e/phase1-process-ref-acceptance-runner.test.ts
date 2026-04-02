import assert from 'node:assert/strict';
import { buildPhase1ProcessRefAcceptanceReport } from './phase1-process-ref-acceptance-runner.js';

const { test: rawTest } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');
const test: any = rawTest;

test('phase1 process_ref acceptance report emits readable + stable metrics', async () => {
  const report = await buildPhase1ProcessRefAcceptanceReport({
    repoAlias: 'GitNexus',
  });

  assert.equal(report.metrics.process_ref.readable_rate, 1);
  assert.equal(report.metrics.derived_id_stability_rate, 1);
});
