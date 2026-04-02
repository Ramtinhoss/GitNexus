import type { RuntimeChainEvidenceLevel } from './runtime-chain-evidence.js';
import type { RuntimeChainGap, RuntimeChainHop, RuntimeChainStatus } from './runtime-chain-verify.js';

export type RuntimeClaimReason =
  | 'rule_not_matched'
  | 'rule_matched_but_evidence_missing'
  | 'rule_matched_but_verification_failed'
  | 'gate_disabled';

export interface RuntimeClaim {
  rule_id: string;
  rule_version: string;
  scope: {
    resource_types: string[];
    host_base_type: string[];
    trigger_family: string;
  };
  status: Exclude<RuntimeChainStatus, 'pending'>;
  evidence_level: RuntimeChainEvidenceLevel;
  guarantees: string[];
  non_guarantees: string[];
  hops: RuntimeChainHop[];
  gaps: RuntimeChainGap[];
  reason?: RuntimeClaimReason;
  next_action?: string;
}

export function buildReloadRuntimeClaim(input: {
  status: Exclude<RuntimeChainStatus, 'pending'>;
  evidence_level: RuntimeChainEvidenceLevel;
  hops: RuntimeChainHop[];
  gaps: RuntimeChainGap[];
  reason?: RuntimeClaimReason;
  next_action?: string;
}): RuntimeClaim {
  const guarantees = input.status === 'verified_full'
    ? ['resource_to_runtime_chain_closed']
    : input.status === 'verified_partial'
      ? ['resource_to_runtime_chain_partially_closed']
      : [];

  return {
    rule_id: 'unity.gungraph.reload.output-getvalue.v1',
    rule_version: '1.0.0',
    scope: {
      resource_types: ['asset', 'prefab', 'meta'],
      host_base_type: ['ReloadBase'],
      trigger_family: 'reload',
    },
    status: input.status,
    evidence_level: input.evidence_level,
    guarantees,
    non_guarantees: [
      'no_runtime_execution',
      'no_dynamic_data_flow_proof',
      'no_state_transition_proof',
    ],
    hops: input.hops,
    gaps: input.gaps,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.next_action ? { next_action: input.next_action } : {}),
  };
}
