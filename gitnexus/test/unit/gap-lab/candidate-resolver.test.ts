import { describe, expect, it } from 'vitest';
import type { LexicalMatch } from '../../../src/gap-lab/exhaustive-scanner.js';
import { resolveLexicalCandidates } from '../../../src/gap-lab/candidate-resolver.js';
import { verifyMissingEdges } from '../../../src/gap-lab/missing-edge-verifier.js';

const baseMatch = (overrides: Partial<LexicalMatch>): LexicalMatch => ({
  gapSubtype: 'mirror_synclist_callback',
  patternId: 'event_delegate.mirror_synclist_callback.v1',
  file: 'Assets/NEON/Code/NetworkCode/NetPlayer.PlayerState.cs',
  line: 100,
  text: 'PlayerStates.Callback += OnPlayerStateChange',
  ...overrides,
});

describe('gap-lab candidate resolver', () => {
  it('resolves handler symbol from callback and syncvar patterns', async () => {
    const matches: LexicalMatch[] = [
      baseMatch({}),
      baseMatch({
        gapSubtype: 'mirror_syncvar_hook',
        patternId: 'event_delegate.mirror_syncvar_hook.v1',
        text: '[SyncVar(hook = nameof(OnDeadChange))] public bool IsDead;',
      }),
    ];

    const out = await resolveLexicalCandidates({ matches });
    expect(out.length).toBe(2);
    expect(out.every((row) => row.status === 'resolved')).toBe(true);
    expect(out.map((row) => row.handlerSymbol)).toEqual(['OnPlayerStateChange', 'OnDeadChange']);
  });

  it('marks unresolved/ambiguous handlers with explicit reason_code', async () => {
    const matches: LexicalMatch[] = [
      baseMatch({ text: 'PlayerStates.Callback += handlers[index]' }),
      baseMatch({ text: 'PlayerStates.Callback +=' }),
    ];

    const out = await resolveLexicalCandidates({ matches });
    expect(out.length).toBe(2);
    expect(out.every((row) => row.status === 'rejected')).toBe(true);
    expect(out.every((row) => row.reasonCode === 'handler_symbol_unresolved')).toBe(true);
  });
});

describe('gap-lab missing-edge verifier', () => {
  it('keeps missing-edge candidates and rejects already-present edges', async () => {
    const resolved = await resolveLexicalCandidates({
      matches: [
        baseMatch({ text: 'PlayerStates.Callback += OnPlayerStateChange' }),
        baseMatch({ text: 'PlayerStates.Callback += OnGunGraphVariableChange' }),
      ],
    });

    const verified = await verifyMissingEdges({
      candidates: resolved,
      edgeLookup: async ({ handlerSymbol }) => handlerSymbol === 'OnGunGraphVariableChange',
    });

    const kept = verified.find((row) => row.handlerSymbol === 'OnPlayerStateChange');
    const rejected = verified.find((row) => row.handlerSymbol === 'OnGunGraphVariableChange');
    expect(kept?.status).toBe('verified_missing');
    expect(kept?.missingEdge).toBe(true);
    expect(rejected?.status).toBe('rejected');
    expect(rejected?.reasonCode).toBe('edge_already_present');
  });
});

