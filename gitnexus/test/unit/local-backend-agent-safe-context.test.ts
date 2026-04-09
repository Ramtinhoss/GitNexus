import { describe, expect, it } from 'vitest';
import { buildSlimContextResult } from '../../src/mcp/local/agent-safe-response.js';

describe('slim context response shaping', () => {
  it('emits slim refs/processes/resource hints and suppresses heavy unity payloads', () => {
    const out = buildSlimContextResult({
      status: 'found',
      symbol: {
        uid: 'Class:Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs:ReloadBase',
        name: 'ReloadBase',
        kind: 'Class',
        filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
      },
      incoming: {
        calls: [{ uid: 'Method:A', name: 'GetValue', filePath: 'Assets/A.cs', kind: 'Method' }],
      },
      outgoing: {
        calls: [{ uid: 'Method:B', name: 'CheckReload', filePath: 'Assets/B.cs', kind: 'Method' }],
      },
      directIncoming: {
        calls: [{ uid: 'Method:A', name: 'GetValue', filePath: 'Assets/A.cs', kind: 'Method' }],
      },
      directOutgoing: {
        calls: [{ uid: 'Method:B', name: 'CheckReload', filePath: 'Assets/B.cs', kind: 'Method' }],
      },
      processes: [
        {
          id: 'proc-1',
          name: 'Reload flow',
          confidence: 'medium',
          verification_hint: { action: 'verify', target: 'ReloadBase', next_command: 'gitnexus context ReloadBase' },
        },
      ],
      resourceBindings: [{ resourcePath: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset' }],
      serializedFields: { scalarFields: [{ name: 'a' }], referenceFields: [{ name: 'b' }] },
      next_hops: [
        {
          kind: 'resource',
          target: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
          next_command: 'gitnexus query "reload getvalue checkreload"',
          why: 'seeded resource',
        },
      ],
    } as any, {
      repoName: 'neonspark-core',
      symbolName: 'ReloadBase',
    });

    expect(out).toHaveProperty('symbol');
    expect(out).toHaveProperty('incoming');
    expect(out).toHaveProperty('outgoing');
    expect(out).toHaveProperty('processes');
    expect(out).toHaveProperty('resource_hints');
    expect(out).toHaveProperty('verification_hint');
    expect(out).toHaveProperty('upgrade_hints');
    expect(out).toHaveProperty('missing_proof_targets');
    expect(out).toHaveProperty('suggested_context_targets');
    expect((out as any).suggested_context_targets[0]).toMatchObject({
      name: 'ReloadBase',
      uid: 'Class:Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs:ReloadBase',
      filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
    });
    expect(typeof (out as any).suggested_context_targets[0].why).toBe('string');
    const uidHint = (out as any).upgrade_hints.find((hint: any) => hint.param_delta?.includes('uid='));
    expect(uidHint?.param_delta).toContain('uid=Class:Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs:ReloadBase');
    expect(uidHint?.next_command).toContain('--uid "Class:Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs:ReloadBase"');
    expect((out as any).serializedFields).toBeUndefined();
    expect((out as any).resourceBindings).toBeUndefined();
    expect((out as any).directIncoming).toBeUndefined();
    expect((out as any).next_hops).toBeUndefined();
  });

  it('keeps clue-tier process rows but does not promote them to top summary/default reading', () => {
    const out = buildSlimContextResult({
      status: 'found',
      symbol: {
        uid: 'Class:Assets/NEON/Code/Game/Core/GameBootstrap.cs:GameBootstrap',
        name: 'GameBootstrap',
        kind: 'Class',
        filePath: 'Assets/NEON/Code/Game/Core/GameBootstrap.cs',
      },
      incoming: {},
      outgoing: {},
      processes: [
        {
          id: 'proc-low',
          name: 'runtime heuristic clue',
          confidence: 'low',
          evidence_mode: 'resource_heuristic',
        },
        {
          id: 'proc-high',
          name: 'Unity-runtime-root → InitGlobal',
          confidence: 'high',
          evidence_mode: 'direct_step',
        },
      ],
      next_hops: [
        {
          kind: 'resource',
          target: 'Assets/NEON/DataAssets/Powerups/Startup/init_global.asset',
          next_command: 'gitnexus query "InitGlobal"',
          why: 'seeded resource',
        },
      ],
    } as any, {
      repoName: 'neonspark-core',
      symbolName: 'GameBootstrap',
    });

    expect((out as any).summary).toBe('Unity-runtime-root → InitGlobal');
    expect((out as any).processes[0].confidence).toBe('high');
    expect((out as any).summary).not.toContain('runtime heuristic clue');
    expect((out as any).processes.some((row: any) => row.summary === 'runtime heuristic clue')).toBe(true);
  });

  it('strict anchor keeps process summary selection based on process score', () => {
    const out = buildSlimContextResult({
      status: 'found',
      symbol: {
        uid: 'Class:Assets/NEON/Code/Game/PowerUps/SoulBringerIceCoreMgrPu.cs:SoulBringerIceCoreMgrPu',
        name: 'SoulBringerIceCoreMgrPu',
        kind: 'Class',
        filePath: 'Assets/NEON/Code/Game/PowerUps/SoulBringerIceCoreMgrPu.cs',
      },
      incoming: {},
      outgoing: {},
      processes: [
        {
          id: 'proc-low',
          name: 'runtime heuristic clue',
          confidence: 'low',
          evidence_mode: 'resource_heuristic',
        },
      ],
      decision_context: {
        strict_anchor_mode: true,
        anchor_symbol_name: 'SoulBringerIceCoreMgrPu',
        anchor_resource_path: 'Assets/NEON/DataAssets/Powerups/Boss/SoulBringerIceCoreMgrPu.asset',
      },
    } as any, {
      repoName: 'neonspark-core',
      symbolName: 'SoulBringerIceCoreMgrPu',
    });

    expect((out as any).summary).toBe('runtime heuristic clue');
    expect((out as any).processes[0].evidence_mode).toBe('resource_heuristic');
    expect((out as any).clues.process_hints).toEqual([]);
  });

  it('tier envelope exposes facts, closure, and clues in slim context output', () => {
    const out = buildSlimContextResult({
      status: 'found',
      symbol: {
        uid: 'Class:Assets/NEON/Code/Game/Core/GameBootstrap.cs:GameBootstrap',
        name: 'GameBootstrap',
        kind: 'Class',
        filePath: 'Assets/NEON/Code/Game/Core/GameBootstrap.cs',
      },
      incoming: {},
      outgoing: {},
      processes: [
        {
          id: 'proc-low',
          name: 'runtime heuristic clue',
          confidence: 'low',
          evidence_mode: 'resource_heuristic',
        },
      ],
      next_hops: [
        {
          kind: 'resource',
          target: 'Assets/NEON/DataAssets/Powerups/Startup/init_global.asset',
          next_command: 'gitnexus query "InitGlobal"',
          why: 'seeded resource',
        },
      ],
    } as any, {
      repoName: 'neonspark-core',
      symbolName: 'GameBootstrap',
    });

    // facts: graph-backed symbol and relation buckets
    // closure: runtime preview + missing proof targets
    // clues: resource hints + manual verification
    expect((out as any).facts).toBeDefined();
    expect((out as any).closure).toBeDefined();
    expect((out as any).clues).toBeDefined();
    expect((out as any).clues.process_hints).toEqual([]);
  });

  it('slim context clues.process_hints is always empty after heuristic removal', () => {
    const out = buildSlimContextResult({
      status: 'found',
      symbol: {
        uid: 'Class:Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs:ReloadBase',
        name: 'ReloadBase',
        kind: 'Class',
        filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
      },
      incoming: {},
      outgoing: {},
      processes: [{ name: 'legacy clue', confidence: 'low', evidence_mode: 'resource_heuristic' }],
      next_hops: [],
    } as any, {
      repoName: 'neonspark-core',
      symbolName: 'ReloadBase',
    });

    expect((out as any).facts.process_hints.length).toBeGreaterThanOrEqual(0);
    expect((out as any).clues.process_hints).toEqual([]);
  });
});
