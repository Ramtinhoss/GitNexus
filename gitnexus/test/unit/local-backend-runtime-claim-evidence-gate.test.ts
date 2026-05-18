import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyRuntimeClaimOnDemand } from '../../src/mcp/local/runtime-chain-verify.js';
import { computeVerifierMinimumEvidenceSatisfied } from '../../src/mcp/local/local-backend.js';

function makeClosedChainExecutor() {
  return async (query: string) => {
    const q = String(query || '');

    if (q.includes("r.reason CONTAINS $ruleId") && q.includes("r.reason STARTS WITH 'unity-rule-'")) {
      return [{
        sourceName: 'GunGraph',
        sourceFilePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
        sourceStartLine: 1,
        targetName: 'RegisterEvents',
        targetFilePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
        targetStartLine: 40,
        reason: 'unity-rule-demo.reload.evidence-gate.v2',
      }];
    }

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
        reason: 'unity-rule-method-bridge:demo.reload.evidence-gate.v2',
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
        reason: 'static-call',
      }];
    }

    return [];
  };
}

describe('runtime claim evidence gate', () => {
  it('does not mark verifier_minimum_evidence_satisfied=true when evidence rows are truncated or filter_exhausted', () => {
    expect(computeVerifierMinimumEvidenceSatisfied({
      evidenceMetaRows: [{ verifier_minimum_evidence_satisfied: true, truncated: true }],
      truncated: true,
      filterExhausted: false,
    })).toBe(false);

    expect(computeVerifierMinimumEvidenceSatisfied({
      evidenceMetaRows: [{ verifier_minimum_evidence_satisfied: true, filter_exhausted: true }],
      truncated: false,
      filterExhausted: true,
    })).toBe(false);
  });



  it('calls verifier with structured anchors and no queryText match dependency', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-claim-graph-only-wiring-'));
    const graphAsset = 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset';
    try {
      const out = await verifyRuntimeClaimOnDemand({
        repoPath: repoRoot,
        queryText: 'completely unrelated query text',
        symbolName: 'GunGraph',
        symbolFilePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
        resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
        mappedSeedTargets: [graphAsset],
        resourceBindings: [{ resourcePath: graphAsset }],
        minimumEvidenceSatisfied: true,
        executeParameterized: makeClosedChainExecutor(),
      });

      expect(out.status).toBe('verified_full');
      expect(out.evidence_level).toBe('verified_chain');
      expect(out.reason).toBeUndefined();
      expect(out.hops.length).toBeGreaterThan(0);
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });
});
