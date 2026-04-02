import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

describe('rule-lab docs/contracts', () => {
  it('docs and contract tests reflect rule-lab ownership and lifecycle artifacts', async () => {
    const cfg = await fs.readFile('docs/gitnexus-config-files.md', 'utf-8');
    expect(cfg).toMatch(/rule-lab-discover/);
    expect(cfg).toMatch(/rules\/lab\/runs/);

    const truth = await fs.readFile('docs/unity-runtime-process-source-of-truth.md', 'utf-8');
    expect(truth).toMatch(/Phase 5 Offline Rule Lab/i);
    expect(truth).toMatch(/rule_lab_discover|rule_lab_promote/i);
  });

  it('phase5 runner enforces semantic authenticity gate contract', async () => {
    const runner = await fs.readFile('gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts', 'utf-8');
    expect(runner).toMatch(/static_hardcode_detected/);
    expect(runner).toMatch(/dsl_lint_failed/);
    expect(runner).toMatch(/probe_pass_rate_below_threshold/);
  });
});
