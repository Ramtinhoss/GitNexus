export type DiscoveryScopeMode = 'full_user_code' | 'path_prefix_override' | 'module_override';

export interface CandidateAuditRow {
  scopeClass?: string;
  status?: string;
  reasonCode?: string;
}

export interface CandidateAuditInput {
  discoveryScopeMode: DiscoveryScopeMode;
  rows: CandidateAuditRow[];
}

export interface CandidateAuditResult {
  blocked: boolean;
  blockedReason?: 'invalid_default_scope_reason';
  invalidRows: CandidateAuditRow[];
}

const DISALLOWED_DEFAULT_SCOPE_REASONS = new Set([
  'out_of_focus_scope',
  'deferred_non_clue_module',
  'community_mismatch',
  'not_example_chain',
]);

export function auditCandidateRows(input: CandidateAuditInput): CandidateAuditResult {
  if (input.discoveryScopeMode !== 'full_user_code') {
    return { blocked: false, invalidRows: [] };
  }

  const invalidRows = input.rows.filter(
    (row) =>
      row.scopeClass === 'user_code' &&
      row.status === 'rejected' &&
      !!row.reasonCode &&
      DISALLOWED_DEFAULT_SCOPE_REASONS.has(row.reasonCode),
  );

  return {
    blocked: invalidRows.length > 0,
    blockedReason: invalidRows.length > 0 ? 'invalid_default_scope_reason' : undefined,
    invalidRows,
  };
}
