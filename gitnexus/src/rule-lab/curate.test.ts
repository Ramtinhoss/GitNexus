import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { curateRuleLabSlice } from './curate.js';

describe('rule-lab curate', () => {
  it('rejects curation input with empty confirmed_chain.steps', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-curate-'));
    const inputPath = path.join(repoRoot, 'curation-input.json');

    await fs.writeFile(
      inputPath,
      JSON.stringify({
        run_id: 'run-x',
        slice_id: 'slice-a',
        curated: [
          {
            id: 'candidate-1',
            title: 'reload rule',
            match: { trigger_tokens: ['reload'] },
            topology: [
              { hop: 'resource', from: { entity: 'resource' }, to: { entity: 'script' }, edge: { kind: 'binds_script' } },
            ],
            closure: {
              required_hops: ['resource'],
              failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' },
            },
            claims: {
              guarantees: ['reload_chain_closed'],
              non_guarantees: ['no_runtime_execution'],
              next_action: 'gitnexus query "Reload"',
            },
            confirmed_chain: { steps: [] },
            guarantees: ['can verify reload trigger'],
            non_guarantees: ['does not prove runtime ordering'],
          },
        ],
      }),
      'utf-8',
    );

    await expect(
      curateRuleLabSlice({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-a', inputPath }),
    ).rejects.toThrow(/confirmed_chain\.steps/i);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('writes dsl-draft.json and rejects missing failure mapping', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-curate-'));
    const inputPath = path.join(repoRoot, 'curation-input.json');

    await fs.writeFile(
      inputPath,
      JSON.stringify({
        run_id: 'run-x',
        slice_id: 'slice-a',
        curated: [
          {
            id: 'candidate-1',
            rule_id: 'demo.reload.v2',
            match: { trigger_tokens: ['reload'] },
            topology: [
              { hop: 'resource', from: { entity: 'resource' }, to: { entity: 'script' }, edge: { kind: 'binds_script' } },
            ],
            closure: { required_hops: ['resource'] },
            claims: {
              guarantees: ['reload_chain_closed'],
              non_guarantees: ['no_runtime_execution'],
              next_action: 'gitnexus query "Reload"',
            },
            confirmed_chain: {
              steps: [
                { hop_type: 'resource', anchor: 'Assets/Example.prefab:1', snippet: 'ReloadGraph' },
              ],
            },
            guarantees: ['can verify reload trigger'],
            non_guarantees: ['does not prove runtime ordering'],
          },
        ],
      }),
      'utf-8',
    );

    await expect(
      curateRuleLabSlice({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-a', inputPath }),
    ).rejects.toThrow(/failure_map/i);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('preserves multi-candidate curation and writes dsl-drafts with compatibility warning', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-curate-'));
    const inputPath = path.join(repoRoot, 'curation-input.json');
    const curated = [
      {
        id: 'candidate-1',
        rule_id: 'demo.rule.first.v1',
        title: 'first rule',
        match: {
          trigger_tokens: ['reload'],
          resource_types: ['syncvar_hook'],
          host_base_type: ['network_behaviour'],
        },
        topology: [
          { hop: 'code_runtime', from: { entity: 'script' }, to: { entity: 'runtime' }, edge: { kind: 'calls' } },
        ],
        closure: { required_hops: ['code_runtime'], failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' } },
        claims: {
          guarantees: ['reload_chain_closed'],
          non_guarantees: ['no_runtime_execution'],
          next_action: 'gitnexus query "reload"',
        },
        confirmed_chain: { steps: [{ hop_type: 'code_runtime', anchor: 'Assets/A.cs:1', snippet: 'A' }] },
        guarantees: ['reload_chain_closed'],
        non_guarantees: ['no_runtime_execution'],
      },
      {
        id: 'candidate-2',
        rule_id: 'demo.rule.second.v1',
        title: 'second rule',
        match: {
          trigger_tokens: ['reload'],
          resource_types: ['syncvar_hook'],
          host_base_type: ['network_behaviour'],
        },
        topology: [
          { hop: 'code_runtime', from: { entity: 'script' }, to: { entity: 'runtime' }, edge: { kind: 'calls' } },
        ],
        closure: { required_hops: ['code_runtime'], failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' } },
        claims: {
          guarantees: ['reload_chain_closed'],
          non_guarantees: ['no_runtime_execution'],
          next_action: 'gitnexus query "reload"',
        },
        confirmed_chain: { steps: [{ hop_type: 'code_runtime', anchor: 'Assets/B.cs:2', snippet: 'B' }] },
        guarantees: ['reload_chain_closed'],
        non_guarantees: ['no_runtime_execution'],
      },
    ];
    await fs.writeFile(inputPath, JSON.stringify({ run_id: 'run-x', slice_id: 'slice-a', curated }, null, 2), 'utf-8');

    const out = await curateRuleLabSlice({
      repoPath: repoRoot,
      runId: 'run-x',
      sliceId: 'slice-a',
      inputPath,
    });
    const baseDir = path.dirname(out.paths.curatedPath);
    const curatedOut = JSON.parse(await fs.readFile(out.paths.curatedPath, 'utf-8')) as any;
    const drafts = JSON.parse(await fs.readFile(path.join(baseDir, 'dsl-drafts.json'), 'utf-8')) as any;
    const legacy = JSON.parse(await fs.readFile(path.join(baseDir, 'dsl-draft.json'), 'utf-8')) as any;

    expect(curatedOut.curated).toHaveLength(2);
    expect(drafts.drafts).toHaveLength(2);
    expect(legacy.compatibility_warning).toMatch(/multi-draft/i);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });
});
