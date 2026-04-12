import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRuleLabSlice } from './analyze.js';

interface SetupOptions {
  runId?: string;
  sliceId?: string;
  aggregationMode?: 'per_anchor_rules' | 'aggregate_single_rule';
  includeGapHandoff?: boolean;
  acceptedCandidateRows?: Array<Record<string, unknown>>;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

async function setupGapToRuleFixture(options: SetupOptions = {}): Promise<{
  repoRoot: string;
  runId: string;
  sliceId: string;
}> {
  const runId = options.runId || 'run-x';
  const sliceId = options.sliceId || 'slice-a';
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-analyze-'));
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

  if (options.includeGapHandoff !== false) {
    await writeJson(gapSlicePath, {
      slice_id: sliceId,
      gap_type: 'event_delegate_gap',
      gap_subtype: 'mirror_syncvar_hook',
      discovery_scope: { mode: 'full_user_code' },
      coverage_gate: {
        user_raw_matches: 76,
        processed_user_matches: 76,
      },
      selected_candidates: [
        { candidate_id: 'accepted-a', decision: 'accepted', confidence: 0.91 },
        { candidate_id: 'accepted-b', decision: 'accepted', confidence: 0.88 },
      ],
      classification_buckets: {
        accepted: { count: 2 },
        promotion_backlog: { count: 73 },
        third_party_excluded: { count: 41 },
        unresolvable_handler_symbol: { count: 1 },
      },
      verification: {
        confirmed_chain: {
          steps: [
            {
              hop_type: 'code_runtime',
              anchor: 'Assets/Gameplay/Bootstrap.cs:42',
              snippet: 'OnInit()',
            },
          ],
        },
      },
    });

    const rows = options.acceptedCandidateRows || [
      {
        candidate_id: 'accepted-a',
        status: 'accepted',
        source_anchor: {
          file: 'Assets/Gameplay/SourceA.cs',
          line: 12,
          symbol: 'SourceA.Trigger',
          symbol_id: 'Method:Assets/Gameplay/SourceA.cs:Trigger',
        },
        target_anchor: {
          file: 'Assets/Gameplay/TargetA.cs',
          line: 35,
          symbol: 'TargetA.OnTrigger',
          symbol_id: 'Method:Assets/Gameplay/TargetA.cs:OnTrigger',
        },
      },
      {
        candidate_id: 'accepted-b',
        status: 'accepted',
        source_anchor: {
          file: 'Assets/Gameplay/SourceB.cs',
          line: 16,
          symbol: 'SourceB.Trigger',
          symbol_id: 'Method:Assets/Gameplay/SourceB.cs:Trigger',
        },
        target_anchor: {
          file: 'Assets/Gameplay/TargetB.cs',
          line: 41,
          symbol: 'TargetB.OnTrigger',
          symbol_id: 'Method:Assets/Gameplay/TargetB.cs:OnTrigger',
        },
      },
    ];
    await fs.writeFile(
      gapCandidatesPath,
      `${rows.map((row) => JSON.stringify({ slice_id: sliceId, ...row })).join('\n')}\n`,
      'utf-8',
    );

    await fs.writeFile(
      decisionsPath,
      `${JSON.stringify({
        decision_type: 'rule_aggregation_mode',
        slice_id: sliceId,
        aggregation_mode: options.aggregationMode || 'per_anchor_rules',
        candidate_ids: ['accepted-a', 'accepted-b'],
      })}\n`,
      'utf-8',
    );
  }

  return { repoRoot, runId, sliceId };
}

describe('rule-lab analyze', () => {
  it('analyze emits multiple topology candidates with coverage/conflict stats', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-analyze-'));
    const runRoot = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', 'run-x');
    const sliceDir = path.join(runRoot, 'slices', 'slice-a');
    await fs.mkdir(sliceDir, { recursive: true });
    const here = path.dirname(fileURLToPath(import.meta.url));
    const fixturePath = path.join(here, '__fixtures__', 'rule-lab-slice-input.json');
    const fixtureRaw = await fs.readFile(fixturePath, 'utf-8');
    await fs.writeFile(path.join(sliceDir, 'slice.json'), fixtureRaw, 'utf-8');

    const result = await analyzeRuleLabSlice({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-a' });
    expect(result.candidates.length).toBeGreaterThan(1);
    expect(result.candidates[0]).toHaveProperty('topology');
    expect(result.candidates[0]).toHaveProperty('stats.coverage_rate');
    expect(result.candidates[0]).toHaveProperty('stats.conflict_rate');
    expect(result.candidates[0]).toHaveProperty('counter_examples');
    expect(result.candidates[0].evidence.hops[0].anchor).toMatch(/:\d+$/);

    const persisted = await fs.readFile(result.paths.candidatesPath, 'utf-8');
    expect(persisted.trim().length).toBeGreaterThan(0);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('gap-lab handoff emits per-anchor proposals with explicit accepted lineage', async () => {
    const { repoRoot, runId, sliceId } = await setupGapToRuleFixture({
      aggregationMode: 'per_anchor_rules',
    });
    const result = await analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId });
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toHaveProperty('proposal_kind', 'per_anchor_rule');
    expect(result.candidates[0]).toHaveProperty('source_gap_candidate_ids');
    expect(result.candidates[0]).toHaveProperty('draft_rule_id');
    expect(result.slice.source_gap_handoff.accepted_candidate_ids).toEqual([
      'accepted-a',
      'accepted-b',
    ]);
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('aggregate_single_rule merges accepted anchors into one proposal lineage row', async () => {
    const { repoRoot, runId, sliceId } = await setupGapToRuleFixture({
      aggregationMode: 'aggregate_single_rule',
    });
    const result = await analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toHaveProperty('proposal_kind', 'aggregate_rule');
    expect(result.candidates[0].source_gap_candidate_ids).toEqual(['accepted-a', 'accepted-b']);
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('accepted lineage path never emits generic candidate-a/candidate-b fallback rows', async () => {
    const { repoRoot, runId, sliceId } = await setupGapToRuleFixture({
      aggregationMode: 'per_anchor_rules',
    });
    const result = await analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId });
    const hasGenericFallback = result.candidates.some((candidate) =>
      /candidate-a|candidate-b/.test(String(candidate.title || ''))
      || /\.primary$|\.fallback$/.test(String(candidate.rule_hint || '')),
    );
    expect(hasGenericFallback).toBe(false);
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('rejects placeholder run/slice ids and placeholder source anchor paths in handoff', async () => {
    const first = await setupGapToRuleFixture({
      runId: '<run_id>',
      sliceId: '<slice_id>',
      aggregationMode: 'per_anchor_rules',
    });
    await expect(
      analyzeRuleLabSlice({ repoPath: first.repoRoot, runId: first.runId, sliceId: first.sliceId }),
    ).rejects.toThrow(/placeholder/i);
    await fs.rm(first.repoRoot, { recursive: true, force: true });

    const second = await setupGapToRuleFixture({
      acceptedCandidateRows: [
        {
          candidate_id: 'accepted-a',
          status: 'accepted',
          source_anchor: {
            file: '<source_anchor_path>',
            line: 10,
            symbol: 'Source.Trigger',
            symbol_id: 'Method:Assets/Source.cs:Trigger',
          },
          target_anchor: {
            file: 'Assets/Target.cs',
            line: 14,
            symbol: 'Target.OnTrigger',
            symbol_id: 'Method:Assets/Target.cs:OnTrigger',
          },
        },
      ],
    });
    await expect(
      analyzeRuleLabSlice({ repoPath: second.repoRoot, runId: second.runId, sliceId: second.sliceId }),
    ).rejects.toThrow(/placeholder/i);
    await fs.rm(second.repoRoot, { recursive: true, force: true });
  });
});
