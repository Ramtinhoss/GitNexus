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
  defaultBindingKinds?: string[];
  classificationBuckets?: Record<string, unknown>;
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
      classification_buckets: options.classificationBuckets || {
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
      default_binding_kinds: options.defaultBindingKinds || ['method_triggers_method'],
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
      `${rows.map((row) => JSON.stringify({
        slice_id: sliceId,
        gap_type: 'event_delegate_gap',
        gap_subtype: 'mirror_syncvar_hook',
        pattern_id: 'event_delegate.mirror_syncvar_hook.v1',
        detector_version: '1.0.0',
        ...row,
      })).join('\n')}\n`,
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

  it('binding kind handoff + candidate-derived downstream handoff summary ignore stale classification buckets', async () => {
    const { repoRoot, runId, sliceId } = await setupGapToRuleFixture({
      aggregationMode: 'per_anchor_rules',
      defaultBindingKinds: ['method_triggers_scene_load'],
      classificationBuckets: {
        accepted: { count: 99 },
        promotion_backlog: { count: 999 },
        third_party_excluded: { count: 999 },
      },
      acceptedCandidateRows: [
        {
          candidate_id: 'accepted-a',
          status: 'accepted',
          binding_kind: 'method_triggers_scene_load',
          source_anchor: {
            file: 'Assets/Gameplay/SceneBoot.cs',
            line: 12,
            symbol: 'SceneBoot.Load',
          },
          target_anchor: {
            file: 'Assets/Gameplay/SceneDriver.cs',
            line: 18,
            symbol: 'SceneDriver.Activate',
          },
        },
        {
          candidate_id: 'accepted-b',
          status: 'accepted',
          binding_kind: 'method_triggers_scene_load',
          source_anchor: {
            file: 'Assets/Gameplay/SceneBoot2.cs',
            line: 22,
            symbol: 'SceneBoot2.Load',
          },
          target_anchor: {
            file: 'Assets/Gameplay/SceneDriver2.cs',
            line: 30,
            symbol: 'SceneDriver2.Activate',
          },
        },
        {
          candidate_id: 'backlog-1',
          status: 'promotion_backlog',
          source_anchor: { file: 'Assets/Gameplay/Backlog1.cs', line: 1, symbol: 'Backlog.One' },
          target_anchor: { file: 'Assets/Gameplay/Backlog1T.cs', line: 2, symbol: 'Backlog.OneT' },
        },
        {
          candidate_id: 'backlog-2',
          status: 'promotion_backlog',
          source_anchor: { file: 'Assets/Gameplay/Backlog2.cs', line: 1, symbol: 'Backlog.Two' },
          target_anchor: { file: 'Assets/Gameplay/Backlog2T.cs', line: 2, symbol: 'Backlog.TwoT' },
        },
        {
          candidate_id: 'backlog-3',
          status: 'promotion_backlog',
          source_anchor: { file: 'Assets/Gameplay/Backlog3.cs', line: 1, symbol: 'Backlog.Three' },
          target_anchor: { file: 'Assets/Gameplay/Backlog3T.cs', line: 2, symbol: 'Backlog.ThreeT' },
        },
        {
          candidate_id: 'reject-third-party-1',
          status: 'third_party_excluded',
          source_anchor: { file: 'Assets/Gameplay/Tp1.cs', line: 1, symbol: 'Tp.One' },
          target_anchor: { file: 'Assets/Gameplay/Tp1T.cs', line: 2, symbol: 'Tp.OneT' },
        },
        {
          candidate_id: 'reject-third-party-2',
          status: 'third_party_excluded',
          source_anchor: { file: 'Assets/Gameplay/Tp2.cs', line: 1, symbol: 'Tp.Two' },
          target_anchor: { file: 'Assets/Gameplay/Tp2T.cs', line: 2, symbol: 'Tp.TwoT' },
        },
        {
          candidate_id: 'reject-third-party-3',
          status: 'third_party_excluded',
          source_anchor: { file: 'Assets/Gameplay/Tp3.cs', line: 1, symbol: 'Tp.Three' },
          target_anchor: { file: 'Assets/Gameplay/Tp3T.cs', line: 2, symbol: 'Tp.ThreeT' },
        },
        {
          candidate_id: 'reject-third-party-4',
          status: 'third_party_excluded',
          source_anchor: { file: 'Assets/Gameplay/Tp4.cs', line: 1, symbol: 'Tp.Four' },
          target_anchor: { file: 'Assets/Gameplay/Tp4T.cs', line: 2, symbol: 'Tp.FourT' },
        },
      ],
    });
    const result = await analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId });
    expect(result.candidates[0].binding_kind).toBe('method_triggers_scene_load');
    expect(result.candidates[0].binding_kind).not.toBe('method_triggers_method');
    expect(result.slice.source_gap_handoff.promotion_backlog_count).toBe(3);
    expect(result.slice.source_gap_handoff.reject_buckets.third_party_excluded).toBe(4);
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('fails early when gap-handoff candidate taxonomy is missing', async () => {
    const { repoRoot, runId, sliceId } = await setupGapToRuleFixture({
      acceptedCandidateRows: [
        {
          candidate_id: 'accepted-a',
          gap_type: undefined,
          status: 'accepted',
          source_anchor: {
            file: 'Assets/Gameplay/SourceA.cs',
            line: 12,
            symbol: 'SourceA.Trigger',
          },
          target_anchor: {
            file: 'Assets/Gameplay/TargetA.cs',
            line: 35,
            symbol: 'TargetA.OnTrigger',
          },
        },
      ],
    });

    await expect(analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId })).rejects.toThrow(
      /gap-handoff schema error: candidate accepted-a missing gap_type/i,
    );
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('reject bucket summary keys rejected rows by reasonCode instead of generic rejected status', async () => {
    const { repoRoot, runId, sliceId } = await setupGapToRuleFixture({
      acceptedCandidateRows: [
        {
          candidate_id: 'accepted-a',
          status: 'accepted',
          source_anchor: {
            file: 'Assets/Gameplay/SourceA.cs',
            line: 12,
            symbol: 'SourceA.Trigger',
          },
          target_anchor: {
            file: 'Assets/Gameplay/TargetA.cs',
            line: 35,
            symbol: 'TargetA.OnTrigger',
          },
        },
        {
          candidate_id: 'accepted-b',
          status: 'accepted',
          source_anchor: {
            file: 'Assets/Gameplay/SourceB.cs',
            line: 16,
            symbol: 'SourceB.Trigger',
          },
          target_anchor: {
            file: 'Assets/Gameplay/TargetB.cs',
            line: 41,
            symbol: 'TargetB.OnTrigger',
          },
        },
        {
          candidate_id: 'backlog-1',
          status: 'promotion_backlog',
          reasonCode: 'missing_runtime_source_anchor',
          source_anchor: { file: 'Assets/Gameplay/Backlog1.cs', line: 1, symbol: 'Backlog.One' },
          target_anchor: { file: 'Assets/Gameplay/Backlog1T.cs', line: 2, symbol: 'Backlog.OneT' },
        },
        {
          candidate_id: 'reject-third-party-1',
          status: 'rejected',
          reasonCode: 'third_party_scope_excluded',
          source_anchor: { file: 'Assets/Gameplay/Tp1.cs', line: 1, symbol: 'Tp.One' },
          target_anchor: { file: 'Assets/Gameplay/Tp1T.cs', line: 2, symbol: 'Tp.OneT' },
        },
        {
          candidate_id: 'reject-third-party-2',
          status: 'rejected',
          reasonCode: 'third_party_scope_excluded',
          source_anchor: { file: 'Assets/Gameplay/Tp2.cs', line: 1, symbol: 'Tp.Two' },
          target_anchor: { file: 'Assets/Gameplay/Tp2T.cs', line: 2, symbol: 'Tp.TwoT' },
        },
        {
          candidate_id: 'reject-handler-1',
          status: 'rejected',
          reasonCode: 'unresolvable_handler_symbol',
          source_anchor: { file: 'Assets/Gameplay/Uh1.cs', line: 1, symbol: 'Uh.One' },
          target_anchor: { file: 'Assets/Gameplay/Uh1T.cs', line: 2, symbol: 'Uh.OneT' },
        },
      ],
    });

    const result = await analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId });

    expect(result.slice.source_gap_handoff.promotion_backlog_count).toBe(1);
    expect(result.slice.source_gap_handoff.reject_buckets).toEqual({
      third_party_scope_excluded: 2,
      unresolvable_handler_symbol: 1,
    });

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

  it('persists source_gap_handoff and generates curation input derived from proposal candidates', async () => {
    const { repoRoot, runId, sliceId } = await setupGapToRuleFixture({
      aggregationMode: 'per_anchor_rules',
    });
    const result = await analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId });
    const slicePath = path.join(
      repoRoot,
      '.gitnexus',
      'rules',
      'lab',
      'runs',
      runId,
      'slices',
      sliceId,
      'slice.json',
    );
    const curationPath = path.join(
      repoRoot,
      '.gitnexus',
      'rules',
      'lab',
      'runs',
      runId,
      'slices',
      sliceId,
      'curation-input.json',
    );
    const slice = JSON.parse(await fs.readFile(slicePath, 'utf-8')) as any;
    const curation = JSON.parse(await fs.readFile(curationPath, 'utf-8')) as any;

    expect(slice.source_gap_handoff.promotion_backlog_count).toBe(73);
    expect(curation.curated).toHaveLength(result.candidates.length);
    expect(curation.curated.every((item: any) => /^unity\.event\..+\.v1$/.test(item.rule_id))).toBe(true);
    expect(curation.curated.every((item: any) => item.confirmed_chain.steps.length > 0)).toBe(true);
    expect(curation.curated.every((item: any) =>
      Array.isArray(item.resource_bindings) && item.resource_bindings.length > 0,
    )).toBe(true);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });
});
