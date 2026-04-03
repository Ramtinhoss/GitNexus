import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyRuntimeClaimOnDemand } from '../../src/mcp/local/runtime-chain-verify.js';
import { promoteCuratedRules } from '../../src/rule-lab/promote.js';

interface CuratedRuleInput {
  ruleId: string;
  title: string;
  triggerToken: string;
  hostBaseType: string[];
  resourceTypes?: string[];
  topology?: Array<{
    hop: string;
    from: Record<string, unknown>;
    to: Record<string, unknown>;
    edge: { kind: string };
    constraints?: Record<string, unknown>;
  }>;
}

async function writeCuratedSlice(
  repoRoot: string,
  runId: string,
  sliceId: string,
  input: CuratedRuleInput,
): Promise<void> {
  const rulesRoot = path.join(repoRoot, '.gitnexus', 'rules');
  const sliceDir = path.join(rulesRoot, 'lab', 'runs', runId, 'slices', sliceId);
  await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
  await fs.mkdir(sliceDir, { recursive: true });
  await fs.writeFile(path.join(rulesRoot, 'catalog.json'), JSON.stringify({ version: 1, rules: [] }, null, 2), 'utf-8');
  await fs.writeFile(
    path.join(sliceDir, 'curated.json'),
    JSON.stringify({
      run_id: runId,
      slice_id: sliceId,
      curated: [
        {
          id: `${input.ruleId}-candidate`,
          rule_id: input.ruleId,
          title: input.title,
          match: {
            trigger_tokens: [input.triggerToken],
            resource_types: input.resourceTypes || ['asset'],
            host_base_type: input.hostBaseType,
          },
          topology: input.topology || [
            {
              hop: 'resource',
              from: { entity: 'resource' },
              to: { entity: 'script' },
              edge: { kind: 'binds_script' },
            },
          ],
          closure: {
            required_hops: ['resource'],
            failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' },
          },
          claims: {
            guarantees: ['reload_rule_selected'],
            non_guarantees: ['does_not_prove_runtime_order'],
            next_action: 'gitnexus query "Reload NEON.Game.Graph.Nodes.Reloads"',
          },
          confirmed_chain: {
            steps: [{ hop_type: 'resource', anchor: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset:1', snippet: 'reload' }],
          },
          guarantees: ['reload_rule_selected'],
          non_guarantees: ['does_not_prove_runtime_order'],
        },
      ],
    }, null, 2),
    'utf-8',
  );
}

describe('reload-v1 current-source regressions', () => {
  it('prefers the GunGraph-scoped reload rule over the first generic reload token match', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'reload-v1-regression-'));
    try {
      await writeCuratedSlice(repoRoot, 'run-x', 'slice-generic', {
        ruleId: 'demo.reload.generic.v2',
        title: 'reload generic fallback',
        triggerToken: 'reload',
        hostBaseType: ['MonsterReload'],
      });
      await promoteCuratedRules({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-generic', version: '2.0.0' });

      await writeCuratedSlice(repoRoot, 'run-x', 'slice-gungraph', {
        ruleId: 'demo.reload.gungraph.v2',
        title: 'reload gungraph path',
        triggerToken: 'reload',
        hostBaseType: ['GunGraph'],
      });
      await promoteCuratedRules({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-gungraph', version: '2.0.0' });

      const out = await verifyRuntimeClaimOnDemand({
        repoPath: repoRoot,
        queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
        symbolName: 'GunGraph',
        resourceBindings: [
          { resourcePath: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_gun_tata.asset' },
          { resourcePath: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset' },
        ],
        executeParameterized: async (query: string) => {
          if (query.includes('WHERE n.name IN $symbolNames')) {
            return [{
              id: 'Class:Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs:GunGraph',
              name: 'GunGraph',
              type: 'Class',
              filePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
              startLine: 1,
            }];
          }
          return [];
        },
      });

      expect(out.rule_id).toBe('demo.reload.gungraph.v2');
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('preserves curated reload DSL fields in the approved yaml and compiled verification bundle', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'reload-v1-promote-'));
    try {
      await writeCuratedSlice(repoRoot, 'run-y', 'slice-reload', {
        ruleId: 'demo.neonspark.reload.v1',
        title: 'reload gungraph path',
        triggerToken: 'reload',
        hostBaseType: ['GunGraph'],
        resourceTypes: ['asset'],
        topology: [
          {
            hop: 'resource',
            from: { entity: 'resource' },
            to: { entity: 'script' },
            edge: { kind: 'binds_script' },
          },
          {
            hop: 'code_loader',
            from: { entity: 'script' },
            to: { entity: 'script' },
            edge: { kind: 'calls' },
            constraints: { sourceName: 'RegisterGraphEvents', targetName: 'RegisterEvents' },
          },
          {
            hop: 'code_runtime',
            from: { entity: 'script' },
            to: { entity: 'runtime' },
            edge: { kind: 'calls' },
            constraints: { sourceName: 'RegisterEvents', targetName: 'StartRoutineWithEvents' },
          },
        ],
      });
      await promoteCuratedRules({ repoPath: repoRoot, runId: 'run-y', sliceId: 'slice-reload', version: '2.0.0' });

      const yamlPath = path.join(repoRoot, '.gitnexus', 'rules', 'approved', 'demo.neonspark.reload.v1.yaml');
      const bundlePath = path.join(repoRoot, '.gitnexus', 'rules', 'compiled', 'verification_rules.v2.json');
      const yaml = await fs.readFile(yamlPath, 'utf-8');
      const bundle = JSON.parse(await fs.readFile(bundlePath, 'utf-8'));
      const compiledRule = bundle.rules.find((rule: any) => rule.id === 'demo.neonspark.reload.v1');

      expect(yaml).toContain('host_base_type:');
      expect(yaml).toContain('- GunGraph');
      expect(yaml).toContain('resource_types:');
      expect(yaml).toContain('targetName: RegisterEvents');
      expect(yaml).toContain('targetName: StartRoutineWithEvents');
      expect(compiledRule.match.host_base_type).toEqual(['GunGraph']);
      expect(compiledRule.match.resource_types).toEqual(['asset']);
      expect(compiledRule.topology).toHaveLength(3);
      expect(compiledRule.topology[1].constraints).toEqual({
        sourceName: 'RegisterGraphEvents',
        targetName: 'RegisterEvents',
      });
      expect(compiledRule.topology[2].constraints).toEqual({
        sourceName: 'RegisterEvents',
        targetName: 'StartRoutineWithEvents',
      });
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });
});
