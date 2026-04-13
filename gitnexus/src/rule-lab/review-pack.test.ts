import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildReviewPack } from './review-pack.js';

describe('rule-lab review-pack', () => {
  it('splits cards to keep token budget <= 6000', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-review-pack-'));
    const sliceDir = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', 'run-x', 'slices', 'slice-a');
    await fs.mkdir(sliceDir, { recursive: true });

    const candidate = {
      id: 'cand-1',
      title: 'reload candidate',
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
        guarantees: ['reload_chain_closed'],
        non_guarantees: ['no_runtime_execution'],
      },
      evidence: {
        hops: [
          { hop_type: 'resource', anchor: 'Assets/Example.prefab:42', snippet: 'ReloadGraph' },
        ],
      },
    };
    const lines = Array.from({ length: 12 }).map((_, i) => JSON.stringify({ ...candidate, id: `cand-${i}` }));
    await fs.writeFile(path.join(sliceDir, 'candidates.jsonl'), `${lines.join('\n')}\n`, 'utf-8');

    const out = await buildReviewPack({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-a', maxTokens: 6000 });
    expect(out.meta.token_budget_estimate).toBeLessThanOrEqual(6000);
    expect(out.meta.truncated || out.cards.length > 0).toBe(true);
    expect(out.cards[0]).toHaveProperty('decision_inputs.required_hops');
    expect(out.cards[0]).toHaveProperty('decision_inputs.failure_map');
    expect(out.cards[0]).toHaveProperty('decision_inputs.guarantees');
    expect(out.cards[0]).toHaveProperty('decision_inputs.non_guarantees');

    const persisted = await fs.readFile(out.paths.reviewCardsPath, 'utf-8');
    expect(persisted).toContain('token_budget_estimate');

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('shows actionable guidance when candidates are missing', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-review-pack-missing-'));
    const sliceDir = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', 'run-y', 'slices', 'slice-b');
    await fs.mkdir(sliceDir, { recursive: true });

    const err = await buildReviewPack({ repoPath: repoRoot, runId: 'run-y', sliceId: 'slice-b', maxTokens: 6000 })
      .then(() => null)
      .catch((error) => error as Error);
    expect(err).toBeTruthy();
    expect(String(err?.message || '')).toMatch(/Missing candidates file for review-pack/);
    expect(String(err?.message || '')).toMatch(/rule-lab analyze --repo-path/);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('waits briefly for candidates to avoid analyze/review-pack races', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-review-pack-race-'));
    const sliceDir = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', 'run-z', 'slices', 'slice-c');
    await fs.mkdir(sliceDir, { recursive: true });
    const candidatesPath = path.join(sliceDir, 'candidates.jsonl');
    const line = JSON.stringify({
      id: 'cand-race',
      title: 'race candidate',
      topology: [{ hop: 'resource', from: { entity: 'resource' }, to: { entity: 'script' }, edge: { kind: 'binds_script' } }],
      evidence: { hops: [{ hop_type: 'resource', anchor: 'Assets/Test.prefab:1', snippet: 'Race' }] },
    });

    const delayedWrite = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        fs.writeFile(candidatesPath, `${line}\n`, 'utf-8').then(() => resolve()).catch(reject);
      }, 150);
    });

    const out = await buildReviewPack({ repoPath: repoRoot, runId: 'run-z', sliceId: 'slice-c', maxTokens: 6000 });
    await delayedWrite;
    expect(out.meta.total_candidates).toBe(1);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('renders decision inputs without lineage-only fields', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-review-pack-direct-'));
    const sliceDir = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', 'run-h', 'slices', 'slice-h');
    await fs.mkdir(sliceDir, { recursive: true });
    const rows = [
      {
        id: 'proposal-1',
        title: 'event_delegate proposal accepted-a',
        proposal_kind: 'per_anchor_rule',
        aggregation_mode: 'per_anchor_rules',
        draft_rule_id: 'unity.event.netplayer-gameover-syncvar-hook-ondeadchange.v1',
        binding_kind: 'method_triggers_method',
        topology: [{ hop: 'code_runtime', from: { entity: 'script' }, to: { entity: 'runtime' }, edge: { kind: 'calls' } }],
        evidence: { hops: [{ hop_type: 'code_runtime', anchor: 'Assets/A.cs:1', snippet: 'A' }] },
      },
      {
        id: 'proposal-2',
        title: 'event_delegate proposal accepted-b',
        proposal_kind: 'per_anchor_rule',
        aggregation_mode: 'per_anchor_rules',
        draft_rule_id: 'unity.event.mirrorbattlemgr-createnetplayer-syncvar-hook-changeroomgrid.v1',
        binding_kind: 'method_triggers_method',
        topology: [{ hop: 'code_runtime', from: { entity: 'script' }, to: { entity: 'runtime' }, edge: { kind: 'calls' } }],
        evidence: { hops: [{ hop_type: 'code_runtime', anchor: 'Assets/B.cs:2', snippet: 'B' }] },
      },
    ];
    await fs.writeFile(path.join(sliceDir, 'candidates.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf-8');

    const out = await buildReviewPack({ repoPath: repoRoot, runId: 'run-h', sliceId: 'slice-h', maxTokens: 6000 });
    const persisted = await fs.readFile(out.paths.reviewCardsPath, 'utf-8');
    expect(persisted).not.toContain('Handoff Summary');
    expect(persisted).not.toContain('source_gap_candidate_ids');
    expect(persisted).toContain('draft_rule_ids: unity.event.netplayer-gameover-syncvar-hook-ondeadchange.v1, unity.event.mirrorbattlemgr-createnetplayer-syncvar-hook-changeroomgrid.v1');

    await fs.rm(repoRoot, { recursive: true, force: true });
  });
});
