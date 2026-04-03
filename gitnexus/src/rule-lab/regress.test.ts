import { describe, expect, it } from 'vitest';
import { runRuleLabRegress } from './regress.js';

describe('rule-lab regress', () => {
  it('fails when precision or coverage is below threshold', async () => {
    const out = await runRuleLabRegress({ precision: 0.85, coverage: 0.92 });
    expect(out.pass).toBe(false);
    expect(out.failures).toContain('precision_below_threshold');
  });

  it('fails regress when probe pass-rate is below threshold even if metrics are high', async () => {
    const out = await runRuleLabRegress({
      precision: 0.95,
      coverage: 0.95,
      probes: [
        { id: 'p1', pass: false, replay_command: 'gitnexus query "Reload"' },
      ],
    });
    expect(out.pass).toBe(false);
    expect(out.failures).toContain('probe_pass_rate_below_threshold');
    expect(out.metrics.probe_pass_rate).toBeLessThan(0.85);
  });

  it('reports stage-aware metrics and three-bucket threshold checks', async () => {
    const out = await runRuleLabRegress({
      precision: 0.95,
      coverage: 0.9,
      probes: [
        {
          id: 'anchor-1',
          bucket: 'anchor',
          pass: true,
          replay_command: 'gitnexus query "anchor"',
          key_resource_hit: true,
          next_hop_usable: true,
          hint_drift: false,
          false_positive_anchor_leak: false,
        },
        {
          id: 'holdout-1',
          bucket: 'holdout',
          pass: true,
          replay_command: 'gitnexus query "holdout"',
          key_resource_hit: true,
          next_hop_usable: true,
          hint_drift: false,
          false_positive_anchor_leak: false,
        },
        {
          id: 'negative-1',
          bucket: 'negative',
          pass: true,
          replay_command: 'gitnexus query "negative"',
          key_resource_hit: false,
          next_hop_usable: false,
          hint_drift: false,
          false_positive_anchor_leak: false,
        },
      ],
    } as any);

    expect(out.metrics).toHaveProperty('key_resource_hit_rate');
    expect(out.metrics).toHaveProperty('next_hop_usability_rate');
    expect(out.metrics).toHaveProperty('hint_drift_rate');
    expect(out.bucket_metrics.anchor.anchor_pass_rate).toBe(1);
    expect(out.bucket_metrics.holdout.next_hop_usability_rate).toBe(1);
    expect(out.bucket_metrics.negative.false_positive_rate).toBe(0);
    expect(out.threshold_checks.anchor_pass).toBe(true);
    expect(out.threshold_checks.holdout_pass).toBe(true);
    expect(out.threshold_checks.negative_pass).toBe(true);
  });
});
