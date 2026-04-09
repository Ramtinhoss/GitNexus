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
    expect((out as any).decision.recommended_follow_up).toContain('resource_path_prefix=');
    expect((out as any).decision.recommended_follow_up).not.toContain('response_profile=full');
    expect((out as any).decision.recommended_follow_up).not.toBe('follow_next_hop');
    expect(out).toHaveProperty('missing_proof_targets');
    expect(out).toHaveProperty('suggested_context_targets');
    expect((out as any).suggested_context_targets[0]).toMatchObject({
      name: 'WeaponPowerUp',
      uid: 'Class:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:WeaponPowerUp',
      filePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
    });
    expect(typeof (out as any).suggested_context_targets[0].why).toBe('string');
    const uidHint = (out as any).upgrade_hints.find((hint: any) => hint.param_delta?.includes('uid='));
    expect(uidHint?.param_delta).toContain('uid=Class:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:WeaponPowerUp');
    expect(uidHint?.next_command).toContain('--uid "Class:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:WeaponPowerUp"');
    expect((out as any).processes).toBeUndefined();
    expect((out as any).process_symbols).toBeUndefined();
    expect((out as any).definitions).toBeUndefined();
    expect((out as any).next_hops).toBeUndefined();
  });

  it('prefers concrete resource or uid follow-ups over generic follow_next_hop verify deltas', () => {
    const out = buildSlimQueryResult({
      processes: [
        {
          id: 'proc-1',
          summary: 'WeaponPowerUp equip chain',
          confidence: 'low',
          verification_hint: { action: 'verify', target: 'WeaponPowerUp', next_command: 'inspect manually' },
        },
      ],
      process_symbols: [
        {
          id: 'Class:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:WeaponPowerUp',
          name: 'WeaponPowerUp',
          type: 'Class',
          filePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
        },
      ],
      definitions: [],
      next_hops: [
        {
          kind: 'verify',
          target: 'Assets/Other/OffTarget.asset',
          next_command: 'inspect manually',
          why: 'generic verification',
        },
        {
          kind: 'symbol',
          target: 'WeaponPowerUp',
          next_command: 'gitnexus context "WeaponPowerUp"',
          why: 'inspect symbol',
        },
      ],
    } as any, {
      repoName: 'neonspark-core',
      queryText: 'weapon powerup equip chain',
    });

    expect((out as any).decision.recommended_follow_up).toContain('uid=');
    expect((out as any).decision.recommended_follow_up).not.toBe('follow_next_hop');
  });

  it('reranks a seed-affine class anchor above direct-step methods in candidate ordering', () => {
    const out = buildSlimQueryResult({
      processes: [
        { id: 'proc-1', summary: 'weapon flow', confidence: 'high' },
      ],
      process_symbols: [
        {
          id: 'Method:Assets/NEON/Code/Game/PowerUps/ColdWeapon/FirearmsPowerUp.cs:EquipWithEvent',
          name: 'EquipWithEvent',
          type: 'Method',
          filePath: 'Assets/NEON/Code/Game/PowerUps/ColdWeapon/FirearmsPowerUp.cs',
          process_evidence_mode: 'direct_step',
          process_confidence: 'high',
          resourceBindings: [],
        },
        {
          id: 'Class:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:WeaponPowerUp',
          name: 'WeaponPowerUp',
          type: 'Class',
          filePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          process_evidence_mode: 'resource_heuristic',
          process_confidence: 'low',
          resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
        },
      ],
      definitions: [],
      next_hops: [
        {
          kind: 'resource',
          target: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
          why: 'seeded resource',
          next_command: 'gitnexus query ...',
        },
      ],
    } as any, {
      repoName: 'neonspark-core',
      queryText: 'WeaponPowerUp HoldPickup EquipWithEvent Equip',
    });

    expect((out as any).decision.primary_candidate).toBe('WeaponPowerUp');
    expect((out as any).candidates[0].name).toBe('WeaponPowerUp');
  });

  it('reranks an exact query class anchor above heuristic math symbols after narrowing', () => {
    const out = buildSlimQueryResult({
      processes: [
        { id: 'proc-1', summary: 'reload flow', confidence: 'low' },
      ],
      process_symbols: [
        {
          id: 'Class:Assets/NEON/Code/Game/Graph/Nodes/Math/Divide.cs:Divide',
          name: 'Divide',
          type: 'Class',
          filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Math/Divide.cs',
          process_evidence_mode: 'resource_heuristic',
          process_confidence: 'low',
          resourceBindings: [{ resourcePath: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset' }],
        },
      ],
      definitions: [
        {
          id: 'Class:Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs:ReloadBase',
          name: 'ReloadBase',
          type: 'Class',
          filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
          resourceBindings: [],
        },
      ],
      next_hops: [
        {
          kind: 'resource',
          target: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
          why: 'seeded resource',
          next_command: 'gitnexus query ...',
        },
      ],
    } as any, {
      repoName: 'neonspark-core',
      queryText: 'ReloadBase GetValue CheckReload',
    });

    expect((out as any).decision.primary_candidate).toBe('ReloadBase');
    expect((out as any).candidates[0].name).toBe('ReloadBase');
  });

  it('prefers a high-confidence graph-backed process hint over low-confidence heuristic clue in first-screen summary', () => {
    const out = buildSlimQueryResult({
      processes: [
        {
          id: 'proc-low',
          summary: 'runtime heuristic clue',
          confidence: 'low',
          evidence_mode: 'resource_heuristic',
        },
        {
          id: 'proc-high',
          summary: 'Unity-runtime-root → OnAddPowerUp',
          confidence: 'high',
          evidence_mode: 'direct_step',
        },
      ],
      process_symbols: [
        {
          id: 'Method:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:Equip',
          name: 'Equip',
          type: 'Method',
          filePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          process_evidence_mode: 'direct_step',
          process_confidence: 'high',
        },
      ],
      definitions: [],
      next_hops: [
        {
          kind: 'resource',
          target: 'Assets/NEON/DataAssets/Powerups/Startup/init_global.asset',
          next_command: 'gitnexus query "init global"',
          why: 'seeded resource',
        },
      ],
    } as any, {
      repoName: 'neonspark-core',
      queryText: 'Equip InitGlobal OnAddPowerUp',
    });

    expect((out as any).summary).toBe('Unity-runtime-root → OnAddPowerUp');
    expect((out as any).decision.primary_candidate).toBe('Equip');
    expect((out as any).process_hints[0].confidence).toBe('high');
    expect((out as any).decision.recommended_follow_up).toContain('resource_path_prefix=');
    expect((out as any).summary).not.toContain('runtime heuristic clue');
  });

  it('strict anchor locks anchored primary candidate and deterministic follow-up when strict anchor metadata is present', () => {
    const out = buildSlimQueryResult({
      processes: [
        {
          id: 'proc-low',
          summary: 'runtime heuristic clue',
          confidence: 'low',
          evidence_mode: 'resource_heuristic',
        },
      ],
      process_symbols: [
        {
          id: 'Class:Assets/NEON/Code/Game/PowerUps/SoulBringerIceCoreMgrPu.cs:SoulBringerIceCoreMgrPu',
          name: 'SoulBringerIceCoreMgrPu',
          type: 'Class',
          filePath: 'Assets/NEON/Code/Game/PowerUps/SoulBringerIceCoreMgrPu.cs',
          process_evidence_mode: 'resource_heuristic',
          process_confidence: 'low',
        },
      ],
      definitions: [],
      next_hops: [
        {
          kind: 'symbol',
          target: 'SoulBringerIceCoreMgrPu',
          why: 'inspect symbol',
          next_command: 'gitnexus context "SoulBringerIceCoreMgrPu"',
        },
      ],
      decision_context: {
        strict_anchor_mode: true,
        anchor_symbol_name: 'SoulBringerIceCoreMgrPu',
        anchor_resource_path: 'Assets/NEON/DataAssets/Powerups/Boss/SoulBringerIceCoreMgrPu.asset',
      },
    } as any, {
      repoName: 'neonspark-core',
      queryText: 'SoulBringerIceCoreMgrPu',
    });

    expect((out as any).decision.primary_candidate).toBe('SoulBringerIceCoreMgrPu');
    expect((out as any).decision.recommended_follow_up).toContain('resource_path_prefix=');
    expect((out as any).clues?.process_hints).toEqual([]);
    expect((out as any).summary).toBe('SoulBringerIceCoreMgrPu');
    expect((out as any).summary).not.toContain('runtime heuristic clue');
  });

  it('tier envelope exposes facts, closure, and clues with empty clue-tier process hints', () => {
    const out = buildSlimQueryResult({
      processes: [
        {
          id: 'proc-low',
          summary: 'runtime heuristic clue',
          confidence: 'low',
          evidence_mode: 'resource_heuristic',
        },
      ],
      process_symbols: [
        {
          id: 'Class:Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:WeaponPowerUp',
          name: 'WeaponPowerUp',
          type: 'Class',
          filePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
          process_evidence_mode: 'resource_heuristic',
          process_confidence: 'low',
        },
      ],
      definitions: [],
      next_hops: [
        {
          kind: 'resource',
          target: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
          why: 'seeded resource',
          next_command: 'gitnexus query "WeaponPowerUp"',
        },
      ],
    } as any, {
      repoName: 'neonspark-core',
      queryText: 'WeaponPowerUp',
    });

    // facts: graph-backed candidates/processes
    // closure: runtime preview + missing proof targets
    // clues: heuristic hints + manual verification
    expect((out as any).facts).toBeDefined();
    expect((out as any).closure).toBeDefined();
    expect((out as any).clues).toBeDefined();
    expect((out as any).clues.process_hints).toEqual([]);
  });

  it('slim clues.process_hints is always empty after heuristic removal', () => {
    const out = buildSlimQueryResult({
      processes: [{ summary: 'legacy clue', confidence: 'low', evidence_mode: 'resource_heuristic' }],
      process_symbols: [],
      definitions: [],
      next_hops: [],
    } as any, {
      repoName: 'neonspark-core',
      queryText: 'Reload',
    });

    expect((out as any).facts.process_hints.length).toBeGreaterThanOrEqual(0);
    expect((out as any).clues.process_hints).toEqual([]);
  });
});
