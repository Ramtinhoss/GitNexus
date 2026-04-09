import { describe, expect, it } from 'vitest';
import { buildSlimQueryResult } from '../../src/mcp/local/agent-safe-response.js';

describe('slim query response shaping', () => {
  it('emits candidates/process_hints/resource_hints/decision/upgrade_hints/runtime_preview only', () => {
    const out = buildSlimQueryResult({
      processes: [
        {
          id: 'proc-1',
          summary: 'WeaponPowerUp equip chain',
          confidence: 'medium',
          process_subtype: 'unity_lifecycle',
          verification_hint: { action: 'verify', target: 'WeaponPowerUp', next_command: 'gitnexus context WeaponPowerUp' },
        },
      ],
      process_symbols: [
        {
          id: 'Class:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:WeaponPowerUp',
          name: 'WeaponPowerUp',
          type: 'Class',
          filePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          module: 'PowerUps',
          resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
        },
      ],
      definitions: [],
      next_hops: [
        {
          kind: 'resource',
          target: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
          next_command: 'gitnexus query --unity-resources on "weapon powerup equip chain"',
          why: 'seeded resource',
        },
      ],
      runtime_claim: {
        status: 'verified_partial',
        reason: 'rule_matched_but_evidence_missing',
        next_action: 'gitnexus context WeaponPowerUp',
      },
    } as any, {
      repoName: 'neonspark-core',
      queryText: 'weapon powerup equip chain',
    });

    expect(out).toHaveProperty('candidates');
    expect(out).toHaveProperty('process_hints');
    expect(out).toHaveProperty('resource_hints');
    expect(out).toHaveProperty('decision');
    expect(out).toHaveProperty('upgrade_hints');
    expect(out).toHaveProperty('runtime_preview');
    expect((out as any).processes).toBeUndefined();
    expect((out as any).process_symbols).toBeUndefined();
    expect((out as any).definitions).toBeUndefined();
    expect((out as any).next_hops).toBeUndefined();
  });
});
