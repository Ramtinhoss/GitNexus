import { describe, expect, it } from 'vitest';
import { verifyRuntimeClaimOnDemand } from '../../src/mcp/local/runtime-chain-verify.js';

function makeNa2SeededExecutor() {
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
      return [];
    }
    if (
      q.includes("MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)")
      && q.includes("MATCH (m)-[r:CodeRelation {type: 'CALLS'}]->(t)")
    ) {
      return [{
        sourceId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:PickItUp',
        sourceName: 'PickItUp',
        sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        sourceStartLine: 51,
        targetId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:Equip',
        targetName: 'Equip',
        targetFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        targetStartLine: 78,
        reason: 'static-call',
      }];
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

describe('runtime graph-only NA2 regression', () => {
  it('closes NA2 weapon powerup seeded chain without query-time rule matching', async () => {
    const out = await verifyRuntimeClaimOnDemand({
      repoPath: '/tmp',
      queryText: '1_weapon_orb_key WeaponPowerUp HoldPickup EquipWithEvent Equip',
      symbolName: 'WeaponPowerUp',
      resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
      mappedSeedTargets: ['Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.prefab'],
      resourceBindings: [{
        resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
      }],
      minimumEvidenceSatisfied: true,
      executeParameterized: makeNa2SeededExecutor(),
    });

    expect(out.rule_id).toBe('graph-only.runtime-closure.v1');
    expect(out.status).toBe('verified_full');
    expect(out.evidence_level).toBe('verified_chain');
    expect(out.reason).toBeUndefined();

    const reasons = (out.gaps || []).map((gap) => String(gap.reason));
    expect(reasons).not.toContain('anchor segment missing');
    expect(reasons).not.toContain('bind segment missing');
    expect(reasons).not.toContain('bridge segment missing');
    expect(reasons).not.toContain('runtime segment missing');

    const snippets = (out.hops || []).map((hop) => String(hop.snippet || ''));
    expect(snippets).toContain('HoldPickup -> PickItUp');
    expect(snippets).toContain('EquipWithEvent -> Equip');
  });
});
