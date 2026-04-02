import { describe, expect, it } from 'vitest';
import { buildRunId, getRuleLabPaths } from './paths.js';

describe('rule-lab paths', () => {
  it('builds deterministic run/slice paths under .gitnexus/rules/lab/runs', () => {
    const runId = buildRunId({ repo: 'GitNexus', scope: 'full', seed: 'abc' });
    const p = getRuleLabPaths('/repo', runId, 'slice-a');

    expect(p.manifestPath).toContain('/.gitnexus/rules/lab/runs/');
    expect(p.candidatesPath).toContain('/slices/slice-a/candidates.jsonl');
  });
});
