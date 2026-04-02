import assert from 'node:assert/strict';
import { buildPhase2RuntimeClaimAcceptanceReport } from './phase2-runtime-claim-acceptance-runner.js';

const { test: rawTest } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');
const test: any = rawTest;

test('phase2 runtime_claim acceptance report tracks contract + failure classification coverage', async () => {
  const report = await buildPhase2RuntimeClaimAcceptanceReport({ repoAlias: 'GitNexus' });

  assert.equal(report.claim_fields_presence.rule_id, true);
  assert.equal(report.claim_fields_presence.rule_version, true);
  assert.equal(report.coverage_pass, true);
  assert.equal(report.failure_classification_coverage.includes('rule_not_matched'), true);
  assert.equal(report.failure_classification_coverage.includes('rule_matched_but_evidence_missing'), true);
  assert.equal(report.failure_classification_coverage.includes('rule_matched_but_verification_failed'), true);
  assert.equal(report.failure_classification_coverage.includes('gate_disabled'), true);
});
