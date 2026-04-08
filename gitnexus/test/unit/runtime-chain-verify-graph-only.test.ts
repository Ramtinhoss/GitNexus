import { describe, expect, it } from 'vitest';
import { verifyRuntimeChainOnDemand, verifyRuntimeClaimOnDemand } from '../../src/mcp/local/runtime-chain-verify.js';

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
        reason: 'unity-rule-method-bridge:unity.weapon-powerup-equip-chain.v2',
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
        reason: 'static-call',
      }];
    }
    return [];
  };
}

describe('runtime-chain graph-only verifier', () => {
  it('continuity: marks runtime segment satisfied via continuous bridge-to-runtime path without runtime keywords', async () => {
    const out = await verifyRuntimeChainOnDemand({
      repoPath: '/tmp',
      queryText: 'weapon continuity check',
      symbolName: 'WeaponPowerUp',
      resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/weapon.asset',
      mappedSeedTargets: ['Assets/NEON/Graphs/PlayerGun/Gungraph_use/weapon_graph.prefab'],
      resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/weapon.asset' }],
      executeParameterized: async (query: string) => {
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
          }];
        }
        return [];
      },
    });

    expect(out?.status).toBe('verified_full');
    expect(out?.evidence_level).toBe('verified_chain');
    expect((out?.gaps || []).some((gap) => String(gap.reason).includes('runtime segment missing'))).toBe(false);
  });

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

  it('returns verified_full only when all four closure segments are satisfied', async () => {
    const baseInput = {
      repoPath: '/tmp',
      queryText: 'any noisy query text',
      symbolName: 'WeaponPowerUp',
      resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/weapon.asset',
      mappedSeedTargets: ['Assets/NEON/Graphs/PlayerGun/Gungraph_use/weapon_graph.asset'],
      resourceBindings: [{ resourcePath: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/weapon_graph.asset' }],
      executeParameterized: makeGraphCandidateExecutor(),
    };

    const full = await verifyRuntimeChainOnDemand(baseInput);
    expect(full?.status).toBe('verified_full');
    expect(full?.evidence_level).toBe('verified_chain');

    const missingAnchor = await verifyRuntimeChainOnDemand({
      ...baseInput,
      symbolName: 'MissingAnchorSymbol',
    });
    expect(missingAnchor?.status).not.toBe('verified_full');

    const missingBind = await verifyRuntimeChainOnDemand({
      ...baseInput,
      resourceBindings: [{ resourcePath: 'Assets/NEON/Other/Unrelated.asset' }],
    });
    expect(missingBind?.status).not.toBe('verified_full');

    const missingBridge = await verifyRuntimeChainOnDemand({
      ...baseInput,
      executeParameterized: async (query: string, params?: Record<string, unknown>) => {
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
        if (String(params?.symbolId || '').includes('WeaponPowerUp')) {
          return [];
        }
        return [];
      },
    });
    expect(missingBridge?.status).not.toBe('verified_full');

    const missingRuntime = await verifyRuntimeChainOnDemand({
      ...baseInput,
      executeParameterized: async (query: string) => {
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
            targetId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:ApplyGraph',
            targetName: 'ApplyGraph',
            targetFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
            targetStartLine: 30,
          }];
        }
        return [];
      },
    });
    expect(missingRuntime?.status).not.toBe('verified_full');
  });

  it('downgrades ubiquitous-edge closures when anchor intersection is absent', async () => {
    const out = await verifyRuntimeChainOnDemand({
      repoPath: '/tmp',
      queryText: 'Reload runtime check',
      symbolName: 'WeaponPowerUp',
      resourceSeedPath: 'Assets/NEON/DataAssets/Orbs/arcane_orb.asset',
      mappedSeedTargets: ['Assets/NEON/Graphs/Global/always_loaded.asset'],
      resourceBindings: [{ resourcePath: 'Assets/NEON/Graphs/Global/always_loaded.asset' }],
      executeParameterized: async (query: string) => {
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
            reason: 'unity-rule-method-bridge:unity.weapon-powerup-equip-chain.v2',
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
            reason: 'static-call',
          }];
        }
        return [];
      },
    });

    expect(out?.status).toBe('verified_partial');
    expect((out?.gaps || []).some((gap) => String(gap.reason).includes('precision-first policy'))).toBe(true);
  });

  it('does not require retrieval/verification family for runtime closure in query-time path', async () => {
    const out = await verifyRuntimeClaimOnDemand({
      repoPath: '/tmp/no-rules-present',
      queryText: 'irrelevant query text',
      symbolName: 'WeaponPowerUp',
      resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/weapon.asset',
      mappedSeedTargets: ['Assets/NEON/Graphs/PlayerGun/Gungraph_use/weapon_graph.asset'],
      resourceBindings: [{ resourcePath: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/weapon_graph.asset' }],
      executeParameterized: makeGraphCandidateExecutor(),
      minimumEvidenceSatisfied: true,
    });

    expect(out.status).toBe('verified_full');
    expect(out.evidence_level).toBe('verified_chain');
    expect(out.reason).toBeUndefined();
  });
});
