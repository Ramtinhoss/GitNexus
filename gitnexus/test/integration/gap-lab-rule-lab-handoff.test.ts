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
  it('binding kind handoff and candidate-derived downstream handoff summary stay aligned with candidate truth', async () => {
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
        accepted: { count: 99 },
        promotion_backlog: { count: 999 },
        third_party_excluded: { count: 999 },
        unresolvable_handler_symbol: { count: 999 },
      },
      verification: {
        confirmed_chain: {
          steps: [
            { hop_type: 'code_runtime', anchor: 'Assets/Gameplay/A.cs:12', snippet: 'A.Source' },
            { hop_type: 'code_runtime', anchor: 'Assets/Gameplay/C.cs:14', snippet: 'C.Source' },
          ],
        },
      },
      default_binding_kinds: ['method_triggers_scene_load'],
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
        JSON.stringify({
          slice_id: sliceId,
          candidate_id: 'backlog-2',
          status: 'promotion_backlog',
          source_anchor: { file: 'Assets/Gameplay/X2.cs', line: 1, symbol: 'X2.Source' },
          target_anchor: { file: 'Assets/Gameplay/Y2.cs', line: 2, symbol: 'Y2.Target' },
        }),
        JSON.stringify({
          slice_id: sliceId,
          candidate_id: 'backlog-3',
          status: 'promotion_backlog',
          source_anchor: { file: 'Assets/Gameplay/X3.cs', line: 1, symbol: 'X3.Source' },
          target_anchor: { file: 'Assets/Gameplay/Y3.cs', line: 2, symbol: 'Y3.Target' },
        }),
        JSON.stringify({
          slice_id: sliceId,
          candidate_id: 'reject-1',
          status: 'third_party_excluded',
          source_anchor: { file: 'Assets/Gameplay/R1.cs', line: 1, symbol: 'R1.Source' },
          target_anchor: { file: 'Assets/Gameplay/R1T.cs', line: 2, symbol: 'R1.Target' },
        }),
        JSON.stringify({
          slice_id: sliceId,
          candidate_id: 'reject-2',
          status: 'third_party_excluded',
          source_anchor: { file: 'Assets/Gameplay/R2.cs', line: 1, symbol: 'R2.Source' },
          target_anchor: { file: 'Assets/Gameplay/R2T.cs', line: 2, symbol: 'R2.Target' },
        }),
        JSON.stringify({
          slice_id: sliceId,
          candidate_id: 'reject-3',
          status: 'third_party_excluded',
          source_anchor: { file: 'Assets/Gameplay/R3.cs', line: 1, symbol: 'R3.Source' },
          target_anchor: { file: 'Assets/Gameplay/R3T.cs', line: 2, symbol: 'R3.Target' },
        }),
        JSON.stringify({
          slice_id: sliceId,
          candidate_id: 'reject-4',
          status: 'third_party_excluded',
          source_anchor: { file: 'Assets/Gameplay/R4.cs', line: 1, symbol: 'R4.Source' },
          target_anchor: { file: 'Assets/Gameplay/R4T.cs', line: 2, symbol: 'R4.Target' },
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
    expect(analyzed.candidates[0].binding_kind).toBe('method_triggers_scene_load');
    expect(analyzed.candidates[0].binding_kind).not.toBe('method_triggers_method');
    expect(analyzed.slice.source_gap_handoff?.promotion_backlog_count).toBe(3);
    expect(analyzed.slice.source_gap_handoff?.reject_buckets.third_party_excluded).toBe(4);

    const review = await buildReviewPack({ repoPath: repoRoot, runId, sliceId, maxTokens: 6000 });
    const reviewText = await fs.readFile(review.paths.reviewCardsPath, 'utf-8');
    const curation = JSON.parse(await fs.readFile(path.join(path.dirname(review.paths.reviewCardsPath), 'curation-input.json'), 'utf-8')) as any;

    expect(reviewText).toContain('accepted_count: 2');
    expect(reviewText).toContain('backlog_count: 3');
    expect(reviewText).toContain('source_gap_candidate_ids: accepted-a, accepted-b');
    expect(curation.curated).toHaveLength(2);
    expect(curation.curated.every((item: any) => item.confirmed_chain.steps.length > 0)).toBe(true);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('aggregate preserves all accepted anchors into curation artifacts', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-lab-rule-lab-agg-'));
    const runId = 'gaplab-20260411-104710';
    const sliceId = 'event_delegate_gap.aggregate_case';
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
        user_raw_matches: 10,
        processed_user_matches: 10,
      },
      discovery_scope: { mode: 'full_user_code' },
      classification_buckets: {
        accepted: { count: 2 },
        promotion_backlog: { count: 0 },
      },
      verification: {
        confirmed_chain: {
          steps: [{ hop_type: 'code_runtime', anchor: 'Assets/Gameplay/A.cs:12', snippet: 'A.Source' }],
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
      ].join('\n')}\n`,
      'utf-8',
    );
    await fs.writeFile(
      decisionsPath,
      `${JSON.stringify({
        decision_type: 'rule_aggregation_mode',
        slice_id: sliceId,
        aggregation_mode: 'aggregate_single_rule',
        candidate_ids: ['accepted-a', 'accepted-b'],
      })}\n`,
      'utf-8',
    );

    const analyzed = await analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId });
    const curation = JSON.parse(
      await fs.readFile(path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', runId, 'slices', sliceId, 'curation-input.json'), 'utf-8'),
    ) as any;

    expect(analyzed.candidates).toHaveLength(1);
    expect(analyzed.candidates[0].source_gap_candidate_ids).toEqual(['accepted-a', 'accepted-b']);
    expect(curation.curated[0].resource_bindings).toHaveLength(2);
    expect(curation.curated[0].claims.guarantees.join(' ')).toMatch(/accepted-a/);
    expect(curation.curated[0].claims.guarantees.join(' ')).toMatch(/accepted-b/);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('preserves reject buckets by reasonCode when gap candidates use generic rejected status', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-lab-rule-lab-reasons-'));
    const runId = 'gaplab-20260411-104710';
    const sliceId = 'event_delegate_gap.reason_buckets';
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
        user_raw_matches: 6,
        processed_user_matches: 6,
      },
      discovery_scope: { mode: 'full_user_code' },
      classification_buckets: {
        accepted: { count: 2 },
        promotion_backlog: { count: 1 },
        third_party_excluded: { count: 99 },
        unresolvable_handler_symbol: { count: 99 },
      },
      verification: {
        confirmed_chain: {
          steps: [
            { hop_type: 'code_runtime', anchor: 'Assets/Gameplay/A.cs:12', snippet: 'A.Source' },
            { hop_type: 'code_runtime', anchor: 'Assets/Gameplay/C.cs:14', snippet: 'C.Source' },
          ],
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
          reasonCode: 'missing_runtime_source_anchor',
          source_anchor: { file: 'Assets/Gameplay/Backlog.cs', line: 1, symbol: 'Backlog.Source' },
          target_anchor: { file: 'Assets/Gameplay/BacklogT.cs', line: 2, symbol: 'Backlog.Target' },
        }),
        JSON.stringify({
          slice_id: sliceId,
          candidate_id: 'reject-tp-1',
          status: 'rejected',
          reasonCode: 'third_party_scope_excluded',
          source_anchor: { file: 'Assets/Gameplay/Tp1.cs', line: 1, symbol: 'Tp.One' },
          target_anchor: { file: 'Assets/Gameplay/Tp1T.cs', line: 2, symbol: 'Tp.OneT' },
        }),
        JSON.stringify({
          slice_id: sliceId,
          candidate_id: 'reject-tp-2',
          status: 'rejected',
          reasonCode: 'third_party_scope_excluded',
          source_anchor: { file: 'Assets/Gameplay/Tp2.cs', line: 1, symbol: 'Tp.Two' },
          target_anchor: { file: 'Assets/Gameplay/Tp2T.cs', line: 2, symbol: 'Tp.TwoT' },
        }),
        JSON.stringify({
          slice_id: sliceId,
          candidate_id: 'reject-handler-1',
          status: 'rejected',
          reasonCode: 'unresolvable_handler_symbol',
          source_anchor: { file: 'Assets/Gameplay/Uh1.cs', line: 1, symbol: 'Uh.One' },
          target_anchor: { file: 'Assets/Gameplay/Uh1T.cs', line: 2, symbol: 'Uh.OneT' },
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
    const review = await buildReviewPack({ repoPath: repoRoot, runId, sliceId, maxTokens: 6000 });
    const reviewText = await fs.readFile(review.paths.reviewCardsPath, 'utf-8');

    expect(analyzed.slice.source_gap_handoff?.promotion_backlog_count).toBe(1);
    expect(analyzed.slice.source_gap_handoff?.reject_buckets).toEqual({
      third_party_scope_excluded: 2,
      unresolvable_handler_symbol: 1,
    });
    expect(reviewText).toContain('reject_buckets: {"third_party_scope_excluded":2,"unresolvable_handler_symbol":1}');

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('proposal-specific confirmed chain and review semantics remain non-empty and proposal-scoped', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-lab-rule-lab-proposal-'));
    const runId = 'gaplab-20260411-104710';
    const sliceId = 'event_delegate_gap.proposal_specific';
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
      coverage_gate: { user_raw_matches: 2, processed_user_matches: 2 },
      discovery_scope: { mode: 'full_user_code' },
      classification_buckets: { accepted: { count: 2 }, promotion_backlog: { count: 0 } },
      verification: {
        confirmed_chain: {
          steps: [
            { hop_type: 'code_runtime', anchor: 'Assets/Gameplay/A.cs:12', snippet: 'A.Source' },
            { hop_type: 'code_runtime', anchor: 'Assets/Gameplay/C.cs:14', snippet: 'C.Source' },
          ],
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

    await analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId });
    const curation = JSON.parse(
      await fs.readFile(path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', runId, 'slices', sliceId, 'curation-input.json'), 'utf-8'),
    ) as any;
    const review = await buildReviewPack({ repoPath: repoRoot, runId, sliceId, maxTokens: 6000 });
    const reviewText = await fs.readFile(review.paths.reviewCardsPath, 'utf-8');

    expect(curation.curated).toHaveLength(2);
    expect(curation.curated[0].confirmed_chain.steps).not.toEqual(curation.curated[1].confirmed_chain.steps);
    expect(reviewText).toMatch(/guarantees: .*accepted-a/);
    expect(reviewText).toMatch(/non_guarantees: .*backlog/);
    expect(reviewText).toMatch(/failure_map: .*rule_matched_but_evidence_missing/);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('rejects unknown binding fallback when accepted anchors cannot resolve class/method symbols', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-lab-rule-lab-unresolved-'));
    const runId = 'gaplab-20260411-104710';
    const sliceId = 'event_delegate_gap.unresolved_binding';
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
      ],
      coverage_gate: { user_raw_matches: 1, processed_user_matches: 1 },
      discovery_scope: { mode: 'full_user_code' },
      classification_buckets: { accepted: { count: 1 }, promotion_backlog: { count: 0 } },
      verification: {
        confirmed_chain: {
          steps: [{ hop_type: 'code_runtime', anchor: 'Assets/Gameplay/A.cs:12', snippet: 'A' }],
        },
      },
      default_binding_kinds: ['method_triggers_method'],
    });
    await fs.writeFile(
      gapCandidatesPath,
      `${JSON.stringify({
        slice_id: sliceId,
        candidate_id: 'accepted-a',
        status: 'accepted',
        source_anchor: { file: 'Assets/Gameplay/A.cs', line: 12, symbol: 'TriggerOnly' },
        target_anchor: { file: 'Assets/Gameplay/B.cs', line: 20, symbol: 'OnTargetOnly' },
      })}\n`,
      'utf-8',
    );
    await fs.writeFile(
      decisionsPath,
      `${JSON.stringify({
        decision_type: 'rule_aggregation_mode',
        slice_id: sliceId,
        aggregation_mode: 'per_anchor_rules',
        candidate_ids: ['accepted-a'],
      })}\n`,
      'utf-8',
    );

    await expect(
      analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId }),
    ).rejects.toThrow(/binding_unresolved|UnknownClass|UnknownMethod/i);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });
});
