import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyRuntimeClaimOnDemand } from '../../src/mcp/local/runtime-chain-verify.js';
import { writeCompiledRuleBundle } from '../../src/rule-lab/compiled-bundles.js';

function makeClosedChainExecutor() {
  return async (query: string) => {
    const q = String(query || '');
    if (q.includes('WHERE n.name IN $symbolNames')) {
      return [{
        id: 'Class:Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs:GunGraph',
        name: 'GunGraph',
        type: 'Class',
        filePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
        startLine: 1,
      }];
    }

    if (q.includes("MATCH (s {id: $symbolId})-[r:CodeRelation {type: 'CALLS'}]->(t)")) {
      return [{
        sourceId: 'Class:Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs:GunGraph',
        sourceName: 'GunGraph',
        sourceFilePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
        sourceStartLine: 1,
        targetId: 'Method:Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs:RegisterEvents',
        targetName: 'RegisterEvents',
        targetFilePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
        targetStartLine: 40,
      }];
    }

    if (q.includes("MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)")
      && q.includes("MATCH (m)-[r:CodeRelation {type: 'CALLS'}]->(t)")) {
      return [{
        sourceId: 'Method:Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs:RegisterEvents',
        sourceName: 'RegisterEvents',
        sourceFilePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
        sourceStartLine: 40,
        targetId: 'Method:Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs:StartRoutineWithEvents',
        targetName: 'StartRoutineWithEvents',
        targetFilePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
        targetStartLine: 50,
      }];
    }

    return [];
  };
}

describe('runtime claim evidence gate', () => {
  it('keeps a closed runtime chain verified when payload completeness is false for unrelated bindings', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-claim-evidence-gate-'));
    const graphAsset = 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset';
    try {
      await fs.mkdir(path.join(repoRoot, 'Assets/NEON/Graphs/PlayerGun/Gungraph_use'), { recursive: true });
      await fs.writeFile(path.join(repoRoot, graphAsset), 'guid: 7289942075c31ab458d5214b4adc38a1\n', 'utf-8');
      await fs.writeFile(path.join(repoRoot, `${graphAsset}.meta`), 'fileFormatVersion: 2\nguid: 7289942075c31ab458d5214b4adc38a1\n', 'utf-8');
      await writeCompiledRuleBundle(
        path.join(repoRoot, '.gitnexus', 'rules'),
        'verification_rules',
        [
          {
            id: 'demo.reload.evidence-gate.v2',
            version: '2.0.0',
            trigger_family: 'reload',
            trigger_tokens: ['reload'],
            resource_types: ['asset'],
            host_base_type: ['GunGraph'],
            required_hops: ['resource', 'guid_map', 'code_loader', 'code_runtime'],
            guarantees: ['topology_chain_closed'],
            non_guarantees: ['does_not_prove_runtime_execution'],
            next_action: 'gitnexus query "Reload NEON.Game.Graph.Nodes.Reloads"',
            file_path: 'approved/demo.reload.evidence-gate.v2.yaml',
            match: {
              trigger_tokens: ['reload'],
              symbol_kind: [],
              module_scope: [],
              resource_types: ['asset'],
              host_base_type: ['GunGraph'],
            },
            topology: [
              { hop: 'resource', from: { entity: 'resource' }, to: { entity: 'script' }, edge: { kind: 'binds_script' } },
              { hop: 'guid_map', from: { entity: 'resource' }, to: { entity: 'resource' }, edge: { kind: 'maps_guid' } },
              {
                hop: 'code_loader',
                from: { entity: 'script' },
                to: { entity: 'script' },
                edge: { kind: 'calls' },
                constraints: { targetName: 'RegisterEvents' },
              },
              {
                hop: 'code_runtime',
                from: { entity: 'script' },
                to: { entity: 'runtime' },
                edge: { kind: 'calls' },
                constraints: { sourceName: 'RegisterEvents', targetName: 'StartRoutineWithEvents' },
              },
            ],
            closure: {
              required_hops: ['resource', 'guid_map', 'code_loader', 'code_runtime'],
              failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' },
            },
            claims: {
              guarantees: ['topology_chain_closed'],
              non_guarantees: ['does_not_prove_runtime_execution'],
              next_action: 'gitnexus query "Reload NEON.Game.Graph.Nodes.Reloads"',
            },
          },
        ],
      );

      const out = await verifyRuntimeClaimOnDemand({
        repoPath: repoRoot,
        queryText: 'reload GunGraph Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
        symbolName: 'GunGraph',
        resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
        mappedSeedTargets: [graphAsset],
        resourceBindings: [{ resourcePath: graphAsset }],
        minimumEvidenceSatisfied: false,
        executeParameterized: makeClosedChainExecutor(),
      });

      expect(out.status).toBe('verified_full');
      expect(out.evidence_level).toBe('verified_chain');
      expect(out.reason).toBeUndefined();
      expect(out.hops.map((hop) => hop.hop_type)).toEqual(['resource', 'guid_map', 'code_loader', 'code_runtime']);
      expect(out.non_guarantees).not.toContain('minimum_evidence_contract_not_satisfied');
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });
});
