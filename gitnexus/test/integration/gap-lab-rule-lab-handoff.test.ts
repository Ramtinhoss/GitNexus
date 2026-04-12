import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyzeRuleLabSlice } from '../../src/rule-lab/analyze.js';
import { buildReviewPack } from '../../src/rule-lab/review-pack.js';

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

describe('gap-lab -> rule-lab handoff', () => {
  it('keeps explicit universe -> accepted -> proposal semantics end to end', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-lab-rule-lab-e2e-'));
    const runId = 'gaplab-20260411-104710';
    const sliceId = 'event_delegate_gap.mirror_syncvar_hook';
    const ruleSlicePath = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', runId, 'slices', sliceId, 'slice.json');
    const gapSlicePath = path.join(repoRoot, '.gitnexus', 'gap-lab', 'runs', runId, 'slices', `${sliceId}.json`);
    const gapCandidatesPath = path.join(repoRoot, '.gitnexus', 'gap-lab', 'runs', runId, 'slices', `${sliceId}.candidates.jsonl`);
    const decisionsPath = path.join(repoRoot, '.gitnexus', 'gap-lab', 'runs', runId, 'decisions.jsonl');

    await writeJson(ruleSlicePath, {
      id: sliceId,
      trigger_family: 'event_delegate',
      resource_types: ['syncvar_hook'],
      host_base_type: ['network_behaviour'],
      required_hops: ['code_runtime'],
    });
    await writeJson(gapSlicePath, {
      slice_id: sliceId,
      selected_candidates: [
        { candidate_id: 'accepted-a', decision: 'accepted' },
        { candidate_id: 'accepted-b', decision: 'accepted' },
      ],
      coverage_gate: {
        user_raw_matches: 76,
        processed_user_matches: 76,
      },
      discovery_scope: { mode: 'full_user_code' },
      classification_buckets: {
        accepted: { count: 2 },
        promotion_backlog: { count: 73 },
        third_party_excluded: { count: 41 },
        unresolvable_handler_symbol: { count: 1 },
      },
      verification: {
        confirmed_chain: {
          steps: [{ hop_type: 'code_runtime', anchor: 'Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.Dead.cs:65', snippet: 'GameOverInDead()' }],
        },
      },
      default_binding_kinds: ['method_triggers_method'],
    });
    await fs.writeFile(
      gapCandidatesPath,
      `${[
        JSON.stringify({
          slice_id: sliceId,
          candidate_id: 'accepted-a',
          status: 'accepted',
          source_anchor: { file: 'Assets/Gameplay/A.cs', line: 12, symbol: 'A.Source' },
          target_anchor: { file: 'Assets/Gameplay/B.cs', line: 32, symbol: 'B.Target' },
        }),
        JSON.stringify({
          slice_id: sliceId,
          candidate_id: 'accepted-b',
          status: 'accepted',
          source_anchor: { file: 'Assets/Gameplay/C.cs', line: 14, symbol: 'C.Source' },
          target_anchor: { file: 'Assets/Gameplay/D.cs', line: 42, symbol: 'D.Target' },
        }),
        JSON.stringify({
          slice_id: sliceId,
          candidate_id: 'backlog-1',
          status: 'promotion_backlog',
          source_anchor: { file: 'Assets/Gameplay/X.cs', line: 1, symbol: 'X.Source' },
          target_anchor: { file: 'Assets/Gameplay/Y.cs', line: 2, symbol: 'Y.Target' },
        }),
      ].join('\n')}\n`,
      'utf-8',
    );
    await fs.writeFile(
      decisionsPath,
      `${JSON.stringify({
        decision_type: 'rule_aggregation_mode',
        slice_id: sliceId,
        aggregation_mode: 'per_anchor_rules',
        candidate_ids: ['accepted-a', 'accepted-b'],
      })}\n`,
      'utf-8',
    );

    const analyzed = await analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId });
    expect(analyzed.candidates).toHaveLength(2);
    expect(analyzed.candidates.every((row) => Array.isArray(row.source_gap_candidate_ids) && row.source_gap_candidate_ids.length > 0)).toBe(true);
    expect(analyzed.candidates.some((row) => /candidate-a|candidate-b/.test(String(row.title || '')))).toBe(false);

    const review = await buildReviewPack({ repoPath: repoRoot, runId, sliceId, maxTokens: 6000 });
    const reviewText = await fs.readFile(review.paths.reviewCardsPath, 'utf-8');
    const curation = JSON.parse(await fs.readFile(path.join(path.dirname(review.paths.reviewCardsPath), 'curation-input.json'), 'utf-8')) as any;

    expect(reviewText).toContain('accepted_count: 2');
    expect(reviewText).toContain('backlog_count: 73');
    expect(reviewText).toContain('source_gap_candidate_ids: accepted-a, accepted-b');
    expect(curation.curated).toHaveLength(2);
    expect(curation.curated.every((item: any) => item.confirmed_chain.steps.length > 0)).toBe(true);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });
});
