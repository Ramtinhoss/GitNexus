import type { RuntimeChainEvidenceLevel } from './runtime-chain-evidence.js';
import type { RuntimeChainGap, RuntimeChainHop, RuntimeChainStatus } from './runtime-chain-verify.js';
import type { RuntimeClaimRule } from './runtime-claim-rule-registry.js';

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

function resolveNonGuarantees(rule?: RuntimeClaimRule): string[] {
  if (rule && Array.isArray(rule.non_guarantees) && rule.non_guarantees.length > 0) {
    return [...rule.non_guarantees];
  }
  return [
    'no_runtime_execution',
    'no_dynamic_data_flow_proof',
    'no_state_transition_proof',
  ];
}

export function buildRuntimeClaimFromRule(input: {
  rule: RuntimeClaimRule;
  status: Exclude<RuntimeChainStatus, 'pending'>;
  evidence_level: RuntimeChainEvidenceLevel;
  hops: RuntimeChainHop[];
  gaps: RuntimeChainGap[];
  reason?: RuntimeClaimReason;
  next_action?: string;
}): RuntimeClaim {
  const guarantees = input.status === 'verified_full'
    ? [...(input.rule.guarantees || [])]
    : [];

  return {
    rule_id: input.rule.id,
    rule_version: input.rule.version,
    scope: {
      resource_types: [...(input.rule.resource_types || [])],
      host_base_type: [...(input.rule.host_base_type || [])],
      trigger_family: input.rule.trigger_family || 'unknown',
    },
    status: input.status,
    evidence_level: input.evidence_level,
    guarantees,
    non_guarantees: resolveNonGuarantees(input.rule),
    hops: input.hops,
    gaps: input.gaps,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.next_action ? { next_action: input.next_action } : {}),
  };
}

export function buildReloadRuntimeClaim(input: {
  status: Exclude<RuntimeChainStatus, 'pending'>;
  evidence_level: RuntimeChainEvidenceLevel;
  hops: RuntimeChainHop[];
  gaps: RuntimeChainGap[];
  reason?: RuntimeClaimReason;
  next_action?: string;
}): RuntimeClaim {
  return buildRuntimeClaimFromRule({
    rule: {
      id: 'unity.gungraph.reload.output-getvalue.v1',
      version: '1.0.0',
      trigger_family: 'reload',
      resource_types: ['asset', 'prefab', 'meta'],
      host_base_type: ['ReloadBase'],
      required_hops: ['resource', 'guid_map', 'code_loader', 'code_runtime'],
      guarantees: ['resource_to_runtime_chain_closed'],
      non_guarantees: ['no_runtime_execution', 'no_dynamic_data_flow_proof', 'no_state_transition_proof'],
      next_action: input.next_action,
      file_path: '.gitnexus/rules/approved/unity.gungraph.reload.output-getvalue.v1.yaml',
    },
    status: input.status,
    evidence_level: input.evidence_level,
    hops: input.hops,
    gaps: input.gaps,
    reason: input.reason,
    next_action: input.next_action,
  });
}
