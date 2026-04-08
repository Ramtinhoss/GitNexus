import { describe, expect, it } from 'vitest';
import { verifyRuntimeChainOnDemand } from '../../src/mcp/local/runtime-chain-verify.js';

function makeGraphCandidateExecutor() {
  return async (query: string, params?: Record<string, unknown>) => {
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
        targetId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:Equip',
        targetName: 'Equip',
        targetFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        targetStartLine: 20,
      }];
    }
    if (
      q.includes("MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)")
      && q.includes("MATCH (m)-[r:CodeRelation {type: 'CALLS'}]->(t)")
    ) {
      return [{
        sourceId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:Equip',
        sourceName: 'Equip',
        sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        sourceStartLine: 20,
        targetId: 'Method:Assets/NEON/Code/Game/Core/GunGraph.cs:StartRoutineWithEvents',
        targetName: 'StartRoutineWithEvents',
        targetFilePath: 'Assets/NEON/Code/Game/Core/GunGraph.cs',
        targetStartLine: 50,
      }];
    }
    return [];
  };
}

describe('runtime-chain graph-only verifier', () => {
  it('selects candidates from graph anchors without loading retrieval/verification rules', async () => {
    const out = await verifyRuntimeChainOnDemand({
      repoPath: '/tmp',
      queryText: 'any noisy query text',
      symbolName: 'WeaponPowerUp',
      executeParameterized: makeGraphCandidateExecutor(),
      resourceBindings: [{ resourcePath: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset' }],
    });

    expect(out?.status).toBe('verified_partial');
    expect(out?.evidence_level).toBe('verified_segment');
    expect(out?.hops.map((hop) => hop.snippet)).toContain('WeaponPowerUp -> Equip');
    expect(out?.hops.map((hop) => hop.snippet)).toContain('Equip -> StartRoutineWithEvents');
  });
});
