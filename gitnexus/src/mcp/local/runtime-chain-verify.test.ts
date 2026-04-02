import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyRuntimeChainOnDemand, verifyRuntimeClaimOnDemand } from './runtime-chain-verify.js';

async function makeTempRepo(): Promise<string> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-verify-'));
  await fs.mkdir(path.join(repoPath, 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb'), { recursive: true });
  await fs.mkdir(path.join(repoPath, 'Assets/NEON/Graphs/PlayerGun/Gungraph_use'), { recursive: true });
  await fs.mkdir(path.join(repoPath, 'Assets/NEON/Code/Game/Graph/Nodes/Reloads'), { recursive: true });
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset'), 'gungraph: {guid: 69199acacbf8a7e489ad4aa872efcabd}\n');
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset'), 'ResultRPM: GunOutput.RPM\n');
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs.meta'), 'guid: bd387039cacb475381a86f156b54bac2\n');
  await fs.mkdir(path.join(repoPath, 'Assets/NEON/Code/Game/PowerUps'), { recursive: true });
  await fs.mkdir(path.join(repoPath, 'Assets/NEON/Code/Game/Core'), { recursive: true });
  await fs.writeFile(
    path.join(repoPath, 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs'),
    'void Equip() {\n  CurGunGraph = graph;\n}\n',
  );
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/Code/Game/Core/GunGraph.cs'), 'void StartRoutineWithEvents() {}\n');
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs'), 'void GetValue() {}\n');
  return repoPath;
}

describe('runtime chain verify', () => {
  it('v1 runtime chain verify on demand builds reload chain hops', async () => {
    const repoPath = await makeTempRepo();
    const out = await verifyRuntimeChainOnDemand({
      repoPath,
      queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
      executeParameterized: async (query, params) => {
        if (String(params?.filePathPattern || '').includes('WeaponPowerUp.cs')) {
          return [{ filePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs', startLine: 1 }];
        }
        if (String(params?.filePathPattern || '').includes('GunGraph')) {
          return [{ filePath: 'Assets/NEON/Code/Game/Core/GunGraph.cs', startLine: 1 }];
        }
        if (String(params?.filePathPattern || '').includes('ReloadBase.cs')) {
          return [{ filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs', startLine: 1 }];
        }
        return [];
      },
      resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
    });
    expect(out?.evidence_level).toBe('verified_chain');
    expect(out?.hops.some((hop) => hop.hop_type === 'guid_map')).toBe(true);
    const loader = out?.hops.find((hop) => hop.hop_type === 'code_loader');
    expect(loader?.snippet || '').toMatch(/CurGunGraph\s*=/i);
  });

  it('v1 runtime chain gaps are actionable', async () => {
    const out = await verifyRuntimeChainOnDemand({
      repoPath: await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-gaps-')),
      queryText: 'Reload',
      executeParameterized: async () => [],
      resourceBindings: [],
    });
    expect(out?.gaps.length).toBeGreaterThan(0);
    expect(out?.gaps.every((gap) => !!gap.next_command)).toBe(true);
  });

  it('phase2 runtime claim returns explicit rule_not_matched', async () => {
    const out = await verifyRuntimeClaimOnDemand({
      repoPath: path.resolve('.'),
      queryText: 'CompletelyUnrelatedChain',
      executeParameterized: async () => [],
      resourceBindings: [],
      rulesRoot: path.resolve('.gitnexus/rules'),
    });
    expect(out.status).toBe('failed');
    expect(out.reason).toBe('rule_not_matched');
    expect(out.next_action).toBeTruthy();
  });

  it('phase2 runtime claim uses bootstrap reload rule metadata', async () => {
    const repoPath = await makeTempRepo();
    const out = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
      executeParameterized: async (query, params) => {
        if (String(params?.filePathPattern || '').includes('WeaponPowerUp.cs')) {
          return [{ filePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs', startLine: 1 }];
        }
        if (String(params?.filePathPattern || '').includes('GunGraph')) {
          return [{ filePath: 'Assets/NEON/Code/Game/Core/GunGraph.cs', startLine: 1 }];
        }
        if (String(params?.filePathPattern || '').includes('ReloadBase.cs')) {
          return [{ filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs', startLine: 1 }];
        }
        return [];
      },
      resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
      rulesRoot: path.resolve('.gitnexus/rules'),
    });
    expect(out.rule_id).toBe('unity.gungraph.reload.output-getvalue.v1');
    expect(out.rule_version).toBe('1.0.0');
  });
});
