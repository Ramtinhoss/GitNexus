import { describe, expect, it } from 'vitest';
import { runRuleLabRegress } from './regress.js';

describe('rule-lab regress', () => {
  it('fails when precision or coverage is below threshold', async () => {
    const out = await runRuleLabRegress({ precision: 0.85, coverage: 0.92 });
    expect(out.pass).toBe(false);
    expect(out.failures).toContain('precision_below_threshold');
  });
});
