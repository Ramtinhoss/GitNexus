import { describe, expect, it } from 'vitest';
import { deriveRuntimeChainEvidenceLevel } from './runtime-chain-evidence.js';

describe('runtime chain evidence', () => {
  it('returns none when no runtime chain evidence exists', () => {
    expect(deriveRuntimeChainEvidenceLevel({ mode: 'none' })).toBe('none');
  });

  it('returns clue for heuristic-only evidence', () => {
    expect(deriveRuntimeChainEvidenceLevel({ mode: 'heuristic_clue' })).toBe('clue');
  });

  it('returns verified_segment when required segments stop before runtime', () => {
    expect(
      deriveRuntimeChainEvidenceLevel({
        mode: 'verified_hops',
        requiredSegments: ['resource', 'code_loader'],
        foundSegments: ['resource', 'code_loader'],
      }),
    ).toBe('verified_segment');
  });

  it('returns verified_chain when runtime segment is covered', () => {
    expect(
      deriveRuntimeChainEvidenceLevel({
        mode: 'verified_hops',
        requiredSegments: ['resource', 'code_loader', 'code_runtime'],
        foundSegments: ['resource', 'code_loader', 'code_runtime'],
      }),
    ).toBe('verified_chain');
  });
});
