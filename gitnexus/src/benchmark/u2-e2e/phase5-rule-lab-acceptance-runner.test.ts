import assert from 'node:assert/strict';
import { buildPhase5RuleLabAcceptanceReport, runPhase5RuleLabGate } from './phase5-rule-lab-acceptance-runner.js';

const { test: rawTest } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');
const test: any = rawTest;

test('phase5 rule-lab acceptance runner emits complete stage coverage', async () => {
  const report = await buildPhase5RuleLabAcceptanceReport({ repoAlias: 'GitNexus' });
  assert.equal(report.stage_coverage.length, 6);
  assert.equal(typeof report.metrics.precision, 'number');
});

test('phase5 gate fails when required artifacts are missing', async () => {
  const gate = await runPhase5RuleLabGate({ reportPath: '/tmp/missing.json' });
  assert.equal(gate.pass, false);
  assert.equal(gate.reason, 'acceptance_report_missing');
});
