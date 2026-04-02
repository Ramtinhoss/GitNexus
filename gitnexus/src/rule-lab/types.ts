export type RuleLabScope = 'full' | 'diff';

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
