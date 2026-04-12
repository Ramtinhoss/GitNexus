import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { curateRuleLabSlice } from '../../src/rule-lab/curate.js';
import { promoteCuratedRules } from '../../src/rule-lab/promote.js';

describe('rule-lab fail-closed binding guards', () => {
  it('curate rejects unknown binding fallback placeholders', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-curate-bindings-'));
    const runId = 'run-x';
    const sliceId = 'slice-a';
    const sliceDir = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', runId, 'slices', sliceId);
    await fs.mkdir(sliceDir, { recursive: true });
    const inputPath = path.join(sliceDir, 'curation-input.json');
    await fs.writeFile(inputPath, JSON.stringify({
      run_id: runId,
      slice_id: sliceId,
      curated: [{
        id: 'cand-1',
        rule_id: 'unity.event.demo.v1',
        title: 'demo',
        match: { trigger_tokens: ['event_delegate'] },
        topology: [{ hop: 'code_runtime', from: { entity: 'script' }, to: { entity: 'runtime' }, edge: { kind: 'calls' } }],
        closure: {
          required_hops: ['code_runtime'],
          failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' },
        },
        claims: {
          guarantees: ['accepted source ids: accepted-a'],
          non_guarantees: ['backlog candidates are not promoted (0)'],
          next_action: 'gitnexus query "event_delegate"',
        },
        confirmed_chain: {
          steps: [{ hop_type: 'code_runtime', anchor: 'Assets/Gameplay/A.cs:12', snippet: 'A.Source' }],
        },
        guarantees: ['accepted source ids: accepted-a'],
        non_guarantees: ['backlog candidates are not promoted (0)'],
        resource_bindings: [{
          kind: 'method_triggers_method',
          source_class_pattern: 'UnknownClass',
          source_method: 'UnknownMethod',
          target_class_pattern: 'Target',
          target_method: 'OnTarget',
        }],
      }],
    }, null, 2), 'utf-8');

    await expect(
      curateRuleLabSlice({ repoPath: repoRoot, runId, sliceId, inputPath }),
    ).rejects.toThrow(/UnknownClass|UnknownMethod|binding unresolved|binding_unresolved/i);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('promote rejects curated artifacts containing unknown binding fallback placeholders', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-promote-bindings-'));
    const runId = 'run-x';
    const sliceId = 'slice-a';
    const rulesRoot = path.join(repoRoot, '.gitnexus', 'rules');
    const sliceDir = path.join(rulesRoot, 'lab', 'runs', runId, 'slices', sliceId);
    await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
    await fs.mkdir(sliceDir, { recursive: true });
    await fs.writeFile(path.join(rulesRoot, 'catalog.json'), JSON.stringify({ version: 1, rules: [] }, null, 2), 'utf-8');
    await fs.writeFile(path.join(sliceDir, 'curated.json'), JSON.stringify({
      run_id: runId,
      slice_id: sliceId,
      curated: [{
        id: 'cand-1',
        rule_id: 'unity.event.demo.v1',
        title: 'demo',
        match: {
          trigger_tokens: ['event_delegate'],
          resource_types: ['syncvar_hook'],
          host_base_type: ['network_behaviour'],
        },
        topology: [{ hop: 'code_runtime', from: { entity: 'script' }, to: { entity: 'runtime' }, edge: { kind: 'calls' } }],
        closure: {
          required_hops: ['code_runtime'],
          failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' },
        },
        claims: {
          guarantees: ['accepted source ids: accepted-a'],
          non_guarantees: ['backlog candidates are not promoted (0)'],
          next_action: 'gitnexus query "event_delegate"',
        },
        confirmed_chain: {
          steps: [{ hop_type: 'code_runtime', anchor: 'Assets/Gameplay/A.cs:12', snippet: 'A.Source' }],
        },
        guarantees: ['accepted source ids: accepted-a'],
        non_guarantees: ['backlog candidates are not promoted (0)'],
        resource_bindings: [{
          kind: 'method_triggers_method',
          source_class_pattern: 'UnknownClass',
          source_method: 'Fire',
          target_class_pattern: 'Target',
          target_method: 'OnTarget',
        }],
      }],
    }, null, 2), 'utf-8');

    await expect(
      promoteCuratedRules({ repoPath: repoRoot, runId, sliceId, version: '1.0.0' }),
    ).rejects.toThrow(/UnknownClass|UnknownMethod|binding unresolved|binding_unresolved/i);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });
});
