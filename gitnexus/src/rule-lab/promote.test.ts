import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promoteCuratedRules } from './promote.js';

describe('rule-lab promote', () => {
  it('promotes curated candidate into approved yaml and catalog entry', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-promote-'));
    const rulesRoot = path.join(repoRoot, '.gitnexus', 'rules');
    const sliceDir = path.join(rulesRoot, 'lab', 'runs', 'run-x', 'slices', 'slice-a');
    await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
    await fs.mkdir(sliceDir, { recursive: true });
    await fs.writeFile(path.join(rulesRoot, 'catalog.json'), JSON.stringify({ version: 1, rules: [] }, null, 2), 'utf-8');

    await fs.writeFile(
      path.join(sliceDir, 'curated.json'),
      JSON.stringify({
        run_id: 'run-x',
        slice_id: 'slice-a',
        curated: [
          {
            id: 'candidate-1',
            rule_id: 'demo.rule.v1',
            title: 'demo rule',
            match: { trigger_tokens: ['reload'] },
            topology: [
              { hop: 'resource', from: { entity: 'resource' }, to: { entity: 'script' }, edge: { kind: 'binds_script' } },
            ],
            closure: {
              required_hops: ['resource'],
              failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' },
            },
            claims: {
              guarantees: ['can verify startup graph trigger'],
              non_guarantees: ['does not prove all runtime states'],
              next_action: 'gitnexus query "reload"',
            },
            confirmed_chain: {
              steps: [{ hop_type: 'resource', anchor: 'Assets/Demo.prefab:12', snippet: 'Reload' }],
            },
            guarantees: ['can verify startup graph trigger'],
            non_guarantees: ['does not prove all runtime states'],
          },
        ],
      }, null, 2),
      'utf-8',
    );

    const out = await promoteCuratedRules({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-a' });
    expect(out.catalog.rules.some((r) => r.id === 'demo.rule.v1')).toBe(true);
    expect(out.promotedFiles[0]).toMatch(/rules\/approved\/.*\.yaml$/);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('emits stage-aware compiled bundles for analyze, retrieval, and verification', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-promote-'));
    const rulesRoot = path.join(repoRoot, '.gitnexus', 'rules');
    const sliceDir = path.join(rulesRoot, 'lab', 'runs', 'run-x', 'slices', 'slice-a');
    await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
    await fs.mkdir(sliceDir, { recursive: true });
    await fs.writeFile(path.join(rulesRoot, 'catalog.json'), JSON.stringify({ version: 1, rules: [] }, null, 2), 'utf-8');

    await fs.writeFile(
      path.join(sliceDir, 'curated.json'),
      JSON.stringify({
        run_id: 'run-x',
        slice_id: 'slice-a',
        curated: [
          {
            id: 'candidate-1',
            rule_id: 'demo.rule.v2',
            title: 'demo rule',
            match: {
              trigger_tokens: ['reload'],
              resource_types: ['asset'],
              host_base_type: ['ReloadBase'],
            },
            topology: [
              { hop: 'resource', from: { entity: 'resource' }, to: { entity: 'script' }, edge: { kind: 'binds_script' } },
              { hop: 'code_runtime', from: { entity: 'script' }, to: { entity: 'runtime' }, edge: { kind: 'calls' } },
            ],
            closure: {
              required_hops: ['resource', 'code_runtime'],
              failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' },
            },
            claims: {
              guarantees: ['reload_chain_closed'],
              non_guarantees: ['no_runtime_execution'],
              next_action: 'gitnexus query "reload"',
            },
            confirmed_chain: {
              steps: [{ hop_type: 'resource', anchor: 'Assets/Demo.prefab:12', snippet: 'Reload' }],
            },
            guarantees: ['reload_chain_closed'],
            non_guarantees: ['no_runtime_execution'],
          },
        ],
      }, null, 2),
      'utf-8',
    );

    const out = await promoteCuratedRules({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-a', version: '2.0.0' });
    expect(out).toHaveProperty('compiledPaths');

    const analyzeBundlePath = path.join(rulesRoot, 'compiled', 'analyze_rules.v2.json');
    const retrievalBundlePath = path.join(rulesRoot, 'compiled', 'retrieval_rules.v2.json');
    const verificationBundlePath = path.join(rulesRoot, 'compiled', 'verification_rules.v2.json');

    const analyzeBundle = JSON.parse(await fs.readFile(analyzeBundlePath, 'utf-8'));
    const retrievalBundle = JSON.parse(await fs.readFile(retrievalBundlePath, 'utf-8'));
    const verificationBundle = JSON.parse(await fs.readFile(verificationBundlePath, 'utf-8'));

    expect(analyzeBundle.family).toBe('analyze_rules');
    expect(retrievalBundle.family).toBe('retrieval_rules');
    expect(verificationBundle.family).toBe('verification_rules');
    expect(analyzeBundle.rules[0].id).toBe('demo.rule.v2');
    expect(retrievalBundle.rules[0].claims.next_action).toBe('gitnexus query "reload"');
    expect(verificationBundle.rules[0].closure.required_hops).toEqual(['resource', 'code_runtime']);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('rejects promote when resource_types or host_base_type are unknown', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-promote-'));
    const rulesRoot = path.join(repoRoot, '.gitnexus', 'rules');
    const sliceDir = path.join(rulesRoot, 'lab', 'runs', 'run-x', 'slices', 'slice-a');
    await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
    await fs.mkdir(sliceDir, { recursive: true });
    await fs.writeFile(path.join(rulesRoot, 'catalog.json'), JSON.stringify({ version: 1, rules: [] }, null, 2), 'utf-8');
    await fs.writeFile(
      path.join(sliceDir, 'curated.json'),
      JSON.stringify({
        run_id: 'run-x',
        slice_id: 'slice-a',
        curated: [
          {
            id: 'candidate-unknown',
            rule_id: 'demo.rule.v2',
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
              next_action: 'gitnexus query "reload"',
            },
            confirmed_chain: {
              steps: [{ hop_type: 'resource', anchor: 'Assets/Demo.prefab:9', snippet: 'Reload' }],
            },
            guarantees: ['reload_chain_closed'],
            non_guarantees: ['no_runtime_execution'],
          },
        ],
      }, null, 2),
      'utf-8',
    );
    await fs.writeFile(
      path.join(sliceDir, 'dsl-draft.json'),
      JSON.stringify({
        id: 'demo.rule.v2',
        version: '2.0.0',
        match: {
          trigger_tokens: ['reload'],
          resource_types: ['unknown'],
          host_base_type: ['unknown'],
        },
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
          next_action: 'gitnexus query "reload"',
        },
      }, null, 2),
      'utf-8',
    );

    await expect(
      promoteCuratedRules({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-a' }),
    ).rejects.toThrow(/unknown/i);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });
});
