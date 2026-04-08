import { describe, expect, it } from 'vitest';
import { verifyRuntimeChainOnDemand } from '../../src/mcp/local/runtime-chain-verify.js';

function makeUbiquitousEdgeExecutor() {
  return async (query: string) => {
    const q = String(query || '');
    if (q.includes('WHERE n.name IN $symbolNames')) {
      return [{
        id: 'Class:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:WeaponPowerUp',
        name: 'WeaponPowerUp',
        type: 'Class',
        filePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        startLine: 1,
      }];
    }
    if (q.includes("MATCH (s {id: $symbolId})-[r:CodeRelation {type: 'CALLS'}]->(t)")) {
      return [{
        sourceId: 'Class:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:WeaponPowerUp',
        sourceName: 'WeaponPowerUp',
        sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        sourceStartLine: 1,
        targetId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:GetComponent',
        targetName: 'GetComponent',
        targetFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        targetStartLine: 10,
      }];
    }
    if (
      q.includes("MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)")
      && q.includes("MATCH (m)-[r:CodeRelation {type: 'CALLS'}]->(t)")
    ) {
      return [{
        sourceId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:GetComponent',
        sourceName: 'GetComponent',
        sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        sourceStartLine: 10,
        targetId: 'Method:Assets/NEON/Code/Game/Core/EngineHooks.cs:Start',
        targetName: 'Start',
        targetFilePath: 'Assets/NEON/Code/Game/Core/EngineHooks.cs',
        targetStartLine: 1,
      }];
    }
    return [];
  };
}

describe('runtime graph-only precision matrix', () => {
  it('never emits verified_full when anchor intersection is absent', async () => {
    const out = await verifyRuntimeChainOnDemand({
      repoPath: '/tmp',
      queryText: 'Reload runtime check',
      symbolName: 'WeaponPowerUp',
      resourceSeedPath: 'Assets/NEON/DataAssets/Orbs/arcane_orb.asset',
      mappedSeedTargets: ['Assets/NEON/Graphs/Global/always_loaded.asset'],
      resourceBindings: [{ resourcePath: 'Assets/NEON/Graphs/Global/always_loaded.asset' }],
      executeParameterized: makeUbiquitousEdgeExecutor(),
    });

    expect(out?.status).toBe('verified_partial');
    expect(out?.evidence_level).toBe('verified_segment');
    expect((out?.gaps || []).some((gap) => String(gap.reason).includes('anchor intersection'))).toBe(true);
  });
});
