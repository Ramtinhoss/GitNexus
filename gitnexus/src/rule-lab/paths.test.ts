import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRunId, getRuleLabPaths } from './paths.js';

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname);

describe('rule-lab paths', () => {
  it('builds deterministic run/slice paths under .gitnexus/rules/lab/runs', () => {
    const runId = buildRunId({ repo: 'GitNexus', scope: 'full', seed: 'abc' });
    const p = getRuleLabPaths('/repo', runId, 'slice-a');

    expect(p.manifestPath).toContain('/.gitnexus/rules/lab/runs/');
    expect(p.candidatesPath).toContain('/slices/slice-a/candidates.jsonl');
  });

  it('exposes DSL v2 topology and closure schema fields', async () => {
    const sample = {
      id: 'demo.reload.v2',
      match: { trigger_tokens: ['reload'] },
      topology: [
        {
          hop: 'resource',
          from: { entity: 'resource' },
          to: { entity: 'script' },
          edge: { kind: 'binds_script' },
        },
      ],
      closure: {
        required_hops: ['resource'],
        failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' },
      },
      claims: {
        guarantees: ['g1'],
        non_guarantees: ['ng1'],
        next_action: 'gitnexus query "Reload"',
      },
    };
    expect(sample.topology[0].edge.kind).toBe('binds_script');

    const ruleDslSchema = JSON.parse(
      await fs.readFile(path.join(TEST_DIR, 'schema', 'rule-dsl.schema.json'), 'utf-8'),
    ) as { properties?: Record<string, unknown> };
    const draftSchema = JSON.parse(
      await fs.readFile(path.join(TEST_DIR, 'schema', 'dsl-draft.schema.json'), 'utf-8'),
    ) as { properties?: Record<string, unknown> };

    expect(ruleDslSchema.properties).toHaveProperty('match');
    expect(ruleDslSchema.properties).toHaveProperty('topology');
    expect(ruleDslSchema.properties).toHaveProperty('closure');
    expect(ruleDslSchema.properties).toHaveProperty('claims');
    expect(draftSchema.properties).toHaveProperty('topology');
    expect(draftSchema.properties).toHaveProperty('closure');
    expect(draftSchema.properties).toHaveProperty('claims');
  });
});
