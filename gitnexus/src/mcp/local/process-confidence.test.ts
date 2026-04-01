import { describe, expect, it } from 'vitest';
import { buildVerificationHint, deriveConfidence } from './process-confidence.js';
import { deriveRuntimeChainEvidenceLevel } from './runtime-chain-evidence.js';

describe('process confidence', () => {
  it('deriveConfidence returns high for direct static step evidence', () => {
    expect(
      deriveConfidence({ evidenceMode: 'direct_step', processSubtype: 'static_calls' }),
    ).toBe('high');
  });

  it('deriveConfidence downgrades unity lifecycle direct rows to medium', () => {
    expect(
      deriveConfidence({ evidenceMode: 'direct_step', processSubtype: 'unity_lifecycle' }),
    ).toBe('medium');
  });

  it('deriveConfidence returns medium for method projected rows', () => {
    expect(
      deriveConfidence({ evidenceMode: 'method_projected' }),
    ).toBe('medium');
  });

  it('deriveConfidence returns low for resource heuristic rows', () => {
    expect(
      deriveConfidence({ evidenceMode: 'resource_heuristic', hasPartialUnityEvidence: true }),
    ).toBe('low');
  });

  it('buildVerificationHint includes parity retry guidance for low confidence rows', () => {
    const hint = buildVerificationHint({
      confidence: 'low',
      needsParityRetry: true,
      target: 'class:ReloadBase',
    });
    expect(hint).toBeTruthy();
    expect(hint?.action).toBe('rerun_parity_hydration');
    expect(hint?.next_command || '').toMatch(/parity/i);
    expect(hint?.target || '').toMatch(/ReloadBase/i);
  });

  it('runtime chain evidence levels stay independent from process confidence semantics', () => {
    expect(
      deriveConfidence({ evidenceMode: 'method_projected' }),
    ).toBe('medium');
    expect(
      deriveRuntimeChainEvidenceLevel({
        mode: 'verified_hops',
        requiredSegments: ['resource', 'code_loader'],
        foundSegments: ['resource', 'code_loader'],
      }),
    ).toBe('verified_segment');
  });
});
