import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyzeRuleLabSlice } from './analyze.js';
import { curateRuleLabSlice } from './curate.js';
import { promoteCuratedRules } from './promote.js';

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

describe('rule-lab analyze (exact pair flow)', () => {
  it('builds proposal candidates and curation input directly from exact_pairs', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-analyze-exact-'));
    const runId = 'run-x';
    const sliceId = 'slice-a';
    const slicePath = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', runId, 'slices', sliceId, 'slice.json');

    await writeJson(slicePath, {
      id: sliceId,
      trigger_family: 'event_delegate',
      resource_types: ['syncvar_hook'],
      host_base_type: ['network_behaviour'],
      required_hops: ['code_runtime'],
      exact_pairs: [
        {
          id: 'pair-a',
          binding_kind: 'method_triggers_method',
          source_anchor: { file: 'Assets/Gameplay/SourceA.cs', line: 12, symbol: 'SourceA.Trigger' },
          target_anchor: { file: 'Assets/Gameplay/TargetA.cs', line: 32, symbol: 'TargetA.OnTrigger' },
        },
        {
          id: 'pair-b',
          binding_kind: 'method_triggers_method',
          source_anchor: { file: 'Assets/Gameplay/SourceB.cs', line: 15, symbol: 'SourceB.Trigger' },
          target_anchor: { file: 'Assets/Gameplay/TargetB.cs', line: 36, symbol: 'TargetB.OnTrigger' },
        },
      ],
    });

    const out = await analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId });
    expect(out.candidates).toHaveLength(2);
    expect(out.candidates.every((candidate) => candidate.proposal_kind === 'per_anchor_rule')).toBe(true);
    expect(out.candidates.every((candidate) => candidate.exact_pair)).toBe(true);

    const curationPath = path.join(path.dirname(out.paths.candidatesPath), 'curation-input.json');
    const curation = JSON.parse(await fs.readFile(curationPath, 'utf-8')) as any;
    expect(curation.curated).toHaveLength(2);
    expect(curation.curated.every((item: any) => item.confirmed_chain.steps.length > 0)).toBe(true);
    expect(curation.curated.every((item: any) => Array.isArray(item.resource_bindings) && item.resource_bindings.length > 0)).toBe(true);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('fails when exact_pairs are missing', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-analyze-exact-missing-'));
    const runId = 'run-x';
    const sliceId = 'slice-a';
    const slicePath = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', runId, 'slices', sliceId, 'slice.json');
    await writeJson(slicePath, {
      id: sliceId,
      trigger_family: 'event_delegate',
      resource_types: ['syncvar_hook'],
      host_base_type: ['network_behaviour'],
      required_hops: ['code_runtime'],
    });

    await expect(analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId })).rejects.toThrow(/exact_pairs/i);
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('fails fast when exact_pairs contain duplicate non-empty ids', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-analyze-exact-dup-id-'));
    const runId = 'run-x';
    const sliceId = 'slice-a';
    const slicePath = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', runId, 'slices', sliceId, 'slice.json');
    await writeJson(slicePath, {
      id: sliceId,
      trigger_family: 'event_delegate',
      resource_types: ['syncvar_hook'],
      host_base_type: ['network_behaviour'],
      required_hops: ['code_runtime'],
      exact_pairs: [
        {
          id: 'pair-dup',
          binding_kind: 'method_triggers_method',
          source_anchor: { file: 'Assets/Gameplay/SourceA.cs', line: 12, symbol: 'SourceA.Trigger' },
          target_anchor: { file: 'Assets/Gameplay/TargetA.cs', line: 32, symbol: 'TargetA.OnTrigger' },
        },
        {
          id: 'pair-dup',
          binding_kind: 'method_triggers_method',
          source_anchor: { file: 'Assets/Gameplay/SourceB.cs', line: 15, symbol: 'SourceB.Trigger' },
          target_anchor: { file: 'Assets/Gameplay/TargetB.cs', line: 36, symbol: 'TargetB.OnTrigger' },
        },
      ],
    });

    await expect(analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId })).rejects.toThrow(/duplicate_exact_pair_id/i);
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('supports exact-pair analyze -> curate -> promote flow', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-analyze-exact-e2e-'));
    const runId = 'run-x';
    const sliceId = 'slice-a';
    const sliceDir = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', runId, 'slices', sliceId);
    const rulesRoot = path.join(repoRoot, '.gitnexus', 'rules');
    const slicePath = path.join(sliceDir, 'slice.json');

    await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
    await fs.writeFile(path.join(rulesRoot, 'catalog.json'), JSON.stringify({ version: 1, rules: [] }, null, 2), 'utf-8');
    await writeJson(slicePath, {
      id: sliceId,
      trigger_family: 'event_delegate',
      resource_types: ['syncvar_hook'],
      host_base_type: ['network_behaviour'],
      required_hops: ['code_runtime'],
      exact_pairs: [
        {
          id: 'pair-a',
          binding_kind: 'method_triggers_method',
          source_anchor: { file: 'Assets/Gameplay/SourceA.cs', line: 12, symbol: 'SourceA.Trigger' },
          target_anchor: { file: 'Assets/Gameplay/TargetA.cs', line: 32, symbol: 'TargetA.OnTrigger' },
        },
      ],
    });

    const analyzed = await analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId });
    const inputPath = path.join(path.dirname(analyzed.paths.candidatesPath), 'curation-input.json');
    await curateRuleLabSlice({ repoPath: repoRoot, runId, sliceId, inputPath });
    const promoted = await promoteCuratedRules({ repoPath: repoRoot, runId, sliceId, version: '1.0.0' });

    expect(promoted.promotedFiles).toHaveLength(1);
    await expect(fs.access(promoted.promotedFiles[0])).resolves.toBeUndefined();
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('fails closed when exact-pair symbols cannot resolve Class.Method', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-analyze-exact-unresolved-'));
    const runId = 'run-x';
    const sliceId = 'slice-a';
    const slicePath = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', runId, 'slices', sliceId, 'slice.json');

    await writeJson(slicePath, {
      id: sliceId,
      trigger_family: 'event_delegate',
      resource_types: ['syncvar_hook'],
      host_base_type: ['network_behaviour'],
      required_hops: ['code_runtime'],
      exact_pairs: [
        {
          id: 'pair-a',
          binding_kind: 'method_triggers_method',
          source_anchor: { file: 'Assets/Gameplay/SourceA.cs', line: 12, symbol: 'TriggerOnly' },
          target_anchor: { file: 'Assets/Gameplay/TargetA.cs', line: 32, symbol: 'TargetA.OnTrigger' },
        },
      ],
    });

    await expect(
      analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId }),
    ).rejects.toThrow(/binding_unresolved/i);
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('builds scene_load binding with host_class_pattern + loader_methods + scene_name', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-analyze-scene-load-shape-'));
    const runId = 'run-x';
    const sliceId = 'slice-a';
    const slicePath = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', runId, 'slices', sliceId, 'slice.json');

    await writeJson(slicePath, {
      id: sliceId,
      trigger_family: 'event_delegate',
      resource_types: ['scene'],
      host_base_type: ['network_behaviour'],
      required_hops: ['code_runtime'],
      exact_pairs: [
        {
          id: 'pair-scene',
          binding_kind: 'method_triggers_scene_load',
          source_anchor: { file: 'Assets/Gameplay/SourceA.cs', line: 12, symbol: 'SourceA.Trigger' },
          target_anchor: { file: 'Assets/Scenes/BattleScene.unity', line: 1, symbol: 'BattleScene' },
        },
      ],
    });

    const analyzed = await analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId });
    const curationPath = path.join(path.dirname(analyzed.paths.candidatesPath), 'curation-input.json');
    const curation = JSON.parse(await fs.readFile(curationPath, 'utf-8')) as any;
    const binding = curation.curated[0].resource_bindings[0];
    expect(binding.kind).toBe('method_triggers_scene_load');
    expect(binding.host_class_pattern).toBe('SourceA');
    expect(binding.loader_methods).toEqual(['Trigger']);
    expect(binding.scene_name).toBe('BattleScene');
    expect(binding.source_class_pattern).toBeUndefined();
    expect(binding.source_method).toBeUndefined();
    expect(binding.target_class_pattern).toBeUndefined();
    expect(binding.target_method).toBeUndefined();

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('fails closed for scene_load when target scene token is missing', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-analyze-scene-load-missing-scene-'));
    const runId = 'run-x';
    const sliceId = 'slice-a';
    const slicePath = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', runId, 'slices', sliceId, 'slice.json');

    await writeJson(slicePath, {
      id: sliceId,
      trigger_family: 'event_delegate',
      resource_types: ['scene'],
      host_base_type: ['network_behaviour'],
      required_hops: ['code_runtime'],
      exact_pairs: [
        {
          id: 'pair-scene',
          binding_kind: 'method_triggers_scene_load',
          source_anchor: { file: 'Assets/Gameplay/SourceA.cs', line: 12, symbol: 'SourceA.Trigger' },
          target_anchor: { file: '', line: 1, symbol: '' },
        },
      ],
    });

    await expect(
      analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId }),
    ).rejects.toThrow(/binding_unresolved/i);
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('ignores legacy parity/coverage fields when exact_pairs are valid', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-analyze-exact-legacy-'));
    const runId = 'run-x';
    const sliceId = 'slice-a';
    const slicePath = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', runId, 'slices', sliceId, 'slice.json');

    await writeJson(slicePath, {
      id: sliceId,
      trigger_family: 'event_delegate',
      resource_types: ['syncvar_hook'],
      host_base_type: ['network_behaviour'],
      required_hops: ['code_runtime'],
      exact_pairs: [
        {
          id: 'pair-a',
          binding_kind: 'method_triggers_method',
          source_anchor: { file: 'Assets/Gameplay/SourceA.cs', line: 12, symbol: 'SourceA.Trigger' },
          target_anchor: { file: 'Assets/Gameplay/TargetA.cs', line: 32, symbol: 'TargetA.OnTrigger' },
        },
      ],
      coverage_gate: {
        status: 'blocked',
        reason: 'coverage_incomplete',
        processed_user_matches: 0,
        user_raw_matches: 9,
      },
      parity_status: {
        status: 'blocked',
        reason: 'parity_missing_rules_slice',
      },
    });

    const analyzed = await analyzeRuleLabSlice({ repoPath: repoRoot, runId, sliceId });
    expect(analyzed.candidates).toHaveLength(1);
    expect(analyzed.candidates[0].exact_pair?.id).toBe('pair-a');
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('rejects placeholder run/slice ids', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-analyze-exact-placeholder-'));
    await expect(
      analyzeRuleLabSlice({ repoPath: repoRoot, runId: '<run_id>', sliceId: '<slice_id>' }),
    ).rejects.toThrow(/placeholder/i);
    await fs.rm(repoRoot, { recursive: true, force: true });
  });
});
