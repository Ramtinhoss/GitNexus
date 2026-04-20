import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/mcp/local/local-backend.js', () => {
  class LocalBackend {
    async init() {
      return true;
    }

    async callTool(_tool: string, params: any) {
      const policy = String(params?.hydration_policy || 'balanced');
      const mode = String(params?.unity_hydration_mode || 'compact');
      const fallbackToCompact = policy === 'strict' && mode === 'compact';
      const requestedMode = policy === 'strict' ? 'parity' : mode;
      const effectiveMode = fallbackToCompact ? 'compact' : requestedMode;
      const status = fallbackToCompact ? 'verified_partial' : 'verified_full';
      const evidenceLevel = fallbackToCompact ? 'verified_segment' : 'verified_chain';

      return {
        runtime_claim: {
          status,
          evidence_level: evidenceLevel,
          verification_core_status: 'verified_full',
          verification_core_evidence_level: 'verified_chain',
          policy_adjusted: fallbackToCompact,
          policy_adjust_reason: fallbackToCompact ? 'strict_fallback_to_compact' : undefined,
        },
        hydrationMeta: {
          requestedMode,
          effectiveMode,
          reason: `mock_${policy}_${mode}`,
          needsParityRetry: fallbackToCompact,
          fallbackToCompact,
          isComplete: !fallbackToCompact,
        },
        missing_evidence: fallbackToCompact ? [{ segment: 'runtime' }] : [],
      };
    }
  }

  return { LocalBackend };
});

vi.mock('../../src/core/config/unity-config.js', () => ({
  resolveUnityConfig: () => ({ config: { parityWarmup: false } }),
}));

import { buildHydrationPolicyRepeatabilityReport } from '../../src/benchmark/u2-e2e/hydration-policy-repeatability-runner.js';

describe('hydration policy repeatability runner', () => {
  it('emits semantic contract fields for strict fallback adjustments', async () => {
    const report = await buildHydrationPolicyRepeatabilityReport({ repoAlias: 'mock-repo', runCount: 2 });

    expect(report.policy_mapping.strict.downgradeOnFallback).toBe('verified_partial/verified_segment');
    expect(report.semantic_contract.coreAdjustedDelta).toBeDefined();
    expect(report.semantic_contract.downgradeOnlyWhenStrictFallback).toBe(true);
  });
});
