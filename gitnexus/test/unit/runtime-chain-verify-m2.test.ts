import { describe, expect, it } from 'vitest';
import { verifyRuntimeChainOnDemand } from '../../src/mcp/local/runtime-chain-verify.js';

function makeExecuteParameterized(options?: { omitRuntime?: boolean }) {
  return async (query: string, params?: Record<string, unknown>) => {
    const q = String(query || '');

    if (q.includes("r.reason STARTS WITH 'unity-rule-'") && q.includes('r.reason CONTAINS $ruleId')) {
      const ruleId = String(params?.ruleId || '');
      if (ruleId && !options?.omitRuntime) {
        return [
          {
            sourceName: 'WeaponPowerUp',
            sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
            sourceStartLine: 1,
            targetName: 'Equip',
            targetFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
            targetStartLine: 20,
            reason: `unity-rule-code-loader:${ruleId}`,
          },
          {
            sourceName: 'Equip',
            sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
            sourceStartLine: 20,
            targetName: 'StartRoutineWithEvents',
            targetFilePath: 'Assets/NEON/Code/Game/Core/GunGraph.cs',
            targetStartLine: 50,
            reason: `unity-rule-code-runtime:${ruleId}`,
          },
        ];
      }
      return [];
    }

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
      return [
        {
          sourceId: 'Class:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:WeaponPowerUp',
          sourceName: 'WeaponPowerUp',
          sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          sourceStartLine: 1,
          targetId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:RegisterGraphEvents',
          targetName: 'RegisterGraphEvents',
          targetFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          targetStartLine: 10,
        },
        {
          sourceId: 'Class:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:WeaponPowerUp',
          sourceName: 'WeaponPowerUp',
          sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          sourceStartLine: 1,
          targetId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:Equip',
          targetName: 'Equip',
          targetFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          targetStartLine: 20,
        },
      ];
    }

    if (q.includes("MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)")
      && q.includes("MATCH (m)-[r:CodeRelation {type: 'CALLS'}]->(t)")) {
      return options?.omitRuntime ? [] : [
        {
          sourceId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:Equip',
          sourceName: 'Equip',
          sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          sourceStartLine: 20,
          targetId: 'Method:Assets/NEON/Code/Game/Core/GunGraph.cs:StartRoutineWithEvents',
          targetName: 'StartRoutineWithEvents',
          targetFilePath: 'Assets/NEON/Code/Game/Core/GunGraph.cs',
          targetStartLine: 50,
        },
        {
          sourceId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:Equip',
          sourceName: 'Equip',
          sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          sourceStartLine: 20,
          targetId: 'Method:Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs:CheckReload',
          targetName: 'CheckReload',
          targetFilePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
          targetStartLine: 80,
        },
      ];
    }

    return [];
  };
}

function makeExecuteDisconnectedRuntime() {
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
      return [
        {
          sourceId: 'Class:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:WeaponPowerUp',
          sourceName: 'WeaponPowerUp',
          sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          sourceStartLine: 1,
          targetId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:Equip',
          targetName: 'Equip',
          targetFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          targetStartLine: 20,
        },
      ];
    }

    if (q.includes("MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)")
      && q.includes("MATCH (m)-[r:CodeRelation {type: 'CALLS'}]->(t)")) {
      return [
        {
          sourceId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:RegisterGraphEvents',
          sourceName: 'RegisterGraphEvents',
          sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          sourceStartLine: 10,
          targetId: 'Method:Assets/NEON/Code/Game/Core/GunGraph.cs:StartRoutineWithEvents',
          targetName: 'StartRoutineWithEvents',
          targetFilePath: 'Assets/NEON/Code/Game/Core/GunGraph.cs',
          targetStartLine: 50,
        },
      ];
    }

    return [];
  };
}

function makeExecuteAnchoredReloadBridge() {
  return async (query: string, params?: Record<string, unknown>) => {
    const q = String(query || '');

    if (q.includes("r.reason STARTS WITH 'unity-rule-'") && q.includes('r.reason CONTAINS $ruleId')) {
      const ruleId = String(params?.ruleId || '');
      if (ruleId) {
        return [
          {
            sourceName: 'WeaponPowerUp',
            sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
            sourceStartLine: 1,
            targetName: 'RegisterGraphEvents',
            targetFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
            targetStartLine: 10,
            reason: `unity-rule-code-loader:${ruleId}`,
          },
          {
            sourceName: 'RegisterGraphEvents',
            sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
            sourceStartLine: 10,
            targetName: 'RegisterEvents',
            targetFilePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
            targetStartLine: 40,
            reason: `unity-rule-code-runtime:${ruleId}`,
          },
          {
            sourceName: 'RegisterEvents',
            sourceFilePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
            sourceStartLine: 40,
            targetName: 'StartRoutineWithEvents',
            targetFilePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
            targetStartLine: 50,
            reason: `unity-rule-code-runtime:${ruleId}`,
          },
        ];
      }
      return [];
    }

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
      if (String(params?.symbolId || '') === 'Method:Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs:RegisterEvents') {
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
      return [
        {
          sourceId: 'Class:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:WeaponPowerUp',
          sourceName: 'WeaponPowerUp',
          sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          sourceStartLine: 1,
          targetId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:RegisterGraphEvents',
          targetName: 'RegisterGraphEvents',
          targetFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          targetStartLine: 10,
        },
      ];
    }

    if (q.includes("MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)")
      && q.includes("MATCH (m)-[r:CodeRelation {type: 'CALLS'}]->(t)")) {
      return [
        {
          sourceId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:RegisterGraphEvents',
          sourceName: 'RegisterGraphEvents',
          sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          sourceStartLine: 10,
          targetId: 'Method:Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs:RegisterEvents',
          targetName: 'RegisterEvents',
          targetFilePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
          targetStartLine: 40,
        },
      ];
    }

    return [];
  };
}

describe('runtime-chain-verify M2 topology execution', () => {
  it('executes topology constraints instead of regex-first edge picking', async () => {
    const out = await verifyRuntimeChainOnDemand({
      repoPath: '/tmp',
      queryText: 'Reload runtime chain',
      symbolName: 'WeaponPowerUp',
      executeParameterized: makeExecuteParameterized(),
      rule: {
        id: 'demo.m2.topology.v2',
        version: '2.0.0',
        trigger_family: 'reload',
        resource_types: ['asset'],
        host_base_type: ['WeaponPowerUp'],
        required_hops: ['code_loader', 'code_runtime'],
        guarantees: ['topology_chain_closed'],
        non_guarantees: ['no_runtime_execution'],
        next_action: 'gitnexus query "Reload runtime chain"',
        file_path: '.gitnexus/rules/approved/demo.m2.topology.v2.yaml',
        topology: [
          {
            hop: 'code_loader',
            from: { entity: 'script' },
            to: { entity: 'script' },
            edge: { kind: 'calls' },
            constraints: { targetName: 'Equip' },
          },
          {
            hop: 'code_runtime',
            from: { entity: 'script' },
            to: { entity: 'runtime' },
            edge: { kind: 'calls' },
            constraints: { sourceName: 'Equip', targetName: 'StartRoutineWithEvents' },
          },
        ],
      } as any,
    });

    expect(out?.status).toBe('verified_full');
    expect(out?.evidence_level).toBe('verified_chain');
    expect(out?.hops.map((hop) => hop.snippet)).toContain('WeaponPowerUp -> Equip');
    expect(out?.hops.map((hop) => hop.snippet)).toContain('Equip -> StartRoutineWithEvents');
  });

  it('returns failed when no synthetic edges exist for the rule', async () => {
    const out = await verifyRuntimeChainOnDemand({
      repoPath: '/tmp',
      queryText: 'Reload runtime chain',
      symbolName: 'WeaponPowerUp',
      executeParameterized: makeExecuteParameterized({ omitRuntime: true }),
      rule: {
        id: 'demo.m2.topology-missing.v2',
        version: '2.0.0',
        trigger_family: 'reload',
        resource_types: ['asset'],
        host_base_type: ['WeaponPowerUp'],
        required_hops: ['code_loader', 'code_runtime'],
        guarantees: ['topology_chain_closed'],
        non_guarantees: ['no_runtime_execution'],
        next_action: 'gitnexus query "Reload runtime chain"',
        file_path: '.gitnexus/rules/approved/demo.m2.topology-missing.v2.yaml',
        topology: [
          {
            hop: 'code_loader',
            from: { entity: 'script' },
            to: { entity: 'script' },
            edge: { kind: 'calls' },
            constraints: { targetName: 'Equip' },
          },
          {
            hop: 'code_runtime',
            from: { entity: 'script' },
            to: { entity: 'runtime' },
            edge: { kind: 'calls' },
            constraints: { sourceName: 'Equip', targetName: 'StartRoutineWithEvents' },
          },
        ],
      } as any,
    });

    expect(out?.status).toBe('failed');
    expect(out?.evidence_level).toBe('none');
  });

  it('returns failed when disconnected runtime has no synthetic edges', async () => {
    const out = await verifyRuntimeChainOnDemand({
      repoPath: '/tmp',
      queryText: 'Reload runtime chain',
      symbolName: 'WeaponPowerUp',
      executeParameterized: makeExecuteDisconnectedRuntime(),
      rule: {
        id: 'demo.m2.topology-disconnected.v2',
        version: '2.0.0',
        trigger_family: 'reload',
        resource_types: ['asset'],
        host_base_type: ['WeaponPowerUp'],
        required_hops: ['code_loader', 'code_runtime'],
        guarantees: ['topology_chain_closed'],
        non_guarantees: ['no_runtime_execution'],
        next_action: 'gitnexus query "Reload runtime chain"',
        file_path: '.gitnexus/rules/approved/demo.m2.topology-disconnected.v2.yaml',
        topology: [
          {
            hop: 'code_loader',
            from: { entity: 'script' },
            to: { entity: 'script' },
            edge: { kind: 'calls' },
            constraints: { targetName: 'Equip' },
          },
          {
            hop: 'code_runtime',
            from: { entity: 'script' },
            to: { entity: 'runtime' },
            edge: { kind: 'calls' },
            constraints: { targetName: 'StartRoutineWithEvents' },
          },
        ],
      } as any,
    });

    expect(out?.status).toBe('failed');
    expect(out?.evidence_level).toBe('none');
  });

  it('bridges across loader and runtime anchors instead of stopping at the first symbol neighborhood', async () => {
    const out = await verifyRuntimeChainOnDemand({
      repoPath: '/tmp',
      queryText: 'Reload runtime chain',
      symbolName: 'WeaponPowerUp',
      executeParameterized: makeExecuteAnchoredReloadBridge(),
      rule: {
        id: 'demo.m2.multi-anchor.v2',
        version: '2.0.0',
        trigger_family: 'reload',
        resource_types: ['asset'],
        host_base_type: ['WeaponPowerUp'],
        required_hops: ['code_loader', 'code_runtime'],
        guarantees: ['topology_chain_closed'],
        non_guarantees: ['no_runtime_execution'],
        next_action: 'gitnexus query "Reload runtime chain"',
        file_path: '.gitnexus/rules/approved/demo.m2.multi-anchor.v2.yaml',
        topology: [
          {
            hop: 'code_loader',
            from: { entity: 'script' },
            to: { entity: 'script' },
            edge: { kind: 'calls' },
            constraints: { targetName: 'RegisterGraphEvents' },
          },
          {
            hop: 'code_runtime',
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
      } as any,
    });

    expect(out?.status).toBe('verified_full');
    expect(out?.gaps).toHaveLength(0);
    expect(out?.hops.map((hop) => hop.snippet)).toContain('WeaponPowerUp -> RegisterGraphEvents');
    expect(out?.hops.map((hop) => hop.snippet)).toContain('RegisterGraphEvents -> RegisterEvents');
    expect(out?.hops.map((hop) => hop.snippet)).toContain('RegisterEvents -> StartRoutineWithEvents');
  });
});
