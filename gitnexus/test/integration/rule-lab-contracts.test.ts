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
});
