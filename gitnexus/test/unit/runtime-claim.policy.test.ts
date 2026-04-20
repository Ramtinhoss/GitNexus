import { describe, expect, it } from 'vitest';
import { adjustRuntimeClaimForPolicy, type RuntimeClaim } from '../../src/mcp/local/runtime-claim.js';

function makeClaim(): RuntimeClaim {
  return {
    rule_id: 'demo.reload.v1',
    rule_version: '1.0.0',
    scope: {
      resource_types: ['asset'],
      host_base_type: ['ReloadBase'],
      trigger_family: 'reload',
    },
    status: 'verified_full',
    evidence_level: 'verified_chain',
    guarantees: ['resource_to_runtime_chain_closed'],
    non_guarantees: ['no_runtime_execution'],
    hops: [{ hop_type: 'code_runtime', anchor: 'Assets/A.cs:12', confidence: 'high', note: 'runtime edge' }],
    gaps: [],
  };
}

describe('adjustRuntimeClaimForPolicy', () => {
  it('downgrades strict fallback verified_full to verified_partial/verified_segment', () => {
    const out = adjustRuntimeClaimForPolicy({
      claim: makeClaim(),
      hydrationPolicy: 'strict',
      fallbackToCompact: true,
    });

    expect(out.verification_core_status).toBe('verified_full');
    expect(out.verification_core_evidence_level).toBe('verified_chain');
    expect(out.status).toBe('verified_partial');
    expect(out.evidence_level).toBe('verified_segment');
    expect(out.policy_adjusted).toBe(true);
    expect(out.policy_adjust_reason).toBe('strict_fallback_to_compact');
  });

  it('keeps balanced fallback verified_full unchanged', () => {
    const out = adjustRuntimeClaimForPolicy({
      claim: makeClaim(),
      hydrationPolicy: 'balanced',
      fallbackToCompact: true,
    });

    expect(out.verification_core_status).toBe('verified_full');
    expect(out.verification_core_evidence_level).toBe('verified_chain');
    expect(out.status).toBe('verified_full');
    expect(out.evidence_level).toBe('verified_chain');
    expect(out.policy_adjusted).toBe(false);
    expect(out.policy_adjust_reason).toBeUndefined();
  });
});
