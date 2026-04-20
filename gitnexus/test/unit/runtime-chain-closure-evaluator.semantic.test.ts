import { describe, expect, it } from 'vitest';
import { evaluateRuntimeClosure } from '../../src/mcp/local/runtime-chain-closure-evaluator.js';

const nextCommand = 'node gitnexus/dist/cli/index.js query --runtime-chain-verify on-demand "NA2"';

describe('runtime-chain closure evaluator semantic alignment', () => {
  it('anchor: treats anchored method-neighborhood evidence as anchor satisfied', () => {
    const out = evaluateRuntimeClosure({
      symbolName: 'WeaponPowerUp',
      resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
      mappedSeedTargets: ['Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.prefab'],
      resourceBindings: [{
        resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
      }],
      candidates: [{
        sourceId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:HoldPickup',
        sourceName: 'HoldPickup',
        sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        sourceStartLine: 40,
        targetId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:PickItUp',
        targetName: 'PickItUp',
        targetFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        targetStartLine: 51,
        reason: 'unity-rule-method-bridge:unity.weapon-powerup-equip-chain.v2',
      }],
      nextCommand,
    });

    expect(out.segments.anchor).toBe(true);
  });

  it('bind: accepts deterministic seed evidence even when mapped target is not directly bound', () => {
    const out = evaluateRuntimeClosure({
      symbolName: 'WeaponPowerUp',
      resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
      mappedSeedTargets: ['Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.prefab'],
      resourceBindings: [{
        resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
      }],
      candidates: [{
        sourceId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:Equip',
        sourceName: 'Equip',
        sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        sourceStartLine: 78,
        targetId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:ApplyOrbState',
        targetName: 'ApplyOrbState',
        targetFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        targetStartLine: 89,
        reason: 'static-call',
      }],
      nextCommand,
    });

    expect(out.segments.bind).toBe(true);
  });

  it('bridge: requires explicit bridge transitions instead of non-empty candidate list', () => {
    const out = evaluateRuntimeClosure({
      symbolName: 'WeaponPowerUp',
      resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
      resourceBindings: [{
        resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
      }],
      candidates: [{
        sourceId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:PickItUp',
        sourceName: 'PickItUp',
        sourceFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        sourceStartLine: 51,
        targetId: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:Equip',
        targetName: 'Equip',
        targetFilePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        targetStartLine: 78,
        reason: 'static-call',
      }],
      nextCommand,
    });

    expect(out.segments.bridge).toBe(false);
  });
});
