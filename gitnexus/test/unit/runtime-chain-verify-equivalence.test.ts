import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyRuntimeChainOnDemand } from '../../src/mcp/local/runtime-chain-verify.js';

describe('runtime-chain-verify mapped resource equivalence', () => {
  it('accepts seed-to-mapped resource equivalence for resource hop verification', async () => {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-mapped-resource-'));
    const out = await verifyRuntimeChainOnDemand({
      repoPath,
      queryText: 'EnergyByAttackCount Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/0_初始武器/1_weapon_0_james_new.asset',
      resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/0_初始武器/1_weapon_0_james_new.asset',
      mappedSeedTargets: ['Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_0_james1.asset'],
      executeParameterized: async () => [],
      resourceBindings: [{ resourcePath: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_0_james1.asset' }],
      rule: {
        id: 'demo.energy.seed-map.v1',
        version: '1.0.0',
        trigger_family: 'energy',
        resource_types: ['asset'],
        host_base_type: ['GunGraphNode'],
        required_hops: ['resource'],
        guarantees: ['seed_mapped_resource_is_accepted'],
        non_guarantees: ['does_not_verify_full_runtime_order'],
        next_action: 'node mapped-resource',
        file_path: '.gitnexus/rules/approved/demo.energy.seed-map.v1.yaml',
      },
    });

    expect(out?.status).toBe('failed');
    expect(out?.evidence_level).toBe('none');

    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('preserves mapped resource equivalence when topology explicitly requires the resource hop', async () => {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-mapped-resource-topology-'));
    const out = await verifyRuntimeChainOnDemand({
      repoPath,
      queryText: 'EnergyByAttackCount Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/0_初始武器/1_weapon_0_james_new.asset',
      resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/0_初始武器/1_weapon_0_james_new.asset',
      mappedSeedTargets: ['Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_0_james1.asset'],
      executeParameterized: async () => [],
      resourceBindings: [{ resourcePath: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_0_james1.asset' }],
      rule: {
        id: 'demo.energy.seed-map.topology.v1',
        version: '1.0.0',
        trigger_family: 'energy',
        resource_types: ['asset'],
        host_base_type: ['GunGraphNode'],
        required_hops: ['resource'],
        guarantees: ['seed_mapped_resource_is_accepted'],
        non_guarantees: ['does_not_verify_full_runtime_order'],
        next_action: 'node mapped-resource',
        file_path: '.gitnexus/rules/approved/demo.energy.seed-map.topology.v1.yaml',
        topology: [
          {
            hop: 'resource',
            from: { entity: 'resource' },
            to: { entity: 'script' },
            edge: { kind: 'binds_script' },
          },
        ],
      } as any,
    });

    expect(out?.status).toBe('failed');
    expect(out?.evidence_level).toBe('none');

    await fs.rm(repoPath, { recursive: true, force: true });
  });
});
