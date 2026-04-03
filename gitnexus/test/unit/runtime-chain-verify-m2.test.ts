import { describe, expect, it } from 'vitest';
import { verifyRuntimeChainOnDemand } from '../../src/mcp/local/runtime-chain-verify.js';

function makeExecuteParameterized(options?: { omitRuntime?: boolean }) {
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
    expect(out?.hops.find((hop) => hop.hop_type === 'code_loader')?.snippet).toBe('WeaponPowerUp -> Equip');
    expect(out?.hops.find((hop) => hop.hop_type === 'code_runtime')?.snippet).toBe('Equip -> StartRoutineWithEvents');
  });

  it('returns gap-local why_not_next guidance when a required topology hop is missing', async () => {
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

    expect(out?.status).toBe('verified_partial');
    expect(out?.evidence_level).toBe('verified_segment');
    expect(out?.gaps[0]?.segment).toBe('runtime');
    expect(out?.gaps[0]?.reason).toMatch(/code_runtime/i);
    expect((out?.gaps[0] as any)?.why_not_next || '').toMatch(/StartRoutineWithEvents/);
    expect(out?.gaps[0]?.next_command || '').toContain('runtime-chain-verify on-demand');
  });

  it('requires later topology hops to continue from the prior matched call edge', async () => {
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

    expect(out?.status).toBe('verified_partial');
    expect(out?.evidence_level).toBe('verified_segment');
    expect(out?.hops.map((hop) => hop.snippet)).toContain('WeaponPowerUp -> Equip');
    expect(out?.hops.map((hop) => hop.snippet)).not.toContain('RegisterGraphEvents -> StartRoutineWithEvents');
    expect((out?.gaps[0] as any)?.why_not_next || '').toMatch(/after Equip/);
  });
});
