import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyRuntimeClaimOnDemand } from '../../src/mcp/local/runtime-chain-verify.js';

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
  it('uses graph-only runtime claim metadata even when multiple promoted reload rules exist', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'reload-v1-regression-'));
    try {
      await writeCuratedSlice(repoRoot, 'run-x', 'slice-generic', {
        ruleId: 'demo.reload.generic.v2',
        title: 'reload generic fallback',
        triggerToken: 'reload',
        hostBaseType: ['MonsterReload'],
      });

      await writeCuratedSlice(repoRoot, 'run-x', 'slice-gungraph', {
        ruleId: 'demo.reload.gungraph.v2',
        title: 'reload gungraph path',
        triggerToken: 'reload',
        hostBaseType: ['GunGraph'],
      });

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

      expect(out.rule_id).toBe('graph-only.runtime-closure.v1');
      expect(out.rule_version).toBe('1.0.0');
      expect(out.rule_id).not.toBe('demo.reload.generic.v2');
      expect(out.rule_id).not.toBe('demo.reload.gungraph.v2');
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });


  it('does not close the resource hop on an arbitrary graph binding when the broad query has no seed corroboration', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'reload-v1-resource-ambiguity-'));
    try {
      await writeCuratedSlice(repoRoot, 'run-z', 'slice-reload', {
        ruleId: 'demo.reload.gungraph.v2',
        title: 'reload gungraph path',
        triggerToken: 'reload',
        hostBaseType: ['GunGraph'],
      });

      const out = await verifyRuntimeClaimOnDemand({
        repoPath: repoRoot,
        queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
        symbolName: 'GunGraph',
        resourceBindings: [
          { resourcePath: 'Assets/NEON/Graphs/PlayerGun/1_weapon_gun_tata.asset' },
          { resourcePath: 'Assets/NEON/Graphs/Monster/测试_标记.asset' },
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

      expect(out.status).not.toBe('verified_full');
      expect(out.hops.filter((hop) => hop.hop_type === 'resource')).toHaveLength(0);
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });
});
