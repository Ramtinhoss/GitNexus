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
});
