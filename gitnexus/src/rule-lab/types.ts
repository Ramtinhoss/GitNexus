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
  evidence: {
    hops: RuleLabCandidateHop[];
  };
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
  kind: 'asset_ref_loads_components' | 'method_triggers_field_load' | 'method_triggers_scene_load';
  ref_field_pattern?: string;
  target_entry_points?: string[];
  host_class_pattern?: string;
  field_name?: string;
  loader_methods?: string[];
  scene_name?: string;   // used by method_triggers_scene_load
}

export interface LifecycleOverrides {
  additional_entry_points?: string[];
  scope?: string;
}

export interface RuleDslDraft {
  id: string;
  version: string;
  match: RuleDslMatch;
  topology: RuleDslTopologyHop[];
  closure: RuleDslClosure;
  claims: RuleDslClaims;
  resource_bindings?: UnityResourceBinding[];
  lifecycle_overrides?: LifecycleOverrides;
}
