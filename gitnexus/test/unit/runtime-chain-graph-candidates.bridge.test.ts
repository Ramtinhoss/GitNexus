import { describe, expect, it } from 'vitest';
import { extractRuntimeGraphCandidates } from '../../src/mcp/local/runtime-chain-graph-candidates.js';

function makeBridgeExecutor() {
  return async (query: string) => {
    const q = String(query || '');
    if (q.includes('WHERE n.name IN $symbolNames')) {
      return [{
        id: 'Class:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:WeaponPowerUp',
        name: 'WeaponPowerUp',
        filePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        startLine: 1,
      }];
    }
    if (q.includes("MATCH (s {id: $symbolId})-[r:CodeRelation {type: 'CALLS'}]->(t)")) {
      return [];
    }
    if (
      q.includes("MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)")
      && q.includes("MATCH (m)-[r:CodeRelation {type: 'CALLS'}]->(t)")
    ) {
      return [];
    }
    if (
      q.includes("MATCH (caller)-[r:CodeRelation {type: 'CALLS'}]->(m)")
      && q.includes("MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)")
    ) {
      return [{
        sourceId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:HoldPickup',
        sourceName: 'HoldPickup',
        sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        sourceStartLine: 40,
        targetId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:PickItUp',
        targetName: 'PickItUp',
        targetFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        targetStartLine: 51,
        reason: 'unity-rule-method-bridge:unity.weapon-powerup-equip-chain.v2',
      }, {
        sourceId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:EquipWithEvent',
        sourceName: 'EquipWithEvent',
        sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        sourceStartLine: 60,
        targetId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:Equip',
        targetName: 'Equip',
        targetFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        targetStartLine: 78,
        reason: 'unity-rule-method-bridge:unity.weapon-powerup-equip-chain.v2',
      }];
    }
    return [];
  };
}

describe('runtime-chain graph candidates bridge extraction', () => {
  it('collects incoming CALLS edges targeting anchored class methods', async () => {
    const out = await extractRuntimeGraphCandidates({
      symbolName: 'WeaponPowerUp',
      executeParameterized: makeBridgeExecutor(),
    });
    const snippets = out.map((candidate) => `${candidate.sourceName} -> ${candidate.targetName}`);
    expect(snippets).toContain('HoldPickup -> PickItUp');
    expect(snippets).toContain('EquipWithEvent -> Equip');
  });
});
