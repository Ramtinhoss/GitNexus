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
  evidence: {
    hops: RuleLabCandidateHop[];
  };
}

export interface RuleDslMatch {
  trigger_tokens: string[];
  symbol_kind?: string[];
  module_scope?: string[];
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

export interface RuleDslDraft {
  id: string;
  version: string;
  match: RuleDslMatch;
  topology: RuleDslTopologyHop[];
  closure: RuleDslClosure;
  claims: RuleDslClaims;
}
