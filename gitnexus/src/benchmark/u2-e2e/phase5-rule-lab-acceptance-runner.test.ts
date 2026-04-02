import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

test('phase5 gate fails when anti-hardcode scan or dsl lint fails', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'phase5-gate-'));
  const reportPath = path.join(tmpDir, 'report.json');
  await fs.writeFile(
    reportPath,
    JSON.stringify({
      stage_coverage: [
        { stage: 'discover', status: 'passed' },
        { stage: 'analyze', status: 'passed' },
        { stage: 'review-pack', status: 'passed' },
        { stage: 'curate', status: 'passed' },
        { stage: 'promote', status: 'passed' },
        { stage: 'regress', status: 'passed' },
      ],
      metrics: { precision: 0.93, coverage: 0.9, probe_pass_rate: 0.9 },
      authenticity_checks: {
        static_no_hardcoded_reload: { pass: false },
        dsl_lint_pass: false,
      },
    }),
    'utf-8',
  );
  const gate = await runPhase5RuleLabGate({ reportPath });
  assert.equal(gate.pass, false);
  assert.ok(['static_hardcode_detected', 'dsl_lint_failed'].includes(String(gate.reason)));
  await fs.rm(tmpDir, { recursive: true, force: true });
});
