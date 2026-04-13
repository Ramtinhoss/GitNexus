export type RuleLabScope = 'full' | 'diff';

export type RuntimeClaimFailureReason =
  | 'rule_not_matched'
  | 'rule_matched_but_evidence_missing'
  | 'rule_matched_but_verification_failed'
  | 'gate_disabled';

export interface RuleLabSlice {
  id: string;
  trigger_family: string;
  resource_types: string[];
  host_base_type: string[];
  required_hops?: string[];
  exact_pairs?: RuleLabExactPair[];
}

export interface RuleLabManifest {
  run_id: string;
  repo_path: string;
  scope: RuleLabScope;
  generated_at: string;
  slices: RuleLabSlice[];
  next_actions: string[];
  stages: string[];
}

export interface RuleLabCandidateHop {
  hop_type: string;
  anchor: string;
  snippet: string;
}

export interface RuleLabCandidate {
  id: string;
  title: string;
  rule_hint?: string;
  proposal_kind?: 'per_anchor_rule' | 'aggregate_rule';
  source_gap_candidate_ids?: string[];
  source_slice_id?: string;
  aggregation_mode?: 'per_anchor_rules' | 'aggregate_single_rule';
  binding_kind?: string;
  draft_rule_id?: string;
  topology?: Array<{
    hop: string;
    from: Record<string, unknown>;
    to: Record<string, unknown>;
    edge: { kind: string };
    constraints?: Record<string, unknown>;
  }>;
  stats?: {
    covered: number;
    total: number;
    conflicts: number;
    coverage_rate: number;
    conflict_rate: number;
  };
  counter_examples?: Array<{
    reason: string;
    missing_hop?: string;
    evidence_anchor?: string;
  }>;
  closure?: {
    required_hops: string[];
    failure_map: Record<string, RuntimeClaimFailureReason | string>;
  };
  claims?: {
    guarantees: string[];
    non_guarantees: string[];
    next_action: string;
  };
  proposal_evidence_keys?: string[];
  exact_pair?: RuleLabExactPair;
  evidence: {
    hops: RuleLabCandidateHop[];
  };
}

export interface RuleLabSourceGapHandoff {
  run_id: string;
  slice_id: string;
  discovery_scope_mode: string;
  user_raw_matches: number;
  processed_user_matches: number;
  accepted_candidate_ids: string[];
  promotion_backlog_count: number;
  reject_buckets: Record<string, number>;
  aggregation_mode: 'per_anchor_rules' | 'aggregate_single_rule';
}

export interface RuleLabSliceWithHandoff extends RuleLabSlice {
  source_gap_handoff?: RuleLabSourceGapHandoff;
}

export interface RuleLabExactPairAnchor {
  file: string;
  line?: number;
  symbol?: string;
}

export interface RuleLabExactPair {
  id?: string;
  binding_kind?: UnityResourceBinding['kind'];
  draft_rule_id?: string;
  source_anchor: RuleLabExactPairAnchor;
  target_anchor: RuleLabExactPairAnchor;
}

export interface RuleDslMatch {
  trigger_tokens: string[];
  symbol_kind?: string[];
  module_scope?: string[];
  resource_types?: string[];
  host_base_type?: string[];
}

export interface RuleDslTopologyHop {
  hop: string;
  from: Record<string, unknown>;
  to: Record<string, unknown>;
  edge: {
    kind: string;
  };
  constraints?: Record<string, unknown>;
}

export interface RuleDslClosure {
  required_hops: string[];
  failure_map: Partial<Record<string, RuntimeClaimFailureReason>>;
}

export interface RuleDslClaims {
  guarantees: string[];
  non_guarantees: string[];
  next_action: string;
}

export interface UnityResourceBinding {
  kind: 'asset_ref_loads_components' | 'method_triggers_field_load' | 'method_triggers_scene_load' | 'method_triggers_method';
  description?: string;
  ref_field_pattern?: string;
  target_entry_points?: string[];
  host_class_pattern?: string;
  field_name?: string;
  loader_methods?: string[];
  scene_name?: string;   // used by method_triggers_scene_load
  // used by method_triggers_method
  source_class_pattern?: string;
  source_method?: string;
  target_class_pattern?: string;
  target_method?: string;
}

export interface LifecycleOverrides {
  additional_entry_points?: string[];
  scope?: string;
}

export interface RuleDslDraft {
  id: string;
  version: string;
  description?: string;
  match: RuleDslMatch;
  topology: RuleDslTopologyHop[];
  closure: RuleDslClosure;
  claims: RuleDslClaims;
  resource_bindings?: UnityResourceBinding[];
  lifecycle_overrides?: LifecycleOverrides;
}
