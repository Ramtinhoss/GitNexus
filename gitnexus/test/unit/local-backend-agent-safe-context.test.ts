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
    expect((out as any).serializedFields).toBeUndefined();
    expect((out as any).resourceBindings).toBeUndefined();
    expect((out as any).directIncoming).toBeUndefined();
    expect((out as any).next_hops).toBeUndefined();
  });
});
