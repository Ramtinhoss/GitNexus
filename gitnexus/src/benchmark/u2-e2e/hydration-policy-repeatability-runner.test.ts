import assert from 'node:assert/strict';
import { buildHydrationPolicyRepeatabilityReport } from './hydration-policy-repeatability-runner.js';

const { test: rawTest } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');
const test: any = rawTest;

test('phase4 hydration policy repeatability report tracks consistency and compatibility', async () => {
  const report = await buildHydrationPolicyRepeatabilityReport({ repoAlias: 'GitNexus' });
  assert.equal(report.repeatability.fast.consistent, true);
  assert.equal(report.repeatability.balanced.consistent, true);
  assert.equal(report.repeatability.strict.consistent, true);
  assert.equal(report.contractCompatibility.needsParityRetryRetained, true);
});
