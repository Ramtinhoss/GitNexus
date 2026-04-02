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
});
