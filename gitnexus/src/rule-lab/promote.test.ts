import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promoteCuratedRules } from './promote.js';
import { loadRuleRegistry } from '../mcp/local/runtime-claim-rule-registry.js';

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

  it('promotes every curated item when dsl-drafts includes multiple candidates', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-promote-multi-'));
    const rulesRoot = path.join(repoRoot, '.gitnexus', 'rules');
    const sliceDir = path.join(rulesRoot, 'lab', 'runs', 'run-x', 'slices', 'slice-a');
    await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
    await fs.mkdir(sliceDir, { recursive: true });
    await fs.writeFile(path.join(rulesRoot, 'catalog.json'), JSON.stringify({ version: 1, rules: [] }, null, 2), 'utf-8');
    const curated = {
      run_id: 'run-x',
      slice_id: 'slice-a',
      curated: [
        {
          id: 'candidate-1',
          rule_id: 'demo.multi.first.v1',
          title: 'demo first',
          match: { trigger_tokens: ['reload'], resource_types: ['syncvar_hook'], host_base_type: ['network_behaviour'] },
          topology: [{ hop: 'code_runtime', from: { entity: 'script' }, to: { entity: 'runtime' }, edge: { kind: 'calls' } }],
          closure: { required_hops: ['code_runtime'], failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' } },
          claims: { guarantees: ['reload_chain_closed'], non_guarantees: ['no_runtime_execution'], next_action: 'gitnexus query "reload"' },
          confirmed_chain: { steps: [{ hop_type: 'code_runtime', anchor: 'Assets/A.cs:1', snippet: 'A' }] },
          guarantees: ['reload_chain_closed'],
          non_guarantees: ['no_runtime_execution'],
        },
        {
          id: 'candidate-2',
          rule_id: 'demo.multi.second.v1',
          title: 'demo second',
          match: { trigger_tokens: ['reload'], resource_types: ['syncvar_hook'], host_base_type: ['network_behaviour'] },
          topology: [{ hop: 'code_runtime', from: { entity: 'script' }, to: { entity: 'runtime' }, edge: { kind: 'calls' } }],
          closure: { required_hops: ['code_runtime'], failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' } },
          claims: { guarantees: ['reload_chain_closed'], non_guarantees: ['no_runtime_execution'], next_action: 'gitnexus query "reload"' },
          confirmed_chain: { steps: [{ hop_type: 'code_runtime', anchor: 'Assets/B.cs:2', snippet: 'B' }] },
          guarantees: ['reload_chain_closed'],
          non_guarantees: ['no_runtime_execution'],
        },
      ],
    };
    await fs.writeFile(path.join(sliceDir, 'curated.json'), JSON.stringify(curated, null, 2), 'utf-8');
    await fs.writeFile(
      path.join(sliceDir, 'dsl-drafts.json'),
      JSON.stringify({
        drafts: [
          {
            id: 'demo.multi.first.v1',
            version: '2.0.0',
            match: curated.curated[0].match,
            topology: curated.curated[0].topology,
            closure: curated.curated[0].closure,
            claims: curated.curated[0].claims,
          },
          {
            id: 'demo.multi.second.v1',
            version: '2.0.0',
            match: curated.curated[1].match,
            topology: curated.curated[1].topology,
            closure: curated.curated[1].closure,
            claims: curated.curated[1].claims,
          },
        ],
      }, null, 2),
      'utf-8',
    );
    await fs.writeFile(
      path.join(sliceDir, 'dsl-draft.json'),
      JSON.stringify({
        compatibility_warning: 'multi-draft compatibility alias',
        primary_draft_id: 'demo.multi.first.v1',
      }, null, 2),
      'utf-8',
    );

    const out = await promoteCuratedRules({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-a' });
    expect(out.promotedFiles).toHaveLength(2);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('writes all binding fields into yaml and keeps them parseable via loadRuleRegistry', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-promote-bindings-roundtrip-'));
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
            rule_id: 'demo.bindings.roundtrip.v1',
            title: 'demo bindings',
            match: {
              trigger_tokens: ['reload'],
              resource_types: ['syncvar_hook'],
              host_base_type: ['network_behaviour'],
            },
            topology: [
              { hop: 'code_runtime', from: { entity: 'script' }, to: { entity: 'runtime' }, edge: { kind: 'calls' } },
            ],
            closure: {
              required_hops: ['code_runtime'],
              failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' },
            },
            claims: {
              guarantees: ['binding_fields_roundtrip'],
              non_guarantees: ['no_runtime_execution'],
              next_action: 'gitnexus query "reload"',
            },
            confirmed_chain: {
              steps: [{ hop_type: 'code_runtime', anchor: 'Assets/Demo.cs:12', snippet: 'Demo.Trigger' }],
            },
            guarantees: ['binding_fields_roundtrip'],
            non_guarantees: ['no_runtime_execution'],
            resource_bindings: [
              {
                kind: 'method_triggers_scene_load',
                host_class_pattern: 'BattleController',
                loader_methods: ['EnterBattle'],
                scene_name: 'BattleScene',
              },
              {
                kind: 'method_triggers_method',
                source_class_pattern: 'SourceClass',
                source_method: 'Emit',
                target_class_pattern: 'TargetClass',
                target_method: 'Handle',
              },
            ],
          },
        ],
      }, null, 2),
      'utf-8',
    );

    const out = await promoteCuratedRules({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-a', version: '1.0.0' });
    const yaml = await fs.readFile(out.promotedFiles[0], 'utf-8');
    expect(yaml).toContain('scene_name: BattleScene');
    expect(yaml).toContain('host_class_pattern: BattleController');
    expect(yaml).toContain('loader_methods:');
    expect(yaml).toContain('- EnterBattle');
    expect(yaml).toContain('target_class_pattern: TargetClass');
    expect(yaml).toContain('target_method: Handle');

    await fs.rm(path.join(rulesRoot, 'compiled'), { recursive: true, force: true });
    const registry = await loadRuleRegistry(repoRoot);
    const rule = registry.activeRules.find((item) => item.id === 'demo.bindings.roundtrip.v1');
    expect(rule).toBeTruthy();
    expect(rule?.resource_bindings).toBeDefined();
    expect(rule?.resource_bindings?.[0].kind).toBe('method_triggers_scene_load');
    expect(rule?.resource_bindings?.[0].host_class_pattern).toBe('BattleController');
    expect(rule?.resource_bindings?.[0].loader_methods).toEqual(['EnterBattle']);
    expect(rule?.resource_bindings?.[0].scene_name).toBe('BattleScene');
    expect(rule?.resource_bindings?.[0].source_class_pattern).toBeUndefined();
    expect(rule?.resource_bindings?.[0].source_method).toBeUndefined();
    expect(rule?.resource_bindings?.[0].target_class_pattern).toBeUndefined();
    expect(rule?.resource_bindings?.[0].target_method).toBeUndefined();
    expect(rule?.resource_bindings?.[1].kind).toBe('method_triggers_method');
    expect(rule?.resource_bindings?.[1].source_class_pattern).toBe('SourceClass');
    expect(rule?.resource_bindings?.[1].source_method).toBe('Emit');
    expect(rule?.resource_bindings?.[1].target_class_pattern).toBe('TargetClass');
    expect(rule?.resource_bindings?.[1].target_method).toBe('Handle');

    await fs.rm(repoRoot, { recursive: true, force: true });
  });
});
